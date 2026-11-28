// Ferramentas do vendedor virtual (função pura sobre dados injetados: sem banco, sem rede).
// O modelo só enxerga o que `paraModelo` devolve, e isso NUNCA traz preço, frete, prazo ou percentual:
// esses valores viram CARTÕES escritos pelo servidor (V3.1, 7.3 camada 1).
import { z } from 'zod';
import { isToolAllowed } from '../../aiToolGuard';
import { normalizarTexto, verificarTextoComercial } from '../conteudo';
import { referenciaMlVigente, type SalesAgente, type SalesDisponibilidade, type SalesReferenciaML } from '../../../../shared/sales';
import type { Acao, Card, OpcaoFreteCard } from './tipos';
import { mascararCep, normalizarCep } from './texto';

// ── Contratos injetados ──────────────────────────────────────────────────────────────────────
export interface OpcaoFrete { serviceId: string; name: string; company: string; price: number; days: string }
export interface CotacaoFrete { source: 'api' | 'static'; options: OpcaoFrete[] }

export interface KbMin { kind: string; key: string; title: string; content: string }

export interface ContextoFerramentas {
  agente: SalesAgente;
  disponibilidade: SalesDisponibilidade;
  simuladorAtivo: boolean;
  referenciaMl: SalesReferenciaML;
  /** Somente itens APROVADOS. */
  kb: KbMin[];
  produto: { nome: string; precoCentavos: number };
  cotarFrete(cep: string, quantidadeCaixas: number): Promise<CotacaoFrete>;
  /** Marcado pelo VISITANTE na tela. O modelo não tem como alterar. */
  consentimentoUi: boolean;
  contatoUi?: { nome: string; empresa: string; email: string } | null;
  cepVisitante: string | null;
  agora: Date;
  urlLanding: string;
  /** Estado mutável de UM turno. */
  memoria: { freteCentavos?: number };
}

export interface ResultadoFerramenta {
  ok: boolean;
  /** Único conteúdo que volta ao modelo. Sem valores críticos. */
  paraModelo: unknown;
  cards: Card[];
  acoes: Acao[];
  resumo: string;
}

// ── Formatação (servidor escreve os números) ────────────────────────────────────────────────
export function formatarReais(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const inteiro = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${inteiro},${cent}`;
}

/**
 * `shipping.calculate` aceita no máximo 100 kg (`quantity` = caixas × 10). Acima de 10 caixas o frete não
 * é cotável pelo site: o pedido vai para uma pessoa (exceção `pedido_grande`), por código.
 */
export const MAX_CAIXAS_COTACAO = 10;

/** A partir de quantas caixas o pedido vai para uma pessoa: o menor entre o painel e o teto da cotação. */
export function caixasParaEncaminhar(a: Pick<SalesAgente, 'caixasParaEncaminhar'>): number {
  return Math.min(a.caixasParaEncaminhar, MAX_CAIXAS_COTACAO + 1);
}

export const AVISO_COTACAO = 'Cotação válida no momento da consulta; o valor final é confirmado no checkout.';
export const AVISO_SIMULADOR = 'Simulação com os números informados. Não é promessa de lucro nem de venda.';
export const TEXTO_SEM_POLITICA = 'Não temos essa informação aprovada; posso chamar um atendente.';
export const TEXTO_CONTATO_REGISTRADO = 'Contato registrado. Uma pessoa da equipe Sal Vita vai responder você por e-mail.';

// ── Fórmula do simulador de revenda (V3.1): tudo em centavos inteiros ───────────────────────
export interface EntradaSimulacao { caixaCentavos: number; freteCentavos: number; despesasCentavos: number; revendaPorPacoteCentavos: number }
export interface SaidaSimulacao { custoTotalCentavos: number; custoPorPacoteCentavos: number; receitaCentavos: number; resultadoCentavos: number }

/** custo total = caixa + frete + despesas; custo por pacote = total / 10; resultado = revenda × 10 − custo total. */
export function simularRevenda(e: EntradaSimulacao): SaidaSimulacao {
  const custoTotalCentavos = e.caixaCentavos + e.freteCentavos + e.despesasCentavos;
  const receitaCentavos = e.revendaPorPacoteCentavos * 10;
  return {
    custoTotalCentavos,
    custoPorPacoteCentavos: Math.round(custoTotalCentavos / 10),
    receitaCentavos,
    resultadoCentavos: receitaCentavos - custoTotalCentavos,
  };
}

function paraCentavos(reais: number): number {
  return Math.round(reais * 100);
}

// ── Esquemas dos argumentos (zod) ───────────────────────────────────────────────────────────
const caixas = z.number().int().min(1).max(100_000);

export const ESQUEMAS = {
  consultar_produto: z.object({ tema: z.string().max(80).optional() }).strict(),
  consultar_preco: z.object({}).strict(),
  consultar_disponibilidade: z.object({}).strict(),
  cotar_frete: z.object({ cep: z.string().max(20), quantidadeCaixas: caixas }).strict(),
  comparar_canais: z.object({ cep: z.string().max(20).optional(), quantidadeCaixas: caixas }).strict(),
  simular_revenda: z.object({
    precoRevendaPorPacote: z.number().min(0).max(10_000),
    frete: z.number().min(0).max(100_000).optional(),
    despesas: z.number().min(0).max(100_000).optional(),
  }).strict(),
  montar_pedido: z.object({ quantidadeCaixas: caixas }).strict(),
  politica_comercial: z.object({ tema: z.string().min(1).max(80) }).strict(),
  // Os campos são aceitos (o modelo pode repeti-los) mas IGNORADOS: o contato do opt-in vem só do
  // formulário que o visitante preencheu na tela (ctx.contatoUi). Nada de consentimento aqui (estrito).
  registrar_contato: z.object({
    nome: z.string().max(200).optional(),
    empresa: z.string().max(200).optional(),
    email: z.string().max(200).optional(),
  }).strict(),
  chamar_atendente: z.object({ motivo: z.string().trim().min(1).max(300) }).strict(),
} as const;

export type NomeFerramenta = keyof typeof ESQUEMAS;

type Spec = { type: 'function'; function: { name: NomeFerramenta; description: string; parameters: Record<string, unknown> } };

const spec = (name: NomeFerramenta, description: string, properties: Record<string, unknown>, required: string[] = []): Spec => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

/** Lista fechada de ferramentas oferecidas ao modelo neste turno (camada 5: allow-list). */
export function ferramentasOferecidas(ctx: Pick<ContextoFerramentas, 'simuladorAtivo'>): Spec[] {
  const lista: Spec[] = [
    spec('consultar_produto', 'Fatos aprovados sobre o produto (origem, processo, sabor). Pode filtrar por tema.', { tema: { type: 'string' } }),
    spec('consultar_preco', 'Mostra ao visitante o cartão de preço da caixa de 10 kg. Os valores são escritos pelo servidor.', {}),
    spec('consultar_disponibilidade', 'Mostra o cartão de disponibilidade informado pela equipe.', {}),
    spec('cotar_frete', 'Cota frete e prazo. Se o visitante já informou o CEP, passe cep="informado". Os valores aparecem em um cartão.',
      { cep: { type: 'string' }, quantidadeCaixas: { type: 'integer' } }, ['cep', 'quantidadeCaixas']),
    spec('comparar_canais', 'Compara o total no site (caixa + frete) com a referência do Mercado Livre. Nunca declara vencedor.',
      { cep: { type: 'string' }, quantidadeCaixas: { type: 'integer' } }, ['quantidadeCaixas']),
    spec('montar_pedido', 'Entrega o link e as instruções para finalizar a compra. Nunca leva preço no link.',
      { quantidadeCaixas: { type: 'integer' } }, ['quantidadeCaixas']),
    spec('politica_comercial', 'Política comercial aprovada (troca, pagamento, entrega...). Sem item aprovado, não há resposta.',
      { tema: { type: 'string' } }, ['tema']),
    spec('registrar_contato', 'Registra o contato que o visitante preencheu no formulário da tela (nome, empresa, e-mail) para uma pessoa da equipe responder por e-mail. Sem argumentos. Só funciona se o visitante marcou a caixa de consentimento na tela.', {}),
    spec('chamar_atendente', 'Passa a conversa para uma pessoa da Sal Vita.', { motivo: { type: 'string' } }, ['motivo']),
  ];
  if (ctx.simuladorAtivo) {
    lista.push(spec('simular_revenda', 'Simula o resultado de revender uma caixa, com o preço de revenda por pacote informado pelo visitante. O resultado vai em um cartão.',
      { precoRevendaPorPacote: { type: 'number' }, frete: { type: 'number' }, despesas: { type: 'number' } }, ['precoRevendaPorPacote']));
  }
  return lista;
}

const falha = (resumo: string, paraModelo: unknown): ResultadoFerramenta => ({ ok: false, paraModelo, cards: [], acoes: [], resumo });

function encaminhaGrande(ctx: ContextoFerramentas, q: number): ResultadoFerramenta {
  return {
    ok: true,
    paraModelo: { encaminhado: true, instrucao: 'Pedido grande: uma pessoa da Sal Vita assume. Não cote nem negocie valores.' },
    cards: [],
    acoes: [{ tipo: 'excecao', kind: 'pedido_grande', severity: 'alta', motivo: `Pedido de ${q} caixas (limite ${caixasParaEncaminhar(ctx.agente)})`, quantidadeCaixas: q }],
    resumo: `pedido_grande:${q}`,
  };
}

function opcoesParaCard(op: OpcaoFrete[]): OpcaoFreteCard[] {
  return [...op].sort((a, b) => a.price - b.price).slice(0, 4).map((o) => {
    const c = paraCentavos(o.price);
    return { nome: `${o.company ? `${o.company} ` : ''}${o.name}`.trim(), precoCentavos: c, precoTexto: formatarReais(c), prazo: o.days };
  });
}

function dataBr(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function tokens(tema: string): string[] {
  return normalizarTexto(tema).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

function casaTema(item: KbMin, tema: string): boolean {
  const alvo = normalizarTexto(`${item.key} ${item.title} ${item.content}`);
  return tokens(tema).some((t) => alvo.includes(t));
}

async function cotar(ctx: ContextoFerramentas, cepBruto: string | undefined, q: number): Promise<{ cep: string; cot: CotacaoFrete } | { erro: ResultadoFerramenta }> {
  // O CEP válido é o que o VISITANTE digitou (o servidor o extraiu do texto). O argumento do modelo
  // não é fonte: o modelo nem vê o número, e um CEP inventado por ele nunca pode virar cotação.
  const cep = ctx.cepVisitante && normalizarCep(ctx.cepVisitante) ? ctx.cepVisitante : null;
  void cepBruto;
  if (!cep) {
    return { erro: falha('cep_invalido', { erro: 'cep_invalido', instrucao: 'Não há CEP válido (8 dígitos). Peça ao visitante o CEP de entrega.' }) };
  }
  try {
    const cot = await ctx.cotarFrete(cep, q);
    if (!cot.options.length) throw new Error('sem opções');
    return { cep, cot };
  } catch {
    return { erro: falha('frete_indisponivel', { erro: 'frete_indisponivel', instrucao: 'Não consegui cotar agora. Ofereça chamar um atendente.' }) };
  }
}

async function executarValidado(nome: NomeFerramenta, args: unknown, ctx: ContextoFerramentas): Promise<ResultadoFerramenta> {
  switch (nome) {
    case 'consultar_produto': {
      const a = ESQUEMAS.consultar_produto.parse(args);
      let itens = ctx.kb.filter((i) => i.kind === 'produto' && verificarTextoComercial(`${i.title} ${i.content}`).ok);
      if (a.tema) {
        const filtrados = itens.filter((i) => casaTema(i, a.tema as string));
        if (filtrados.length) itens = filtrados;
      }
      if (!itens.length) {
        return { ok: true, paraModelo: { itens: [], instrucao: 'Sem fatos de produto aprovados. Diga que pode cotar o frete e chamar um atendente.' }, cards: [], acoes: [], resumo: 'produto:0' };
      }
      return { ok: true, paraModelo: { itens: itens.slice(0, 6).map((i) => ({ titulo: i.title, conteudo: i.content.slice(0, 1200) })) }, cards: [], acoes: [], resumo: `produto:${itens.length}` };
    }
    case 'consultar_preco': {
      ESQUEMAS.consultar_preco.parse(args);
      const c = ctx.produto.precoCentavos;
      return {
        ok: true,
        paraModelo: { cartaoExibido: 'preco', instrucao: 'O servidor mostrou o preço em um cartão. Não escreva valores.' },
        cards: [{ tipo: 'preco', produto: ctx.produto.nome, precoCentavos: c, precoTexto: formatarReais(c), nota: 'Preço por caixa, frete à parte. O valor final é confirmado no checkout.' }],
        acoes: [], resumo: 'preco',
      };
    }
    case 'consultar_disponibilidade': {
      ESQUEMAS.consultar_disponibilidade.parse(args);
      const d = ctx.disponibilidade;
      let texto: string;
      if (d.status === 'disponivel') texto = `Disponibilidade informada pela equipe${d.atualizadoEm ? ` em ${dataBr(d.atualizadoEm)}` : ''}: disponível. A confirmação final é feita no pedido.`;
      else if (d.status === 'em_falta') texto = `Disponibilidade informada pela equipe${d.atualizadoEm ? ` em ${dataBr(d.atualizadoEm)}` : ''}: em falta no momento. Posso chamar um atendente.`;
      else texto = 'Disponibilidade: não informado. Um atendente confirma antes de fechar o pedido.';
      return {
        ok: true,
        paraModelo: { status: d.status === 'nao_informado' ? 'nao_informado' : d.status, instrucao: 'O servidor mostrou a disponibilidade em um cartão. Não afirme estoque nem prazo de reposição.' },
        cards: [{ tipo: 'disponibilidade', texto }], acoes: [], resumo: `disponibilidade:${d.status}`,
      };
    }
    case 'cotar_frete': {
      const a = ESQUEMAS.cotar_frete.parse(args);
      if (a.quantidadeCaixas >= caixasParaEncaminhar(ctx.agente)) return encaminhaGrande(ctx, a.quantidadeCaixas);
      const r = await cotar(ctx, a.cep, a.quantidadeCaixas);
      if ('erro' in r) return r.erro;
      const opcoes = opcoesParaCard(r.cot.options);
      ctx.memoria.freteCentavos = opcoes[0]?.precoCentavos;
      return {
        ok: true,
        paraModelo: { cartaoExibido: 'frete', instrucao: 'O servidor mostrou as opções de frete e prazo em um cartão. Não escreva valores nem prazos.' },
        cards: [{ tipo: 'frete', cepMascarado: mascararCep(r.cep), quantidadeCaixas: a.quantidadeCaixas, opcoes, nota: AVISO_COTACAO }],
        acoes: [], resumo: `frete:${a.quantidadeCaixas}cx:${r.cot.source}`,
      };
    }
    case 'comparar_canais': {
      const a = ESQUEMAS.comparar_canais.parse(args);
      if (a.quantidadeCaixas >= caixasParaEncaminhar(ctx.agente)) return encaminhaGrande(ctx, a.quantidadeCaixas);
      const r = await cotar(ctx, a.cep, a.quantidadeCaixas);
      if ('erro' in r) return r.erro;
      const opcoes = opcoesParaCard(r.cot.options);
      const frete = opcoes[0];
      ctx.memoria.freteCentavos = frete.precoCentavos;
      const produto = ctx.produto.precoCentavos * a.quantidadeCaixas;
      const ref = ctx.referenciaMl;
      const mlRef = referenciaMlVigente(ref, ctx.agora) && ref.precoCentavos !== null && ref.conferidoEm
        ? `Referência do anúncio: ${formatarReais(ref.precoCentavos)} por caixa, conferida em ${dataBr(ref.conferidoEm)}. Pode ter mudado.`
        : null;
      return {
        ok: true,
        paraModelo: { cartaoExibido: 'comparativo', instrucao: 'O servidor mostrou a comparação. Não escreva valores, não diga qual canal é melhor e não fale do frete do Mercado Livre: ele não foi consultado.' },
        cards: [{
          tipo: 'comparativo', quantidadeCaixas: a.quantidadeCaixas,
          site: { produtoTexto: formatarReais(produto), freteTexto: formatarReais(frete.precoCentavos), totalTexto: formatarReais(produto + frete.precoCentavos), servico: frete.nome },
          mercadoLivre: { freteTexto: 'frete não consultado', referenciaTexto: mlRef },
          nota: `Comparação informativa, sem recomendação de canal. Frete do site: opção mais barata. ${AVISO_COTACAO}`,
        }],
        acoes: [], resumo: `comparar:${a.quantidadeCaixas}cx`,
      };
    }
    case 'simular_revenda': {
      const a = ESQUEMAS.simular_revenda.parse(args);
      if (!ctx.simuladorAtivo) return falha('simulador_desligado', { erro: 'simulador_desligado' });
      const informado = a.frete !== undefined;
      const freteCent = informado ? paraCentavos(a.frete as number) : ctx.memoria.freteCentavos;
      if (freteCent === undefined) {
        return falha('frete_necessario', { erro: 'frete_necessario', instrucao: 'Faltam o CEP e a quantidade para cotar o frete (ou o visitante pode informar o frete). Peça o CEP.' });
      }
      const s = simularRevenda({
        caixaCentavos: ctx.produto.precoCentavos, freteCentavos: freteCent,
        despesasCentavos: paraCentavos(a.despesas ?? 0), revendaPorPacoteCentavos: paraCentavos(a.precoRevendaPorPacote),
      });
      return {
        ok: true,
        paraModelo: { cartaoExibido: 'simulacao', instrucao: 'O servidor mostrou a simulação. Não repita valores e não prometa lucro.' },
        cards: [{
          tipo: 'simulacao',
          linhas: [
            { rotulo: 'Caixa de 10 kg', valor: formatarReais(ctx.produto.precoCentavos) },
            { rotulo: informado ? 'Frete (informado por você)' : 'Frete (cotado agora)', valor: formatarReais(freteCent) },
            { rotulo: 'Outras despesas (informado por você)', valor: formatarReais(paraCentavos(a.despesas ?? 0)) },
            { rotulo: 'Custo total', valor: formatarReais(s.custoTotalCentavos) },
            { rotulo: 'Custo por pacote de 1 kg', valor: formatarReais(s.custoPorPacoteCentavos) },
            { rotulo: 'Revenda por pacote (informado por você)', valor: formatarReais(paraCentavos(a.precoRevendaPorPacote)) },
            { rotulo: 'Receita com 10 pacotes', valor: formatarReais(s.receitaCentavos) },
          ],
          resultadoTexto: formatarReais(s.resultadoCentavos), resultadoPositivo: s.resultadoCentavos >= 0, aviso: AVISO_SIMULADOR,
        }],
        acoes: [], resumo: 'simulacao',
      };
    }
    case 'montar_pedido': {
      const a = ESQUEMAS.montar_pedido.parse(args);
      if (a.quantidadeCaixas >= caixasParaEncaminhar(ctx.agente)) return encaminhaGrande(ctx, a.quantidadeCaixas);
      // A landing (SalVitaLanding) só lê ?cupom= e UTM: não aceita produto/quantidade por URL. Link simples + passos.
      const instrucoes = [
        'Abra a página e role até "Preço".',
        'Escolha a "Caixa Sal Vita Premium" (10 kg, 10 embalagens de 1 kg).',
        'Informe o CEP para ver o frete e finalize o pedido.',
      ];
      if (a.quantidadeCaixas > 1) instrucoes.push(`O pedido pelo site é de uma caixa por vez. Para ${a.quantidadeCaixas} caixas, repita o pedido ou peça ao atendente.`);
      return {
        ok: true,
        paraModelo: { cartaoExibido: 'link', instrucao: 'O servidor mostrou o botão com as instruções. Não escreva valores.' },
        cards: [{ tipo: 'link', url: ctx.urlLanding, rotulo: 'Ir para a página de compra', instrucoes }],
        acoes: [], resumo: `pedido:${a.quantidadeCaixas}cx`,
      };
    }
    case 'politica_comercial': {
      const a = ESQUEMAS.politica_comercial.parse(args);
      const achados = ctx.kb.filter((i) => i.kind === 'politica' && casaTema(i, a.tema) && verificarTextoComercial(`${i.title} ${i.content}`).ok);
      if (!achados.length) return { ok: true, paraModelo: { texto: TEXTO_SEM_POLITICA }, cards: [], acoes: [], resumo: 'politica:0' };
      return { ok: true, paraModelo: { itens: achados.slice(0, 3).map((i) => ({ titulo: i.title, conteudo: i.content.slice(0, 1200) })) }, cards: [], acoes: [], resumo: `politica:${achados.length}` };
    }
    case 'registrar_contato': {
      ESQUEMAS.registrar_contato.parse(args);
      // Consentimento só vem do flag da interface. O modelo não tem parâmetro para isso.
      if (!ctx.consentimentoUi) {
        return falha('sem_consentimento', { registrado: false, motivo: 'consentimento_nao_marcado', instrucao: 'O visitante não marcou a caixa de consentimento na tela. Peça que marque; você não pode marcá-la por ele.' });
      }
      // Dados de contato SÓ do formulário da tela, digitados pelo visitante. O modelo nunca fornece o
      // e-mail do opt-in (um e-mail inventado ou de terceiro viraria consentimento falso).
      const ui = ctx.contatoUi;
      const v = z.object({ nome: z.string().trim().min(2).max(120), empresa: z.string().trim().min(2).max(160), email: z.string().trim().email().max(200) })
        .safeParse({ nome: ui?.nome, empresa: ui?.empresa, email: ui?.email });
      if (!v.success) return falha('contato_incompleto', { registrado: false, motivo: 'contato_incompleto', instrucao: 'Peça ao visitante para preencher nome, empresa e e-mail no formulário da tela; você não pode preencher por ele.' });
      return {
        ok: true, paraModelo: { registrado: true },
        cards: [{ tipo: 'aviso', texto: TEXTO_CONTATO_REGISTRADO }],
        acoes: [{ tipo: 'opt_in', nome: v.data.nome, empresa: v.data.empresa, email: v.data.email.toLowerCase() }], resumo: 'contato',
      };
    }
    case 'chamar_atendente': {
      const a = ESQUEMAS.chamar_atendente.parse(args);
      return {
        ok: true, paraModelo: { encaminhado: true },
        cards: [],
        acoes: [{ tipo: 'excecao', kind: 'pediu_pessoa', severity: 'normal', motivo: a.motivo }], resumo: 'atendente',
      };
    }
  }
}

/** Valida allow-list e argumentos; nunca lança: erro vira resultado para o modelo. */
export async function executarFerramenta(
  nome: unknown, argsBrutos: unknown, ctx: ContextoFerramentas, oferecidas: ReadonlyArray<{ function?: { name?: string } }>,
): Promise<ResultadoFerramenta> {
  if (!isToolAllowed(nome, oferecidas as { function?: { name?: string } }[]) || typeof nome !== 'string' || !(nome in ESQUEMAS)) {
    return falha('nao_permitida', { erro: 'Ferramenta não permitida.' });
  }
  try {
    return await executarValidado(nome as NomeFerramenta, argsBrutos ?? {}, ctx);
  } catch (e) {
    if (e instanceof z.ZodError) return falha(`args_invalidos:${nome}`, { erro: 'argumentos_invalidos', instrucao: 'Confira os argumentos e peça ao visitante o dado que falta.' });
    return falha(`erro:${nome}`, { erro: 'falha_interna', instrucao: 'Não consegui consultar agora. Ofereça chamar um atendente.' });
  }
}
