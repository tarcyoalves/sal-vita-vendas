// Aba "Acompanhar": clientes prestes a fechar que não podem ser esquecidos. Regras puras (sem DOM, sem rede):
// quem está em acompanhamento, ordem da lista, "há N dias sem falar" e o resumo do contador.

import { ETIQUETA_ACOMPANHAR, type LeadCrm } from './crm-remoto';
import { diferencaDias, hojeNoFuso } from './datas';

/** Intervalo mínimo entre consultas automáticas (abrir a aba) à lista do CRM. O botão Atualizar ignora. */
export const MINIMO_ACOMPANHANDO_MS = 15 * 60_000;

export const emAcompanhamento = (l: Pick<LeadCrm, 'etiquetas' | 'convertidoEm' | 'status'>): boolean =>
  l.etiquetas.includes(ETIQUETA_ACOMPANHAR) && !l.convertidoEm && l.status === 'pending';

export function lembreteVencido(l: LeadCrm, agora: Date): boolean {
  return l.lembreteAtivo && l.lembreteEm != null && l.lembreteEm <= agora.getTime();
}

/** Dias de calendário (Fortaleza) desde o último contato; null = nunca registrado. */
export function diasSemContato(l: LeadCrm, agora: Date): number | null {
  if (l.ultimoContatoEm == null) return null;
  return Math.max(0, diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(l.ultimoContatoEm))));
}

export function textoSemContato(l: LeadCrm, agora: Date): string {
  const d = diasSemContato(l, agora);
  if (d == null) return 'sem contato registrado';
  if (d === 0) return 'falou hoje';
  return `há ${d} ${d === 1 ? 'dia' : 'dias'} sem falar`;
}

/**
 * Lembrete vencido primeiro; dentro de cada grupo, quem está há mais tempo sem contato (nunca contatado = o
 * mais esquecido). Empate: lembrete mais antigo, depois o título. Não altera a lista recebida.
 */
export function ordenarAcompanhando(leads: readonly LeadCrm[], agora: Date): LeadCrm[] {
  const chave = (l: LeadCrm) => ({ vencido: lembreteVencido(l, agora) ? 0 : 1, dias: diasSemContato(l, agora) ?? Number.POSITIVE_INFINITY });
  return [...leads].sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    if (x.vencido !== y.vencido) return x.vencido - y.vencido;
    if (x.dias !== y.dias) return y.dias - x.dias;
    const la = a.lembreteEm ?? Number.POSITIVE_INFINITY;
    const lb = b.lembreteEm ?? Number.POSITIVE_INFINITY;
    if (la !== lb) return la < lb ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });
}

export interface ResumoAcompanhando {
  total: number;
  vencidos: number;
}

export function resumoAcompanhando(leads: readonly LeadCrm[], agora: Date): ResumoAcompanhando {
  return { total: leads.length, vencidos: leads.filter((l) => lembreteVencido(l, agora)).length };
}
