// Filtros da campanha. Cada contato sai com uma decisão e o MOTIVO, que a prévia mostra.

import { DIAS_SEM_REPETIR } from './constantes';
import type { ContatoVarrido } from './contatos';
import { rotuloDaFase, type Contato, type Fase } from './crm-tipos';
import { diferencaDias, formatarDataBr, hojeNoFuso, type DataIso } from './datas';
import { normalizarTexto } from './nomes';

export interface Filtros {
  /** Nome precisa conter TODOS estes termos (sem diferenciar maiúscula/acento). */
  contem: string[];
  /** Nome não pode conter NENHUM destes. */
  naoContem: string[];
  /** Última conversa nesta data ou antes (inclusive). */
  ultimaConversaAntesDe: DataIso | null;
  /** Última conversa nesta data ou depois (inclusive). */
  ultimaConversaDepoisDe: DataIso | null;
  /** Excluir quem recebeu campanha há menos de N dias (nunca menos que DIAS_SEM_REPETIR). */
  excluirContatadosHaDias: number;
  incluirSemConversa?: boolean;
  /** Tags do CRM selecionadas: se houver alguma, o contato precisa ter ao menos UMA delas. */
  tags?: string[];
  /** Fases do funil do CRM selecionadas: se houver alguma, o contato precisa estar em uma delas. */
  fases?: Fase[];
  /** Se true, filtra conversas onde o atendente falou por último (aguardando resposta). */
  aguardandoResposta?: boolean;
  /**
   * "Só contatos com conversa já feita por mim": fica de fora quem não tem nenhum sinal de que o atendente já
   * mandou mensagem (ver `falouComOContato`). Ligado por padrão no painel (aba Varredura); aqui o padrão é desligado.
   */
  soComMensagemMinha?: boolean;
}

export const FILTROS_PADRAO: Filtros = {
  contem: [],
  naoContem: [],
  ultimaConversaAntesDe: null,
  ultimaConversaDepoisDe: null,
  excluirContatadosHaDias: DIAS_SEM_REPETIR,
  incluirSemConversa: false,
  tags: [],
  fases: [],
  aguardandoResposta: false,
  soComMensagemMinha: false,
};

export interface ContextoFiltro {
  agora: Date;
  /** Chaves marcadas "Não enviar mais" (ou "Não é cliente"). */
  naoEnviar: ReadonlySet<string>;
  /** Último envio de campanha por chave (ISO data-hora), de qualquer campanha. */
  ultimoEnvioPorChave: ReadonlyMap<string, string>;
  /** Mapa chave do contato → conjunto de tags do CRM (nomes normalizados). */
  tagsPorChave?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Mapa chave do contato → fase do funil no CRM. */
  fasePorChave?: ReadonlyMap<string, Fase>;
  /** Mapa chave do contato → boolean indicando se está aguardando resposta do cliente. */
  aguardandoPorChave?: ReadonlyMap<string, boolean>;
  /** Chaves de contatos com registro do atendente no CRM da extensão (nota, fase ou conversão). */
  comRegistroDoAtendente?: ReadonlySet<string>;
}

export type Situacao = 'incluido' | 'excluido' | 'revisar';

export interface Decisao {
  situacao: Situacao;
  motivo: string;
}

export function diasSemRepetir(filtros: Filtros): number {
  const n = Number.isFinite(filtros.excluirContatadosHaDias) ? Math.floor(filtros.excluirContatadosHaDias) : 0;
  return Math.max(DIAS_SEM_REPETIR, n);
}

export const MOTIVO_SEM_MENSAGEM_MINHA = 'sem mensagem sua (nenhum sinal de conversa feita por você)';
export const MOTIVO_SINAL_DESCONHECIDO = 'sinal de conversa sua desconhecido — varra de novo';

/** Ajuda do campo "Só contatos com conversa já feita por mim" (aba Varredura). */
export const TEXTO_AJUDA_SO_MINHA =
  'Entra quem tem algum sinal de que você já mandou mensagem: a última mensagem da lista é sua (✓, ✓✓, relógio ou "Você:"), o contato está no histórico de envios da extensão ou tem nota/fase/conversão sua no CRM da extensão. ' +
  'Limites: se o cliente respondeu por último e a lista não mostra nada seu, o contato fica fora (aparece na prévia como "sem mensagem sua" e dá para incluir à mão); contatos varridos antes da versão 0.7.21 precisam ser varridos de novo.';

/** Contato do CRM da extensão em que o atendente já mexeu: nota, fase do funil ou conversão. */
export function temRegistroDoAtendente(c: Pick<Contato, 'notas' | 'fase' | 'convertidoEm'>): boolean {
  return c.notas.length > 0 || c.fase != null || c.convertidoEm != null;
}

/**
 * O atendente já falou com este contato? Verdade se QUALQUER sinal existir:
 * (a) a prévia da última mensagem na lista é minha (ícone de entrega/leitura ou "Você:");
 * (b) o contato está no histórico de envios da extensão;
 * (c) o contato tem registro do atendente no CRM da extensão (nota, fase ou conversão).
 * Limite: se a conversa é antiga e o cliente respondeu por último, a lista não mostra nada meu; sem (b) nem (c) o
 * contato fica de fora (dá para incluir à mão na prévia).
 */
export function falouComOContato(c: ContatoVarrido, ctx: ContextoFiltro): boolean {
  return c.ultimaDeMim === true || ctx.ultimoEnvioPorChave.has(c.chave) || ctx.comRegistroDoAtendente?.has(c.chave) === true;
}

export function avaliarContato(c: ContatoVarrido, filtros: Filtros, ctx: ContextoFiltro): Decisao {
  const d = avaliarSemFiltroDeMensagemMinha(c, filtros, ctx);
  if (filtros.soComMensagemMinha && d.situacao !== 'excluido') {
    if (falouComOContato(c, ctx)) {
      return d;
    }
    // Só excluir quando ultimaDeMim === false E não houver histórico de envios nem registro no CRM
    if (c.ultimaDeMim === false) {
      return { situacao: 'excluido', motivo: MOTIVO_SEM_MENSAGEM_MINHA };
    }
    // Contato sem o campo ultimaDeMim (varrido antes da 0.7.21, valor undefined) ou desconhecido:
    // Trata como 'revisar' com motivo "sinal de conversa sua desconhecido — varra de novo"
    if (d.situacao === 'revisar') {
      return d;
    }
    return { situacao: 'revisar', motivo: MOTIVO_SINAL_DESCONHECIDO };
  }
  return d;
}

function avaliarSemFiltroDeMensagemMinha(c: ContatoVarrido, filtros: Filtros, ctx: ContextoFiltro): Decisao {
  const nome = normalizarTexto(c.nome);

  if (ctx.naoEnviar.has(c.chave)) return { situacao: 'excluido', motivo: 'marcado "Não enviar mais"' };
  if (c.soNumero) return { situacao: 'excluido', motivo: 'não salvo na agenda (aparece só o número)' };
  if (c.pareceGrupo) return { situacao: 'excluido', motivo: 'grupo ou lista de transmissão' };
  if (!filtros.incluirSemConversa && !c.temConversa) return { situacao: 'excluido', motivo: 'sem conversa anterior' };

  for (const termo of filtros.contem) {
    if (!nome.includes(normalizarTexto(termo))) return { situacao: 'excluido', motivo: `nome não contém "${termo}"` };
  }
  for (const termo of filtros.naoContem) {
    if (normalizarTexto(termo) !== '' && nome.includes(normalizarTexto(termo))) {
      return { situacao: 'excluido', motivo: `nome contém "${termo}"` };
    }
  }

  const ultimoEnvio = ctx.ultimoEnvioPorChave.get(c.chave);
  if (ultimoEnvio) {
    const dias = diferencaDias(hojeNoFuso(ctx.agora), hojeNoFuso(new Date(ultimoEnvio)));
    const limite = diasSemRepetir(filtros);
    if (dias < limite) {
      return { situacao: 'excluido', motivo: `recebeu campanha há ${dias} dia(s) (mínimo ${limite})` };
    }
  }

  if (c.duplicado) return { situacao: 'revisar', motivo: 'mais de uma conversa com este nome' };

  if (filtros.tags && filtros.tags.length > 0) {
    const tagsContato = ctx.tagsPorChave?.get(c.chave);
    const temTag = tagsContato && filtros.tags.some((t) => tagsContato.has(normalizarTexto(t)));
    if (!temTag) {
      return { situacao: 'excluido', motivo: `não possui as tags do CRM selecionadas (${filtros.tags.join(', ')})` };
    }
  }

  if (filtros.fases && filtros.fases.length > 0) {
    const faseContato = ctx.fasePorChave?.get(c.chave);
    if (!faseContato || !filtros.fases.includes(faseContato)) {
      const rotulos = filtros.fases.map((f) => rotuloDaFase(f)).join(', ');
      return { situacao: 'excluido', motivo: `fase do CRM não é (${rotulos})` };
    }
  }

  if (filtros.aguardandoResposta) {
    const estaAguardando = ctx.aguardandoPorChave?.get(c.chave);
    if (estaAguardando === false) {
      return { situacao: 'excluido', motivo: 'conversa não está aguardando resposta (cliente já respondeu)' };
    }
  }

  const usaData = filtros.ultimaConversaAntesDe != null || filtros.ultimaConversaDepoisDe != null;
  const partes: string[] = [];
  for (const termo of filtros.contem) partes.push(`contém "${termo}"`);

  if (usaData) {
    if (c.ultimaConversa == null) {
      if (!c.temConversa) {
        return { situacao: 'excluido', motivo: 'sem conversa anterior (agenda)' };
      }
      return { situacao: 'revisar', motivo: `data da última conversa incerta (${c.revisarData ?? 'sem data'})` };
    }
    if (filtros.ultimaConversaAntesDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaAntesDe) <= 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa ${formatarDataBr(c.ultimaConversa)} é posterior a ${formatarDataBr(filtros.ultimaConversaAntesDe)}`,
      };
    }
    if (filtros.ultimaConversaDepoisDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaDepoisDe) >= 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa ${formatarDataBr(c.ultimaConversa)} é anterior a ${formatarDataBr(filtros.ultimaConversaDepoisDe)}`,
      };
    }
    partes.push(`última conversa ${formatarDataBr(c.ultimaConversa)}`);
  } else if (c.ultimaConversa) {
    partes.push(`última conversa ${formatarDataBr(c.ultimaConversa)}`);
  }

  const tagsContato = ctx.tagsPorChave?.get(c.chave);
  if (tagsContato && tagsContato.size > 0 && filtros.tags && filtros.tags.length > 0) {
    const marcadas = filtros.tags.filter((t) => tagsContato.has(normalizarTexto(t)));
    if (marcadas.length > 0) partes.push(`tag: ${marcadas.join(', ')}`);
  }

  if (filtros.fases && filtros.fases.length > 0) {
    const faseContato = ctx.fasePorChave?.get(c.chave);
    if (faseContato) partes.push(`fase: ${rotuloDaFase(faseContato)}`);
  }

  if (filtros.aguardandoResposta) {
    partes.push('aguardando resposta');
  }

  return { situacao: 'incluido', motivo: partes.length ? partes.join('; ') : 'contato salvo com conversa' };
}

export interface ContatoAvaliado {
  contato: ContatoVarrido;
  decisao: Decisao;
}

export function aplicarFiltros(contatos: ContatoVarrido[], filtros: Filtros, ctx: ContextoFiltro): ContatoAvaliado[] {
  const ordem: Record<Situacao, number> = { incluido: 0, revisar: 1, excluido: 2 };
  return contatos
    .map((contato) => ({ contato, decisao: avaliarContato(contato, filtros, ctx) }))
    .sort((a, b) => {
      // 1. Agrupamento por situação: incluídos primeiro, depois revisar, depois excluídos
      const diffSituacao = ordem[a.decisao.situacao] - ordem[b.decisao.situacao];
      if (diffSituacao !== 0) return diffSituacao;

      // 2. Ordem por data da última conversa decrescente (mais recente primeiro: 10/09, 09/09, 08/09, etc.)
      const dataA = a.contato.ultimaConversa ?? '';
      const dataB = b.contato.ultimaConversa ?? '';
      if (dataA && dataB && dataA !== dataB) {
        return dataB.localeCompare(dataA);
      }
      if (dataA && !dataB) return -1;
      if (!dataA && dataB) return 1;

      // 3. Desempate por nome alfabético
      return a.contato.nome.localeCompare(b.contato.nome, 'pt-BR');
    });
}

/** Mapa chave → último envio (ISO), a partir do histórico de envios. */
export function ultimoEnvioPorChave(envios: ReadonlyArray<{ chave: string; enviadoEm: string }>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const e of envios) {
    const atual = mapa.get(e.chave);
    if (!atual || e.enviadoEm > atual) mapa.set(e.chave, e.enviadoEm);
  }
  return mapa;
}
