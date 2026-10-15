// Decisão PURA do bloqueio de crédito no envio do pedido ao SMBI (dispararSmbi).
import { normalizarPrazo } from '../../../shared/smbiCondicoes';
import { relatorioValido } from '../../../shared/credito';

export interface EntradaBloqueioCredito {
  bloqueioAtivo: boolean;
  prazoSal: string | null | undefined;
  prazoFrete: string | null | undefined; // informativo: a regra olha só o prazo do sal
  ultimoRelatorio: { veredito: string; consultadoEm: Date | string } | null;
  liberadoEm: string | Date | null | undefined; // liberação manual do admin neste pedido
}

export interface DecisaoBloqueioCredito { bloquear: boolean; motivo?: string; aviso?: string }

export function decidirBloqueioCredito(e: EntradaBloqueioCredito, agora: Date = new Date()): DecisaoBloqueioCredito {
  if (!e.bloqueioAtivo) return { bloquear: false };
  if (normalizarPrazo(e.prazoSal) === 'AVISTA') return { bloquear: false }; // à vista nunca é bloqueado
  if (!e.ultimoRelatorio) {
    return { bloquear: false, aviso: 'Cliente sem análise de crédito: o pedido a prazo segue sem checagem.' };
  }
  if (!relatorioValido(e.ultimoRelatorio.consultadoEm, agora)) {
    return { bloquear: false, aviso: 'A análise de crédito do cliente está vencida (mais de 30 dias): o pedido segue sem checagem.' };
  }
  if (e.ultimoRelatorio.veredito !== 'REPROVADO_A_PRAZO') return { bloquear: false };
  if (e.liberadoEm) return { bloquear: false, aviso: 'Pedido liberado manualmente pelo admin apesar do crédito reprovado.' };
  return { bloquear: true, motivo: 'Crédito reprovado a prazo — peça liberação ao admin' };
}
