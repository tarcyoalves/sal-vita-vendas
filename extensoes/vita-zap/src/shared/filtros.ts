// Filtros da campanha. Cada contato sai com uma decisão e o MOTIVO, que a prévia mostra.

import { DIAS_SEM_REPETIR } from './constantes';
import type { ContatoVarrido } from './contatos';
import { diferencaDias, formatarDataBr, hojeNoFuso, type DataIso } from './datas';
import { normalizarTexto } from './nomes';

export interface Filtros {
  /** Nome precisa conter TODOS estes termos (sem diferenciar maiúscula/acento). */
  contem: string[];
  /** Nome não pode conter NENHUM destes. */
  naoContem: string[];
  /** Última conversa estritamente antes desta data. */
  ultimaConversaAntesDe: DataIso | null;
  /** Última conversa estritamente depois desta data. */
  ultimaConversaDepoisDe: DataIso | null;
  /** Excluir quem recebeu campanha há menos de N dias (nunca menos que DIAS_SEM_REPETIR). */
  excluirContatadosHaDias: number;
  incluirSemConversa?: boolean;
}

export const FILTROS_PADRAO: Filtros = {
  contem: [],
  naoContem: [],
  ultimaConversaAntesDe: null,
  ultimaConversaDepoisDe: null,
  excluirContatadosHaDias: DIAS_SEM_REPETIR,
  incluirSemConversa: false,
};

export interface ContextoFiltro {
  agora: Date;
  /** Chaves marcadas "Não enviar mais" (ou "Não é cliente"). */
  naoEnviar: ReadonlySet<string>;
  /** Último envio de campanha por chave (ISO data-hora), de qualquer campanha. */
  ultimoEnvioPorChave: ReadonlyMap<string, string>;
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

export function avaliarContato(c: ContatoVarrido, filtros: Filtros, ctx: ContextoFiltro): Decisao {
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

  const usaData = filtros.ultimaConversaAntesDe != null || filtros.ultimaConversaDepoisDe != null;
  const partes: string[] = [];
  for (const termo of filtros.contem) partes.push(`contém "${termo}"`);

  if (usaData) {
    if (c.ultimaConversa == null) {
      if (filtros.incluirSemConversa) {
        return { situacao: 'incluido', motivo: 'contato salvo da agenda (data não exibida na busca do WhatsApp)' };
      }
      return { situacao: 'revisar', motivo: `data da última conversa incerta (${c.revisarData ?? 'sem data'})` };
    }
    if (filtros.ultimaConversaAntesDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaAntesDe) < 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa ${formatarDataBr(c.ultimaConversa)} não é antes de ${formatarDataBr(filtros.ultimaConversaAntesDe)}`,
      };
    }
    if (filtros.ultimaConversaDepoisDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaDepoisDe) > 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa ${formatarDataBr(c.ultimaConversa)} não é depois de ${formatarDataBr(filtros.ultimaConversaDepoisDe)}`,
      };
    }
    partes.push(`última conversa ${formatarDataBr(c.ultimaConversa)}`);
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
    .sort((a, b) => ordem[a.decisao.situacao] - ordem[b.decisao.situacao] || a.contato.nome.localeCompare(b.contato.nome, 'pt-BR'));
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
