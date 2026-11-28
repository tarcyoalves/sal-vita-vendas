// Camada de IO do vendedor virtual: banco (sales_agent_*), cadeia de IA, exceções e opt-in.
// Toda decisão de conteúdo está em pipeline.ts / ferramentas.ts (puros e testados); aqui só se liga o que
// é externo. Camadas 7 (limites), 8 (formulário) e 9 (registro de tudo) vivem aqui.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { ordersDb } from '../../../db/ordersDb';
import { salesAgentConversations, salesAgentMessages, salesOptIns } from '../../../db/schema';
import { OPT_IN_TEXT, OPT_IN_TEXT_VERSION } from '../../../../shared/sales';
import { cadeiaConfigurada, chamarComFerramentas, chamarLLM, executarNaCadeia } from '../../aiChain';
import { STORE_URL } from '../../storeUrl';
import { removerDadosPessoais } from '../conteudo';
import { registrarExcecao } from '../excecoes';
import { getSalesSettings } from '../settings';
import { listarKbAprovada } from './kb';
import { cotarFreteCaixas, produtoCaixa } from './frete';
import { consentimentoDaInterface, decidirLimites, deveEscalarBloqueios, expiraEm, hashVisitante } from './limites';
import { executarTurno, type DepsTurno, type ResultadoPipeline } from './pipeline';
import { extrairCep, higienizarVisitante, ocultarCep } from './texto';
import type { Acao, Card, PerfilAgente } from './tipos';
import type { ContextoFerramentas } from './ferramentas';

export const MAX_CHARS_MENSAGEM = 800;
export const URL_ATACADO_FORM = '/atacado#contato';
export const TEXTO_FORMULARIO = 'No momento o atendimento virtual não está disponível. Deixe seus dados no formulário e a equipe da Sal Vita responde você.';

export interface EntradaChat {
  conversationId?: string;
  mensagem: string;
  consentimentoResumo?: boolean;
  contato?: { nome: string; empresa: string; email: string };
}
export interface SaidaChat {
  conversationId: string;
  modo: 'chat' | 'formulario';
  mensagem: string;
  cards: Card[];
  encaminhado?: boolean;
}
export interface MetaVisitante { ip: string; userAgent: string }

const SEM_CARDS: Card[] = [];

function formulario(conversationId: string, mensagem = TEXTO_FORMULARIO): SaidaChat {
  return { conversationId, modo: 'formulario', mensagem, cards: SEM_CARDS };
}

export async function estadoPublico(): Promise<{ ativo: boolean; maxCaracteres: number; saudacao: string; textoConsentimento: string; versaoConsentimento: string; aviso: string }> {
  let ativo = false;
  try { ativo = (await getSalesSettings()).agente.ativo && cadeiaConfigurada(); } catch { ativo = false; }
  return {
    ativo,
    maxCaracteres: MAX_CHARS_MENSAGEM,
    saudacao: 'Olá! Sou o assistente virtual da Sal Vita (uma IA, não uma pessoa). Posso cotar frete e explicar a caixa de 10 kg do Sal Vita Premium. Você compra para revender ou para usar no seu negócio?',
    textoConsentimento: OPT_IN_TEXT.resumo_conversa,
    versaoConsentimento: OPT_IN_TEXT_VERSION,
    aviso: 'As mensagens são guardadas por 90 dias para atendimento e melhoria do serviço. Não envie dados pessoais além dos pedidos aqui.',
  };
}

// ── Cadeia de IA ─────────────────────────────────────────────────────────────────────────────
function depsProducao(verificacaoSemantica: boolean): DepsTurno {
  return {
    async completar({ mensagens, tools, executar, permitida, reiniciar }) {
      const r = await executarNaCadeia(
        (cfg, prazo) => {
          reiniciar();
          return chamarComFerramentas(cfg, prazo, mensagens, tools, { maxTokens: 600, maxRodadas: 4, executar, permitida });
        },
        { label: 'sales-agente', prazoMs: 40_000 },
      );
      return r.text;
    },
    verificarSemantica: verificacaoSemantica ? verificarSemanticaIa : undefined,
  };
}

const PROMPT_VERIFICADOR = [
  'Você é um revisor de conformidade de textos comerciais de sal de cozinha.',
  'Responda APENAS um JSON {"violacao": boolean, "motivo": string}.',
  'violacao = true se o texto faz alegação de saúde, efeito no corpo, hidratação, composição (ex.: número de minerais, "sem aditivos", "natural"), certificação,',
  'ou promete desconto, prazo ou estoque. Texto neutro sobre origem, processo, sabor, textura ou pedido de dados = false.',
].join(' ');

async function verificarSemanticaIa(texto: string): Promise<{ violacao: boolean; motivo: string }> {
  const r = await executarNaCadeia(
    (cfg, prazo) => chamarLLM(cfg, prazo, [
      { role: 'system', content: PROMPT_VERIFICADOR },
      { role: 'user', content: `Texto a revisar:\n"""${texto.slice(0, 1500)}"""` },
    ], 120, 0),
    { label: 'sales-agente-verif', prazoMs: 10_000 },
  );
  const t = r.text.trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('verificador: saída inválida');
  const j = JSON.parse(t.slice(a, b + 1)) as { violacao?: unknown; motivo?: unknown };
  if (typeof j.violacao !== 'boolean') throw new Error('verificador: saída inválida');
  return { violacao: j.violacao, motivo: typeof j.motivo === 'string' ? j.motivo : '' };
}

// ── Persistência ─────────────────────────────────────────────────────────────────────────────
type Conversa = typeof salesAgentConversations.$inferSelect;

async function carregarConversa(id: string | undefined, visitorHash: string, agora: Date): Promise<Conversa | null> {
  if (!id) return null;
  const [c] = await ordersDb.select().from(salesAgentConversations).where(eq(salesAgentConversations.id, id)).limit(1);
  // Id de outra pessoa (ou conversa vencida) nunca é retomado: vira conversa nova.
  if (!c || c.visitorHash !== visitorHash) return null;
  if (c.expiresAt && c.expiresAt.getTime() < agora.getTime()) return null;
  return c;
}

async function registrar(conversationId: string, linhas: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string; toolPayload?: unknown; blocked?: boolean; blockReason?: string }>): Promise<void> {
  if (!linhas.length) return;
  await ordersDb.insert(salesAgentMessages).values(linhas.map((l) => ({
    conversationId, role: l.role, content: l.content.slice(0, 4000), toolName: l.toolName ?? null,
    toolPayload: l.toolPayload ?? null, blocked: l.blocked ?? false, blockReason: l.blockReason?.slice(0, 500) ?? null,
  })));
}

/** Argumentos de ferramenta vão para o registro; e-mail e nome do contato NÃO (ficam só em sales_opt_ins). */
function argsParaRegistro(nome: string, args: unknown): unknown {
  return nome === 'registrar_contato' ? { campos: args && typeof args === 'object' ? Object.keys(args) : [] } : args;
}

async function executarAcoes(acoes: Acao[], conversa: { id: string; perfil: PerfilAgente | null }, a: { consentimento: boolean; ipHash: string; contato?: EntradaChat['contato'] }): Promise<{ falhouEncaminhamento: boolean }> {
  let falhouEncaminhamento = false;
  for (const ac of acoes) {
    try {
      if (ac.tipo === 'excecao') {
        const handoff = ac.kind === 'pedido_grande' || ac.kind === 'pediu_pessoa';
        const contato = a.consentimento && a.contato ? ` Contato informado: ${a.contato.nome}, ${a.contato.empresa}, ${a.contato.email}.` : '';
        const titulos: Record<string, string> = {
          pedido_grande: `Vendedor virtual: pedido grande${ac.quantidadeCaixas ? ` (${ac.quantidadeCaixas} caixas)` : ''}`,
          pediu_pessoa: 'Vendedor virtual: visitante pediu uma pessoa',
          pergunta_sensivel: 'Vendedor virtual: pergunta sobre saúde/composição',
        };
        await registrarExcecao({
          idempotencyKey: `agente:${ac.kind}:${conversa.id}`,
          kind: ac.kind, severity: ac.severity,
          title: titulos[ac.kind] ?? `Vendedor virtual: ${ac.kind}`,
          detail: `${ac.motivo}. Perfil: ${conversa.perfil ?? 'indefinido'}. Conversa ${conversa.id} (veja no painel Sales AI).${contato}`,
          conversationId: conversa.id,
          createdBy: 'agente',
          criarTarefaCrm: handoff
            ? { titulo: titulos[ac.kind] ?? 'Vendedor virtual: atendimento', descricao: `${ac.motivo}. Conversa ${conversa.id} no painel Sales AI.${contato}`, prioridade: ac.severity === 'alta' ? 'high' : 'medium' }
            : null,
        });
        if (handoff) {
          await ordersDb.update(salesAgentConversations).set({ status: 'handed_off' }).where(eq(salesAgentConversations.id, conversa.id));
        }
      } else if (ac.tipo === 'opt_in' && a.consentimento) {
        const [ja] = await ordersDb.select({ id: salesOptIns.id }).from(salesOptIns).where(and(
          eq(salesOptIns.email, ac.email), eq(salesOptIns.scope, 'resumo_conversa'), isNull(salesOptIns.revokedAt),
          sql`${salesOptIns.proof}->>'conversationId' = ${conversa.id}`,
        )).limit(1);
        if (!ja) {
          await ordersDb.insert(salesOptIns).values({
            email: ac.email, scope: 'resumo_conversa', consentVersion: OPT_IN_TEXT_VERSION, consentText: OPT_IN_TEXT.resumo_conversa,
            source: 'agente', proof: { conversationId: conversa.id, ipHash: a.ipHash },
          });
        }
        await ordersDb.update(salesAgentConversations).set({ contactEmail: ac.email, companyName: ac.empresa.slice(0, 160) })
          .where(eq(salesAgentConversations.id, conversa.id));
      }
    } catch (e) {
      console.error('[sales-agente] ação falhou:', ac.tipo, e instanceof Error ? e.message : 'erro');
      if (ac.tipo === 'excecao' && (ac.kind === 'pedido_grande' || ac.kind === 'pediu_pessoa')) falhouEncaminhamento = true;
    }
  }
  return { falhouEncaminhamento };
}

// ── Turno completo ───────────────────────────────────────────────────────────────────────────
export async function conversar(entrada: EntradaChat, meta: MetaVisitante, agora: Date = new Date(), deps?: DepsTurno): Promise<SaidaChat> {
  const idEntrada = entrada.conversationId ?? '';
  let s;
  try { s = await getSalesSettings(); } catch { return formulario(idEntrada); }
  if (!s.agente.ativo) return formulario(idEntrada);
  const segredo = process.env.JWT_SECRET;
  if (!segredo || !cadeiaConfigurada()) return formulario(idEntrada);

  const visitorHash = hashVisitante(meta.ip, meta.userAgent, segredo);
  const consentimento = consentimentoDaInterface(entrada.consentimentoResumo);

  const existente = await carregarConversa(entrada.conversationId, visitorHash, agora);
  let conversasNas24h = 0;
  if (!existente) {
    const [{ n }] = await ordersDb.select({ n: sql<number>`count(*)::int` }).from(salesAgentConversations)
      .where(gte(salesAgentConversations.startedAt, new Date(agora.getTime() - 86_400_000)));
    conversasNas24h = n;
  }
  const limite = decidirLimites(s.agente, existente ? existente.messageCount : null, conversasNas24h);
  if (!limite.permitido) return formulario(existente?.id ?? idEntrada);

  const conversaId = existente?.id ?? randomUUID();
  if (!existente) {
    await ordersDb.insert(salesAgentConversations).values({ id: conversaId, visitorHash, status: 'open', startedAt: agora, lastAt: agora, expiresAt: expiraEm(agora) });
  }

  // Histórico mínimo: últimas mensagens não bloqueadas; o CEP vive só no registro do visitante.
  const recentes = (await ordersDb.select().from(salesAgentMessages).where(eq(salesAgentMessages.conversationId, conversaId))
    .orderBy(desc(salesAgentMessages.id)).limit(24)).reverse();
  const historico = recentes
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.blocked)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  let cepAnterior: string | null = null;
  for (const m of [...recentes].reverse()) {
    const p = m.toolPayload as { cep?: unknown } | null;
    if (m.role === 'user' && p && typeof p.cep === 'string') { cepAnterior = p.cep; break; }
  }

  const textoLimpo = higienizarVisitante(entrada.mensagem, MAX_CHARS_MENSAGEM);
  const cepTurno = extrairCep(textoLimpo);
  const textoGravado = removerDadosPessoais(ocultarCep(textoLimpo));
  await registrar(conversaId, [{ role: 'user', content: textoGravado, toolPayload: cepTurno ? { cep: cepTurno } : null }]);

  const [kb, produto] = await Promise.all([listarKbAprovada(), produtoCaixa()]);
  const ctx: ContextoFerramentas = {
    agente: s.agente, disponibilidade: s.disponibilidade, simuladorAtivo: s.simuladorRevenda.ativo,
    referenciaMl: s.referenciaMercadoLivre,
    kb: kb.map((i) => ({ kind: i.kind, key: i.key, title: i.title, content: i.content })),
    produto, cotarFrete: cotarFreteCaixas,
    consentimentoUi: consentimento, contatoUi: entrada.contato ?? null,
    cepVisitante: null, agora, urlLanding: `${STORE_URL}/sal-vita#preco`, memoria: {},
  };

  const r: ResultadoPipeline = await executarTurno({
    textoVisitante: textoLimpo,
    historico,
    primeiraResposta: existente ? existente.messageCount === 0 : true,
    perfilAnterior: (existente?.profile === 'revenda' || existente?.profile === 'consumo') ? existente.profile : null,
    cepAnterior,
    ctx,
  }, deps ?? depsProducao(s.agente.verificacaoSemantica));

  if (r.modo === 'formulario') {
    await registrar(conversaId, [{ role: 'tool', content: `modo formulário: ${r.motivo}`, toolName: 'ia_indisponivel' }]);
    await ordersDb.update(salesAgentConversations).set({ lastAt: agora, messageCount: sql`${salesAgentConversations.messageCount} + 1` })
      .where(eq(salesAgentConversations.id, conversaId));
    return formulario(conversaId);
  }

  // Camada 9: tudo registrado. Texto bloqueado fica guardado COM a marca de bloqueio; o que o visitante viu vem depois.
  await registrar(conversaId, [
    ...r.ferramentas.map((f) => ({ role: 'tool' as const, content: f.resumo, toolName: f.nome, toolPayload: { args: argsParaRegistro(f.nome, f.args), ok: f.ok } })),
    ...r.bloqueios.map((b) => ({ role: 'assistant' as const, content: b.textoOriginal, blocked: true, blockReason: `${b.camada}: ${b.motivo}` })),
    { role: 'assistant' as const, content: r.mensagem, toolPayload: { cards: r.cards } },
  ]);

  const graves = r.bloqueios.filter((b) => b.grave);
  await ordersDb.update(salesAgentConversations).set({
    lastAt: agora,
    messageCount: sql`${salesAgentConversations.messageCount} + 1`,
    ...(r.perfil === 'revenda' || r.perfil === 'consumo' ? { profile: r.perfil } : {}),
    ...(r.bloqueios.length ? { flagged: true, flagReason: r.bloqueios.map((b) => b.camada).join(',').slice(0, 200) } : {}),
  }).where(eq(salesAgentConversations.id, conversaId));

  if (graves.length) {
    const [{ n }] = await ordersDb.select({ n: sql<number>`count(*)::int` }).from(salesAgentMessages).where(and(
      eq(salesAgentMessages.conversationId, conversaId), eq(salesAgentMessages.blocked, true),
      sql`(${salesAgentMessages.blockReason} like 'trava_conteudo:%' or ${salesAgentMessages.blockReason} like 'semantica_violacao:%')`,
    ));
    if (deveEscalarBloqueios(n)) {
      try {
        await registrarExcecao({
          idempotencyKey: `agente:alegacao_barrada:${conversaId}`, kind: 'alegacao_barrada', severity: 'alta',
          title: 'Vendedor virtual: respostas barradas repetidas',
          detail: `${n} respostas do modelo foram barradas pelas travas de conteúdo na conversa ${conversaId}. Revise no painel Sales AI.`,
          conversationId: conversaId, createdBy: 'agente',
        });
      } catch (e) { console.error('[sales-agente] exceção alegacao_barrada falhou:', e instanceof Error ? e.message : 'erro'); }
    }
  }

  const { falhouEncaminhamento } = await executarAcoes(r.acoes, { id: conversaId, perfil: r.perfil }, { consentimento: consentimento, ipHash: visitorHash, contato: entrada.contato });
  if (falhouEncaminhamento) {
    return formulario(conversaId, 'Não consegui avisar a equipe agora. Deixe seus dados no formulário e uma pessoa da Sal Vita entra em contato.');
  }
  return { conversationId: conversaId, modo: 'chat', mensagem: r.mensagem, cards: r.cards, encaminhado: r.encaminhado || undefined };
}
