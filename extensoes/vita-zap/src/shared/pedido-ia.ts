// "Pedir à IA" (v0.7.57): regras PURAS. Sem rede, sem DOM, sem chrome.
//
// O dono escreve um pedido em português ("filtre os clientes que eu mandei mensagem perguntando sobre estoque e não
// respondeu"). Passo 1: o servidor devolve um PLANO estruturado que o dono confirma/edita (período, quem falou por último,
// se o cliente respondeu, assunto, termos do nome). Passo 2: a extensão escolhe as conversas candidatas pela lista (datas
// do período, sem grupo, sem "Não enviar mais"), LÊ cada uma (só leitura) e a IA diz se corresponde. O resultado é uma lista
// para REVISÃO: nada sai sozinho daqui. Mensagens saem só pelo Executor das campanhas, depois de prévia aprovada.
//
// Limite do WhatsApp Web: só guarda cerca de 25 a 40 dias de histórico; pedidos mais antigos não acham conversa.

import type { ContatoVarrido } from './contatos';
import { diferencaDias, somarDias, type DataIso } from './datas';
import type { MensagemLida } from './mensagens';
import { nomeTemTermo, normalizarTexto } from './nomes';

export const PERIODO_MIN = 1;
export const PERIODO_MAX = 60;
export const PERIODO_PADRAO = 30;
/** Conversas por chamada à IA (o servidor aceita 20; o resto da extensão usa 10). */
export const LOTE_CONFERENCIA = 10;
/** Quantas conversas uma rodada abre para ler (as de data mais recente primeiro). */
export const MAX_LEITURAS_PEDIDO = 40;
/** Uma leitura mais velha que isto não serve de base para enviar mensagem (a conversa pode ter mudado). */
export const VALIDADE_LEITURA_PEDIDO_MS = 12 * 3_600_000;
export const MAX_PEDIDOS_SALVOS = 20;
export const MAX_PEDIDO_TEXTO = 600;
export const MAX_ASSUNTO = 200;
export const MAX_TERMOS_NOME = 5;
export const DIAS_AGENDAR_PADRAO = 7;
export const DIAS_AGENDAR_MIN = 1;
export const DIAS_AGENDAR_MAX = 120;

export const AVISO_HISTORICO =
  'O WhatsApp Web só guarda cerca de 25 a 40 dias de conversa: o que for mais antigo que isso não aparece aqui (o histórico completo fica só no celular).';

export type QuemFalou = 'eu' | 'cliente' | 'tanto_faz';
export type Confianca = 'alta' | 'media' | 'baixa';

export const ROTULO_QUEM: Record<QuemFalou, string> = { eu: 'eu falei por último', cliente: 'o cliente falou por último', tanto_faz: 'tanto faz' };
export const ROTULO_RESPONDEU: Record<'sim' | 'nao' | 'tanto_faz', string> = { sim: 'o cliente respondeu', nao: 'o cliente NÃO respondeu', tanto_faz: 'tanto faz' };

export interface PlanoPedido {
  periodoDias: number;
  quemFalouPorUltimo: QuemFalou;
  /** O cliente respondeu à mensagem do assunto? null = tanto faz. */
  respondeu: boolean | null;
  /** O que procurar, do ponto de vista do dono ("perguntei sobre estoque"). */
  assunto: string;
  /** O nome do contato precisa conter TODOS estes termos. */
  termosNomeContato: string[];
}

export interface PedidoInterpretado {
  plano: PlanoPedido;
  /** Perguntas do servidor quando o pedido é ambíguo: o dono responde (edita o plano) antes de rodar. */
  perguntas: string[];
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** Plano coerente e dentro dos limites. "Não respondeu" implica que o último a falar fui eu. */
export function normalizarPlano(p: Partial<{ periodoDias: unknown; quemFalouPorUltimo: unknown; respondeu: unknown; assunto: unknown; termosNomeContato: unknown }>): PlanoPedido {
  const dias = typeof p.periodoDias === 'number' && Number.isFinite(p.periodoDias) ? p.periodoDias : PERIODO_PADRAO;
  const periodoDias = Math.min(PERIODO_MAX, Math.max(PERIODO_MIN, Math.round(dias)));
  const respondeu = typeof p.respondeu === 'boolean' ? p.respondeu : null;
  let quem: QuemFalou = p.quemFalouPorUltimo === 'eu' || p.quemFalouPorUltimo === 'cliente' ? p.quemFalouPorUltimo : 'tanto_faz';
  if (respondeu === false) quem = 'eu';
  const assunto = typeof p.assunto === 'string' ? p.assunto.replace(/\s+/g, ' ').trim().slice(0, MAX_ASSUNTO) : '';
  return { periodoDias, quemFalouPorUltimo: quem, respondeu, assunto, termosNomeContato: normalizarTermos(p.termosNomeContato) };
}

/** "padaria, central" (texto do campo) ou lista → até 5 termos únicos de 2 a 40 caracteres. */
export function normalizarTermos(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const saida: string[] = [];
  for (const t of bruto) {
    const limpo = t.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (limpo.length >= 2 && !saida.some((x) => normalizarTexto(x) === normalizarTexto(limpo))) saida.push(limpo);
    if (saida.length >= MAX_TERMOS_NOME) break;
  }
  return saida;
}

/** Lê o plano da resposta do servidor. Fora do contrato (sem objeto) → null. */
export function planoDoServidor(bruto: unknown): PedidoInterpretado | null {
  const o = obj(bruto);
  if (Object.keys(o).length === 0) return null;
  const plano = normalizarPlano(o);
  const perguntas = Array.isArray(o.perguntas) ? o.perguntas.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 200)).slice(0, 3) : [];
  return { plano, perguntas };
}

/** Por que este plano não pode rodar? Lista vazia = pode. */
export function errosDoPlano(p: PlanoPedido): string[] {
  const erros: string[] = [];
  if (p.assunto.trim().length < 3) erros.push('diga o assunto que você quer encontrar (ex.: "perguntei sobre estoque")');
  if (!Number.isInteger(p.periodoDias) || p.periodoDias < PERIODO_MIN || p.periodoDias > PERIODO_MAX) erros.push(`o período vai de ${PERIODO_MIN} a ${PERIODO_MAX} dias`);
  if (p.respondeu === false && p.quemFalouPorUltimo !== 'eu') erros.push('"o cliente não respondeu" só combina com "eu falei por último"');
  return erros;
}

/** O plano em uma frase, para o dono conferir antes de rodar. */
export function descreverPlano(p: PlanoPedido): string {
  const partes = [`Conversas dos últimos ${p.periodoDias} dia(s)`];
  if (p.termosNomeContato.length > 0) partes.push(`com ${p.termosNomeContato.map((t) => `"${t}"`).join(' e ')} no nome`);
  if (p.respondeu === false) partes.push('em que eu falei por último e o cliente não respondeu');
  else {
    if (p.quemFalouPorUltimo !== 'tanto_faz') partes.push(`em que ${ROTULO_QUEM[p.quemFalouPorUltimo]}`);
    if (p.respondeu === true) partes.push('e o cliente respondeu');
  }
  return `${partes.join(', ')}, sobre: ${p.assunto || '(assunto em branco)'}.`;
}

// ── Candidatas (lista da varredura) ─────────────────────────────────────────

export interface ContextoBusca {
  hoje: DataIso;
  /** Chaves marcadas "Não enviar mais" (ou "Não é cliente"). */
  naoEnviar: ReadonlySet<string>;
  /** Os termos do nome casam por palavra inteira (v0.7.63). Ausente = pedaço do texto (comportamento antigo). */
  palavraInteira?: boolean;
}

export interface Candidatas {
  /** Quem será lido, da conversa mais recente para a mais antiga (no máximo MAX_LEITURAS_PEDIDO). */
  candidatos: ContatoVarrido[];
  /** Candidatos que passaram do limite de leituras da rodada. */
  cortados: number;
  /** Fora, por motivo (para o dono saber por que alguém não apareceu). */
  fora: Array<[string, number]>;
}

/**
 * Quem entra na busca. Regras de público da política: nunca "Não enviar mais", nunca grupo (nem "possível grupo"), nunca só
 * número, nunca nome repetido (a conversa certa seria ambígua), nunca sem data certa. Pré-filtro BARATO por quem falou
 * por último (o ícone da última mensagem na lista): só descarta quando a lista SABE (true/false); desconhecido é lido.
 */
export function candidatosDoPedido(contatos: ReadonlyArray<ContatoVarrido>, plano: PlanoPedido, ctx: ContextoBusca): Candidatas {
  const desde = somarDias(ctx.hoje, -plano.periodoDias);
  const termos = plano.termosNomeContato.filter((t) => normalizarTexto(t) !== '');
  const quem = plano.respondeu === false ? 'eu' : plano.quemFalouPorUltimo;
  const motivos = new Map<string, number>();
  const fora = (m: string) => motivos.set(m, (motivos.get(m) ?? 0) + 1);
  const dentro: ContatoVarrido[] = [];
  for (const c of contatos) {
    if (ctx.naoEnviar.has(c.chave)) fora('marcado "Não enviar mais"');
    else if (c.soNumero) fora('só número (não salvo na agenda)');
    else if (c.pareceGrupo || c.possivelGrupo) fora('grupo ou possível grupo');
    else if (!c.temConversa) fora('sem conversa (só agenda)');
    else if (c.duplicado) fora('mais de uma conversa com este nome');
    else if (c.ultimaConversa == null) fora('data da última conversa incerta (varra de novo)');
    else if (diferencaDias(c.ultimaConversa, desde) < 0 || diferencaDias(c.ultimaConversa, ctx.hoje) > 0) fora(`última conversa fora dos últimos ${plano.periodoDias} dias`);
    else if (termos.length > 0 && !termos.every((t) => nomeTemTermo(c.nome, t, ctx.palavraInteira === true))) fora('o nome não tem os termos pedidos');
    else if (quem === 'eu' && c.ultimaDeMim === false) fora('a lista mostra o cliente falando por último');
    else if (quem === 'cliente' && c.ultimaDeMim === true) fora('a lista mostra você falando por último');
    else dentro.push(c);
  }
  dentro.sort((a, b) => (b.ultimaConversa ?? '').localeCompare(a.ultimaConversa ?? '') || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    candidatos: dentro.slice(0, MAX_LEITURAS_PEDIDO),
    cortados: Math.max(0, dentro.length - MAX_LEITURAS_PEDIDO),
    fora: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/**
 * Regras baratas do plano sobre a conversa LIDA (espelha o servidor): o código decide, antes de gastar IA.
 * Devolve o motivo da recusa, ou null se a conversa segue para a IA.
 */
export function recusaPeloPlano(mensagens: ReadonlyArray<Pick<MensagemLida, 'de'>>, plano: Pick<PlanoPedido, 'quemFalouPorUltimo' | 'respondeu'>): string | null {
  if (mensagens.length === 0) return 'sem mensagens para conferir';
  const ultima = mensagens[mensagens.length - 1];
  const doCliente = mensagens.some((m) => m.de === 'cliente');
  const minhas = mensagens.some((m) => m.de === 'eu');
  const quem = plano.respondeu === false ? 'eu' : plano.quemFalouPorUltimo;
  if (quem === 'eu' && ultima.de !== 'eu') return 'o cliente falou por último';
  if (quem === 'cliente' && ultima.de !== 'cliente') return 'você falou por último';
  if (plano.respondeu === false && !minhas) return 'você não mandou mensagem nesta conversa';
  if (plano.respondeu === true && !doCliente) return 'o cliente não respondeu';
  return null;
}

// ── IA: conferência ─────────────────────────────────────────────────────────

export interface ConversaParaPedido {
  /** Id opaco do lote ("c1", "c2"...): NÃO é nome, telefone nem id do contato. */
  ref: string;
  primeiroNome: string;
  mensagens: Array<{ de: 'eu' | 'cliente'; texto: string; quando?: string }>;
}

export interface ConferenciaIa {
  ref: string;
  corresponde: boolean;
  motivo: string;
  confianca: Confianca;
  pediuParaSair: boolean;
  revisar: boolean;
}

/** Item da resposta do servidor. Qualquer coisa fora do contrato → null (quem chama trata como "revisar"). */
export function conferenciaDoServidor(bruto: unknown): ConferenciaIa | null {
  const o = obj(bruto);
  if (typeof o.ref !== 'string' || typeof o.corresponde !== 'boolean') return null;
  const confianca: Confianca = o.confianca === 'alta' || o.confianca === 'media' ? o.confianca : 'baixa';
  return {
    ref: o.ref,
    corresponde: o.corresponde,
    motivo: typeof o.motivo === 'string' ? o.motivo.slice(0, 300) : '',
    confianca,
    pediuParaSair: o.pediuParaSair === true,
    revisar: o.revisar === true,
  };
}

// ── Resultado para revisão ──────────────────────────────────────────────────

/** 'aberto' = esperando você; os outros já tiveram uma ação. */
export type EstadoItemPedido = 'aberto' | 'na_campanha' | 'agendado' | 'nao_enviar' | 'ignorado';

export interface TravaDoItem {
  tipo: 'livre' | 'agendado' | 'indisponivel';
  /** ISO do agendamento (tipo 'agendado'). */
  ate?: string;
  motivo?: string;
}

export interface ItemPedido {
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Data da última conversa (da lista). */
  ultimaConversa: DataIso | null;
  /** A IA disse que corresponde. */
  corresponde: boolean;
  /** Não deu para ler/conferir (identidade da conversa, IA, formato): o dono olha a conversa. */
  revisar: boolean;
  motivo: string;
  confianca: Confianca;
  pediuParaSair: boolean;
  trava: TravaDoItem;
  /** Marcado para a ação em lote. Confiança baixa e "revisar" nascem desmarcados. */
  marcado: boolean;
  estado: EstadoItemPedido;
  /** Quando a conversa foi lida (ISO). */
  lidoEm: string;
  atualizadoEm: string;
}

export interface ResultadoPedido {
  id: string;
  texto: string;
  plano: PlanoPedido;
  rodadaEm: string;
  candidatos: number;
  lidas: number;
  /** Lidas que o plano/IA descartaram (não correspondem). */
  descartadas: number;
  /** Candidatos que não deu para conferir (parou antes do fim, IA fora). */
  semConferir: number;
  cortados: number;
  fora: Array<[string, number]>;
  avisos: string[];
  itens: ItemPedido[];
}

export interface PedidoSalvo {
  id: string;
  texto: string;
  plano: PlanoPedido | null;
  usadoEm: string;
  vezes: number;
}

export interface EstadoPedidos {
  salvos: PedidoSalvo[];
  ultimo: ResultadoPedido | null;
}

export const ESTADO_PEDIDOS_VAZIO: EstadoPedidos = { salvos: [], ultimo: null };

/** Quem a IA achou, com a confiança como pré-marcação: "baixa" e "revisar" vêm desmarcados. */
export const nasceMarcado = (confianca: Confianca, revisar: boolean, pediuParaSair: boolean): boolean => !revisar && !pediuParaSair && confianca !== 'baixa';

/** Pode receber mensagem por este caminho? (Pediu para sair, "revisar", trava, leitura velha e ação já feita não podem.) */
export function podeReceberMensagem(i: ItemPedido, agora: Date): { ok: true } | { ok: false; motivo: string } {
  if (i.estado !== 'aberto') return { ok: false, motivo: 'já tem uma ação' };
  if (i.pediuParaSair) return { ok: false, motivo: 'pediu para não receber mais mensagens' };
  if (i.revisar || !i.corresponde) return { ok: false, motivo: 'a IA não conseguiu conferir: leia a conversa' };
  if (i.trava.tipo === 'agendado') return { ok: false, motivo: i.trava.motivo ?? 'agendado no CRM: fica de fora' };
  if (i.trava.tipo === 'indisponivel') return { ok: false, motivo: `não consegui conferir os agendamentos do CRM${i.trava.motivo ? ` (${i.trava.motivo})` : ''}` };
  if (leituraVelha(i, agora)) return { ok: false, motivo: 'a leitura tem mais de 12 horas: rode o pedido de novo' };
  return { ok: true };
}

export function leituraVelha(i: Pick<ItemPedido, 'lidoEm'>, agora: Date): boolean {
  const t = new Date(i.lidoEm).getTime();
  return !Number.isFinite(t) || agora.getTime() - t > VALIDADE_LEITURA_PEDIDO_MS;
}

// ── Pedidos salvos ──────────────────────────────────────────────────────────

const chaveDoPedido = (t: string): string => normalizarTexto(t).replace(/\s+/g, ' ').trim();

/** Guarda (ou atualiza) um pedido usado: mais recente primeiro, sem repetir o mesmo texto, no máximo MAX_PEDIDOS_SALVOS. */
export function guardarPedido(lista: ReadonlyArray<PedidoSalvo>, texto: string, plano: PlanoPedido | null, agora: Date): PedidoSalvo[] {
  const t = texto.replace(/\s+/g, ' ').trim().slice(0, MAX_PEDIDO_TEXTO);
  if (t === '') return [...lista];
  const k = chaveDoPedido(t);
  const antigo = lista.find((p) => chaveDoPedido(p.texto) === k);
  const novo: PedidoSalvo = { id: antigo?.id ?? `p${agora.getTime().toString(36)}`, texto: t, plano, usadoEm: agora.toISOString(), vezes: (antigo?.vezes ?? 0) + 1 };
  return [novo, ...lista.filter((p) => chaveDoPedido(p.texto) !== k)].slice(0, MAX_PEDIDOS_SALVOS);
}

export function removerPedido(lista: ReadonlyArray<PedidoSalvo>, id: string): PedidoSalvo[] {
  return lista.filter((p) => p.id !== id);
}

/** Lê o que foi gravado (defensivo: lixo vira vazio). */
export function normalizarEstadoPedidos(v: unknown): EstadoPedidos {
  const o = obj(v);
  const salvos = Array.isArray(o.salvos)
    ? o.salvos
        .map((x): PedidoSalvo | null => {
          const p = obj(x);
          if (typeof p.id !== 'string' || typeof p.texto !== 'string' || p.texto.trim() === '') return null;
          return {
            id: p.id,
            texto: p.texto.slice(0, MAX_PEDIDO_TEXTO),
            plano: p.plano ? normalizarPlano(obj(p.plano)) : null,
            usadoEm: typeof p.usadoEm === 'string' ? p.usadoEm : '',
            vezes: typeof p.vezes === 'number' && p.vezes > 0 ? Math.floor(p.vezes) : 1,
          };
        })
        .filter((x): x is PedidoSalvo => x !== null)
        .slice(0, MAX_PEDIDOS_SALVOS)
    : [];
  const u = obj(o.ultimo);
  const ultimo = typeof u.id === 'string' && Array.isArray(u.itens) && typeof u.rodadaEm === 'string' ? (o.ultimo as ResultadoPedido) : null;
  return { salvos, ultimo };
}

/** Dias do agendamento no CRM: inteiro de 1 a 120. */
export function diasDeAgendamentoValidos(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DIAS_AGENDAR_PADRAO;
  return Math.min(DIAS_AGENDAR_MAX, Math.max(DIAS_AGENDAR_MIN, Math.round(n)));
}

/** Resumo de uma frase do que a rodada fez, para o painel. */
export function resumoDaRodada(r: ResultadoPedido): string {
  const achadas = r.itens.filter((i) => i.corresponde).length;
  const revisar = r.itens.filter((i) => i.revisar).length;
  return `${r.lidas} conversa(s) lida(s) · ${achadas} correspondem · ${revisar} para revisar · ${r.descartadas} não correspondem${r.semConferir > 0 ? ` · ${r.semConferir} sem conferir` : ''}${r.cortados > 0 ? ` · ${r.cortados} candidatas ficaram para outra rodada` : ''}.`;
}
