// Follow-up de campanha (v0.7.54): regras PURAS de quem cobrar, quando, quantas vezes e o que fazer com a resposta.
// Sem rede, sem chrome, sem DOM: o motor do painel (sidepanel/followup-motor.ts) pluga a leitura da conversa,
// a IA do CRM e o executor das campanhas nestas funções.
//
// Decisão do dono (17/11/2026):
//  - quem NÃO respondeu é cobrado SOZINHO depois de X dias, pelo mesmo motor e política das campanhas;
//  - quem respondeu e exige atenção (preço, interesse, reclamação, compra depois, pergunta) NUNCA recebe nada
//    sozinho: vai para "Precisa de você" com resposta sugerida, e o atendente revisa e envia (abrirEColar);
//  - pedido explícito para sair → opt-out automático e nunca mais cobrança;
//  - falha fechada: na dúvida (identidade da conversa, grupo, mensagem do disparo não encontrada) NÃO cobra e vai
//    para "revisar".

import { type Campanha, textoDoItem } from './campanha';
import { MARCADOR_PRIMEIRO_NOME } from './constantes';
import { instanteNoFuso } from './crm-lembretes';
import { diferencaDias, hojeNoFuso, somarDias } from './datas';
import type { Envio } from './exportar';
import type { MensagemLida } from './mensagens';
import { assinaturaTextos, normalizarEstilo, normalizarTextos, type ModoCobranca, type OrigemTexto } from './followup-estilo';
import { normalizarParaComparar, validarModelo } from './texto';

// ── Constantes ──────────────────────────────────────────────────────────────

export const DIAS_PADRAO = 3;
export const DIAS_MINIMO = 1;
export const DIAS_MAXIMO = 30;
/** No máximo 2 cobranças por contato por campanha. */
export const MAX_COBRANCAS = 2;
/** Só acompanha disparos dos últimos N dias (mais velho que isso é assunto morto). */
export const JANELA_DIAS = 21;
/** Conversas por chamada à IA (o servidor aceita até 20; 10 cabem folgado no limite de 60 s da função). */
export const LOTE_IA = 10;
/** Conversas lidas por rodada de verificação (cada leitura abre uma conversa no WhatsApp). */
export const MAX_LEITURAS_POR_RODADA = 30;
/** Mensagens que seguem para a IA (as últimas). */
export const MAX_MENSAGENS_IA = 12;

// ── Configuração ────────────────────────────────────────────────────────────

export interface ConfigFollowup {
  /** Liga a cobrança automática. Só liga com a confirmação do risco (confirmouRisco) E com pelo menos 1 texto da 1ª cobrança. */
  ligado: boolean;
  /** X dias sem resposta antes de cobrar (e intervalo mínimo entre cobranças). */
  dias: number;
  /** Pausa a cobrança automática sem desligar (o botão "Pausar follow-up"). */
  pausado: boolean;
  /** O atendente leu e aceitou o risco do envio automático. */
  confirmouRisco: boolean;
  // ── A mensagem é do dono (v0.7.55) ──
  /** 'meus_textos' (padrão): sorteia entre os textos do dono. 'ia_estilo': a IA escreve no estilo dele. */
  modo: ModoCobranca;
  /** Variações da 1ª cobrança (1 a 10), com {nome}. */
  textos1: string[];
  /** Variações da 2ª cobrança (0 a 10). Vazio = a 2ª usa os textos da 1ª, sem repetir o que o contato já recebeu. */
  textos2: string[];
  /** "Como devo escrever" (até 500 caracteres): só vale no modo 'ia_estilo'. */
  estilo: string;
  /** Config antiga estava ligada sem texto: foi desligada. A tela avisa até o dono salvar um texto. */
  desligadaSemTexto: boolean;
}

export const CONFIG_FOLLOWUP_PADRAO: ConfigFollowup = {
  ligado: false,
  dias: DIAS_PADRAO,
  pausado: false,
  confirmouRisco: false,
  modo: 'meus_textos',
  textos1: [],
  textos2: [],
  estilo: '',
  desligadaSemTexto: false,
};

/**
 * Normaliza (e MIGRA) a configuração guardada. Config da 0.7.54 não tem os campos novos: vira modo "meus textos" vazio,
 * e se estava ligada fica desligada (`desligadaSemTexto`) porque os modelos genéricos não saem mais.
 */
export function normalizarConfigFollowup(c: Partial<ConfigFollowup> | null | undefined): ConfigFollowup {
  const bruto = typeof c?.dias === 'number' && Number.isFinite(c.dias) ? Math.floor(c.dias) : DIAS_PADRAO;
  const confirmouRisco = c?.confirmouRisco === true;
  const textos1 = normalizarTextos(c?.textos1);
  const textos2 = normalizarTextos(c?.textos2);
  const querLigar = c?.ligado === true && confirmouRisco;
  const ligado = querLigar && textos1.length > 0;
  return {
    // Sem a confirmação do risco, ou sem texto da 1ª cobrança, nunca fica ligado.
    ligado,
    dias: Math.min(DIAS_MAXIMO, Math.max(DIAS_MINIMO, bruto)),
    pausado: c?.pausado === true,
    confirmouRisco,
    modo: c?.modo === 'ia_estilo' ? 'ia_estilo' : 'meus_textos',
    textos1,
    textos2,
    estilo: normalizarEstilo(c?.estilo),
    desligadaSemTexto: textos1.length === 0 && (querLigar || c?.desligadaSemTexto === true),
  };
}

// ── Tipos ───────────────────────────────────────────────────────────────────

export type ClasseIa =
  | 'interessado'
  | 'pediu_preco'
  | 'tem_estoque'
  | 'compra_depois'
  | 'reclamacao'
  | 'pediu_para_sair'
  | 'pergunta'
  | 'sem_resposta'
  | 'sem_relacao';

/** Um item da resposta da IA do CRM (zapIa.classificarConversas). */
export interface ClassificacaoIa {
  ref: string;
  classe: ClasseIa;
  precisaAtencao: boolean;
  resumo: string;
  sugestao: string;
  lembreteDias?: number;
}

/**
 * monitorando: enviado, esperando ser lido (a leitura só acontece depois de X dias);
 * cobranca: sem resposta, texto pronto, aguardando o envio automático;
 * precisa: respondeu e exige atenção (ou a leitura deu dúvida: ver `motivo`);
 * revisar: falha fechada (identidade da conversa, grupo, mensagem do disparo não achada, IA sem resposta válida);
 * saiu: pediu para sair (opt-out) ou está em "Não enviar mais";
 * resolvido: nada mais a fazer (sem resposta depois de 2 cobranças, resposta sem assunto, você já respondeu).
 */
export type EstadoFollowup = 'monitorando' | 'cobranca' | 'precisa' | 'revisar' | 'saiu' | 'resolvido';

export interface CobrancaFeita {
  em: string;
  texto: string;
}

export interface Followup {
  /** `${campanhaId}:${chave}` da campanha de ORIGEM (a que mandou o disparo). */
  id: string;
  campanhaId: string;
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Texto final enviado no disparo. */
  mensagemCampanha: string;
  /** Quando o disparo saiu (ISO). */
  enviadoEm: string;
  estado: EstadoFollowup;
  motivo: string | null;
  /** Última leitura da conversa (ISO). */
  verificadoEm: string | null;
  cobrancas: CobrancaFeita[];
  /** Estado 'cobranca': o texto pronto (com {primeiroNome}) e de onde veio. 'ia'/'modelo' são da 0.7.54 (genéricos: refeitos antes do envio). */
  cobrancaModelo: string | null;
  cobrancaOrigem: OrigemTexto | 'ia' | 'modelo' | null;
  /** Assinatura da configuração de texto com que `cobrancaModelo` foi preparado (ver assinaturaTextos). */
  cobrancaAssinatura?: string | null;
  /** Estado 'precisa' (e saiu): o que a IA entendeu. */
  classe?: ClasseIa;
  resumo?: string;
  sugestao?: string;
  lembreteDias?: number;
  lembreteCriadoEm?: string;
  /** 'reativacao': o item veio da reativação por inatividade (v0.7.56), não de um disparo: nunca é cobrado nem volta a 'monitorando'. */
  origem?: 'reativacao';
  atualizadoEm: string;
}

// ── Criar e consultar ───────────────────────────────────────────────────────

/** Instante de referência: a última cobrança, ou o disparo. */
export function referenciaDe(f: Pick<Followup, 'cobrancas' | 'enviadoEm'>): string {
  return f.cobrancas.length > 0 ? f.cobrancas[f.cobrancas.length - 1].em : f.enviadoEm;
}

/** Texto da nossa última mensagem na conversa (a cobrança mais recente, ou o disparo). */
export function textoEsperadoDe(f: Pick<Followup, 'cobrancas' | 'mensagemCampanha'>): string {
  return f.cobrancas.length > 0 ? f.cobrancas[f.cobrancas.length - 1].texto : f.mensagemCampanha;
}

export function diasDesde(iso: string, agora: Date): number {
  return diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(iso)));
}

/**
 * Itens 'enviado' de campanhas comuns (nunca de campanhas de follow-up) que ainda não têm acompanhamento e saíram
 * dentro da janela. A hora do disparo vem do registro de envio (`envios`), senão da marca do item.
 */
export function novosFollowups(campanhas: ReadonlyArray<Campanha>, envios: ReadonlyArray<Envio>, existentes: ReadonlyArray<Followup>, agora: Date): Followup[] {
  const ja = new Set(existentes.map((f) => f.id));
  const horaDoEnvio = new Map(envios.map((e) => [e.id, e.enviadoEm]));
  const novos: Followup[] = [];
  for (const c of campanhas) {
    // Campanhas de cobrança e de reativação têm o próprio acompanhamento: não geram follow-up de cobrança.
    if (c.tipo != null) continue;
    for (const item of c.itens) {
      if (item.status !== 'enviado') continue;
      const id = `${c.id}:${item.chave}`;
      if (ja.has(id)) continue;
      const enviadoEm = horaDoEnvio.get(id) ?? item.atualizadoEm;
      if (!enviadoEm || Number.isNaN(new Date(enviadoEm).getTime())) continue;
      if (diasDesde(enviadoEm, agora) > JANELA_DIAS) continue;
      ja.add(id);
      novos.push({
        id,
        campanhaId: c.id,
        chave: item.chave,
        nome: item.nome,
        primeiroNome: item.primeiroNome,
        mensagemCampanha: textoDoItem(item),
        enviadoEm,
        estado: 'monitorando',
        motivo: null,
        verificadoEm: null,
        cobrancas: [],
        cobrancaModelo: null,
        cobrancaOrigem: null,
        atualizadoEm: agora.toISOString(),
      });
    }
  }
  return novos;
}

/**
 * Já passaram X dias (de calendário, fuso de Fortaleza) desde o disparo/última cobrança? Só 'monitorando' é lido.
 * Com `recentes`, a leitura vale a partir de 2 horas depois (botão "Verificar respostas agora").
 */
export function devidoParaVerificar(f: Followup, dias: number, agora: Date, recentes = false): boolean {
  if (f.estado !== 'monitorando') return false;
  const ref = new Date(referenciaDe(f)).getTime();
  if (Number.isNaN(ref)) return false;
  if (recentes) return agora.getTime() - ref >= 2 * 3_600_000;
  return diasDesde(referenciaDe(f), agora) >= Math.max(DIAS_MINIMO, dias);
}

// ── Ler a conversa ──────────────────────────────────────────────────────────

/**
 * "[10:30, 26/10/2026] Ana: " (data-pre-plain-text do WhatsApp em português) → ISO, no fuso de Fortaleza (UTC-3).
 * Aceita 12 h ("10:30 AM"). Qualquer outra coisa → null.
 */
export function lerCarimbo(atributo: string | null | undefined): string | null {
  const m = /^\s*\[\s*(\d{1,2}):(\d{2})(?:\s*([AaPp])\.?[Mm]\.?)?\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\]/.exec(atributo ?? '');
  if (!m) return null;
  let hora = Number(m[1]);
  const minuto = Number(m[2]);
  const dia = Number(m[4]);
  const mes = Number(m[5]);
  const ano = Number(m[6]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'p';
    if (hora < 1 || hora > 12) return null;
    hora = (hora % 12) + (pm ? 12 : 0);
  }
  if (hora > 23 || minuto > 59 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const local = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  // data impossível (31/02) rola para o mês seguinte: recusa
  if (local.getUTCDate() !== dia || local.getUTCMonth() !== mes - 1) return null;
  return new Date(local.getTime() + 3 * 3_600_000).toISOString();
}

export type Leitura =
  /** O cliente não escreveu nada depois da nossa mensagem. */
  | { tipo: 'sem_resposta' }
  /** O cliente respondeu e a ÚLTIMA mensagem ainda é dele: vai para a IA (com a conversa desde a nossa mensagem). */
  | { tipo: 'respondeu'; mensagens: MensagemLida[] }
  /** O atendente já falou com o contato depois do disparo (ou depois da resposta): nada a fazer. */
  | { tipo: 'atendido'; motivo: string }
  /** Não dá para ter certeza: falha fechada. */
  | { tipo: 'duvida'; motivo: string };

const minutoAbaixo = (ms: number) => Math.floor(ms / 60_000) * 60_000;

/**
 * Âncora = a nossa mensagem (o disparo ou a última cobrança) dentro da conversa lida: pelo texto exato (normalizado,
 * a última ocorrência) ou, se o texto não bate, pela hora (mensagem MINHA a até 5 min da hora registrada do envio).
 */
function acharAncora(mensagens: ReadonlyArray<MensagemLida>, textoEsperado: string, referenciaIso: string): number {
  const alvo = normalizarParaComparar(textoEsperado);
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    if (mensagens[i].de === 'eu' && alvo !== '' && normalizarParaComparar(mensagens[i].texto) === alvo) return i;
  }
  const ref = new Date(referenciaIso).getTime();
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const q = mensagens[i].quando ? new Date(mensagens[i].quando as string).getTime() : NaN;
    if (mensagens[i].de === 'eu' && Number.isFinite(q) && Math.abs(q - ref) <= 5 * 60_000) return i;
  }
  return -1;
}

/**
 * O que a conversa diz sobre o nosso disparo. Regras (todas de falha fechada: na dúvida, NÃO se cobra):
 *  1. acha a nossa mensagem (texto ou hora); se não acha → dúvida;
 *  2. cliente escreveu depois dela → respondeu (ou atendido, se o atendente falou por último);
 *  3. só o atendente escreveu depois → atendido;
 *  4. ninguém escreveu depois → sem resposta.
 */
export function analisarLeitura(mensagens: ReadonlyArray<MensagemLida>, textoEsperado: string, referenciaIso: string): Leitura {
  if (mensagens.length === 0) return { tipo: 'duvida', motivo: 'a conversa não mostrou nenhuma mensagem' };
  const ancora = acharAncora(mensagens, textoEsperado, referenciaIso);
  if (ancora < 0) {
    // Sem âncora, só uma resposta DATADA depois do envio é prova suficiente de que o cliente respondeu.
    const ref = minutoAbaixo(new Date(referenciaIso).getTime());
    const resposta = mensagens.some((m) => m.de === 'cliente' && m.quando != null && new Date(m.quando).getTime() >= ref);
    if (resposta) {
      const ult = mensagens[mensagens.length - 1];
      return ult.de === 'eu' ? { tipo: 'atendido', motivo: 'você já respondeu depois do cliente' } : { tipo: 'respondeu', mensagens: mensagens.slice(-MAX_MENSAGENS_IA) };
    }
    return { tipo: 'duvida', motivo: 'não achei a mensagem do disparo na conversa (apagada, editada ou fora do trecho carregado)' };
  }
  const depois = mensagens.slice(ancora + 1);
  const doCliente = depois.filter((m) => m.de === 'cliente');
  if (doCliente.length > 0) {
    if (depois[depois.length - 1].de === 'eu') return { tipo: 'atendido', motivo: 'você já respondeu depois do cliente' };
    return { tipo: 'respondeu', mensagens: mensagens.slice(ancora).slice(-MAX_MENSAGENS_IA) };
  }
  if (depois.length > 0) return { tipo: 'atendido', motivo: 'você já escreveu para o contato depois do disparo' };
  return { tipo: 'sem_resposta' };
}

// ── Quem cobrar ─────────────────────────────────────────────────────────────

export interface ContextoCobranca {
  agora: Date;
  dias: number;
  /** Chaves em "Não enviar mais" / "Não é cliente". */
  naoEnviar: ReadonlySet<string>;
  /** Último envio de qualquer campanha por chave (ISO). */
  ultimoEnvioPorChave: ReadonlyMap<string, string>;
}

export type DecisaoCobranca =
  | { pode: true }
  | { pode: false; destino: 'resolvido' | 'saiu' | 'espera'; motivo: string };

/** Depois de ler "sem resposta": cobra? Máximo de 2 cobranças, opt-out e intervalo mínimo de X dias desde o último contato. */
export function decidirCobranca(f: Followup, ctx: ContextoCobranca): DecisaoCobranca {
  if (f.cobrancas.length >= MAX_COBRANCAS) {
    return { pode: false, destino: 'resolvido', motivo: `sem resposta depois de ${MAX_COBRANCAS} cobranças` };
  }
  if (ctx.naoEnviar.has(f.chave)) return { pode: false, destino: 'saiu', motivo: 'está em "Não enviar mais"' };
  const ultimo = ctx.ultimoEnvioPorChave.get(f.chave);
  if (ultimo && diasDesde(ultimo, ctx.agora) < Math.max(DIAS_MINIMO, ctx.dias)) {
    return { pode: false, destino: 'espera', motivo: `contatado há menos de ${ctx.dias} dia(s)` };
  }
  return { pode: true };
}

// ── Texto da cobrança ───────────────────────────────────────────────────────

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Texto da IA (com o nome do cliente) → modelo da campanha (com {primeiroNome}). Chaves soltas são removidas. Se o
 * nome não aparece, o texto segue sem marcador (0.7.58: o nome é opcional; antes entrava "Oi, {nome}!" à força).
 */
export function paraModelo(texto: string, primeiroNome: string): string {
  const nome = primeiroNome.trim();
  const limpo = texto.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  if (nome === '') return limpo;
  const re = new RegExp(`(?<![\\p{L}])${escapar(nome)}(?![\\p{L}])`, 'giu');
  if (re.test(limpo)) return limpo.replace(new RegExp(`(?<![\\p{L}])${escapar(nome)}(?![\\p{L}])`, 'giu'), MARCADOR_PRIMEIRO_NOME);
  return limpo;
}

/**
 * O texto preparado para a fila foi feito com a configuração de agora? Se não (o dono mudou os textos, o modo ou o
 * estilo, ou o texto é da 0.7.54), ele NUNCA pode ser enviado: tem que ser refeito.
 */
export function textoDaFilaDesatualizado(f: Pick<Followup, 'estado' | 'cobrancaModelo' | 'cobrancaAssinatura'>, config: ConfigFollowup): boolean {
  return f.estado === 'cobranca' && (f.cobrancaModelo == null || f.cobrancaAssinatura !== assinaturaTextos(config));
}

/** Modelo aceitável para a campanha (política de texto: sem link, curto, só o marcador do primeiro nome)? */
export function modeloDeCobrancaValido(modelo: string): boolean {
  return validarModelo(modelo).length === 0;
}

// ── Resposta da IA → estado ─────────────────────────────────────────────────

export interface EfeitoDaClassificacao {
  followup: Followup;
  /** pediu_para_sair: entra em "Não enviar mais". */
  optOut: boolean;
  /** compra_depois / tem_estoque com prazo: criar lembrete (data/hora e rascunho). */
  lembrete?: { venceEm: number; dias: number; rascunho: string };
}

const CLASSES_COM_LEMBRETE: ReadonlySet<ClasseIa> = new Set<ClasseIa>(['compra_depois', 'tem_estoque']);

export function aplicarClassificacao(f: Followup, c: ClassificacaoIa, agora: Date): EfeitoDaClassificacao {
  const base: Followup = { ...f, classe: c.classe, resumo: c.resumo, sugestao: c.sugestao, atualizadoEm: agora.toISOString(), verificadoEm: agora.toISOString() };
  if (c.classe === 'pediu_para_sair') {
    return { followup: { ...base, estado: 'saiu', motivo: 'pediu para não receber mais mensagens', sugestao: '' }, optOut: true };
  }
  if (c.classe === 'sem_relacao' && c.precisaAtencao) {
    return { followup: { ...base, estado: 'revisar', motivo: c.resumo || 'a IA não soube classificar: leia a conversa' }, optOut: false };
  }
  if (c.classe === 'sem_resposta') {
    return { followup: { ...base, estado: 'revisar', motivo: 'a IA disse que não houve resposta, mas a conversa tem resposta: leia a conversa' }, optOut: false };
  }
  if (!c.precisaAtencao) {
    return { followup: { ...base, estado: 'resolvido', motivo: c.resumo || 'resposta sem assunto comercial', sugestao: '' }, optOut: false };
  }
  const dias = c.lembreteDias != null && Number.isInteger(c.lembreteDias) && c.lembreteDias >= 1 && c.lembreteDias <= 365 ? c.lembreteDias : undefined;
  const comLembrete = CLASSES_COM_LEMBRETE.has(c.classe) && dias != null;
  const precisa: Followup = { ...base, estado: 'precisa', motivo: null, ...(comLembrete ? { lembreteDias: dias } : {}) };
  if (!comLembrete) return { followup: precisa, optOut: false };
  const venceEm = instanteNoFuso(somarDias(hojeNoFuso(agora), dias as number), 9, 0);
  return { followup: precisa, optOut: false, lembrete: { venceEm, dias: dias as number, rascunho: '' } };
}

// ── Resultado da campanha de cobrança → estado ──────────────────────────────

/** Depois que o Executor mexeu na campanha de cobrança: cada item sai de 'cobranca' conforme o desfecho dele. */
export function aplicarResultadoCampanha(followups: ReadonlyArray<Followup>, campanha: Campanha, envios: ReadonlyArray<Envio>, agora: Date): Followup[] {
  const porChave = new Map(campanha.itens.map((i) => [i.chave, i]));
  const enviadoEm = new Map(envios.filter((e) => e.campanhaId === campanha.id).map((e) => [e.chave, e.enviadoEm]));
  return followups.map((f) => {
    const item = porChave.get(f.chave);
    if (!item || item.status === 'pendente') return f;
    const agoraIso = agora.toISOString();
    if (item.status === 'enviado') {
      // Idempotente (o Executor publica várias vezes) e vale também para 'monitorando': uma cobrança que saiu NUNCA
      // pode deixar de ser contada (o máximo de 2 por contato depende disso).
      if (f.estado !== 'cobranca' && f.estado !== 'monitorando') return f;
      const em = enviadoEm.get(f.chave) ?? item.atualizadoEm ?? agoraIso;
      if (f.cobrancas.some((c) => c.em === em)) return f;
      return { ...f, estado: 'monitorando', motivo: null, cobrancas: [...f.cobrancas, { em, texto: textoDoItem(item) }], cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agoraIso };
    }
    if (f.estado !== 'cobranca') return f;
    if (item.status === 'nao_enviar' || item.status === 'nao_cliente') {
      return { ...f, estado: 'saiu', motivo: item.motivo ?? 'não enviar mais', cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agoraIso };
    }
    // pulado / problema / revisar: nunca se tenta de novo sozinho (pode ter saído); o atendente confere.
    return { ...f, estado: 'revisar', motivo: `a cobrança não foi enviada (${item.status}${item.motivo ? `: ${item.motivo}` : ''})`, cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agoraIso };
  });
}

// ── Listas do painel ────────────────────────────────────────────────────────

export interface ListasFollowup {
  /** Esperando o envio automático. */
  cobranca: Followup[];
  /** "Precisa de você": respondeu e exige atenção, mais os que ficaram em revisar (falha fechada). */
  precisa: Followup[];
  saiu: Followup[];
  resolvido: Followup[];
  /** Enviados que ainda não foram lidos (esperando passar X dias). */
  monitorando: Followup[];
}

const porAtualizacao = (a: Followup, b: Followup) => b.atualizadoEm.localeCompare(a.atualizadoEm);

export function separarListas(followups: ReadonlyArray<Followup>): ListasFollowup {
  const L: ListasFollowup = { cobranca: [], precisa: [], saiu: [], resolvido: [], monitorando: [] };
  for (const f of followups) {
    if (f.estado === 'cobranca') L.cobranca.push(f);
    else if (f.estado === 'precisa' || f.estado === 'revisar') L.precisa.push(f);
    else if (f.estado === 'saiu') L.saiu.push(f);
    else if (f.estado === 'resolvido') L.resolvido.push(f);
    else L.monitorando.push(f);
  }
  for (const k of Object.keys(L) as Array<keyof ListasFollowup>) L[k].sort(porAtualizacao);
  return L;
}

export const ROTULO_CLASSE: Record<ClasseIa, string> = {
  interessado: 'Interessado',
  pediu_preco: 'Pediu preço',
  tem_estoque: 'Tem estoque',
  compra_depois: 'Vai comprar depois',
  reclamacao: 'Reclamação',
  pediu_para_sair: 'Pediu para sair',
  pergunta: 'Pergunta',
  sem_resposta: 'Sem resposta',
  sem_relacao: 'Sem relação',
};
