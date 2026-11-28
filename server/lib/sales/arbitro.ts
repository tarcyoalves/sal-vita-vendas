// Árbitro de mensagens comerciais: a ÚNICA porta de saída. Decide na hora da reserva E de novo
// na autorização de despacho (V3.1, 16.2). Puro: recebe contagens já consultadas.
//
// Mensagem estritamente transacional (confirmação de pedido, rastreio) NÃO passa por aqui.
import type { SalesLimites } from '../../../shared/sales';

export interface EntradaArbitro {
  agora: Date;
  limites: SalesLimites;
  /** Último envio de marketing/prospecção ACEITO para este endereço, somando todas as jornadas e canais. */
  ultimoEnvioMarketingEm: Date | null;
  /** Mensagens de prospecção aceitas hoje (fuso de São Paulo), todas as empresas. */
  enviosHoje: number;
  /** Empresas novas (passo 0) aceitas hoje. */
  novasHoje: number;
  /** A mensagem é o passo 0 de uma empresa (conta no teto de novas). */
  ehPrimeiroContato: boolean;
  /** Mensagens de prospecção já aceitas para esta empresa (qualquer contato). */
  enviadasParaEmpresa: number;
}

export type DecisaoArbitro = { ok: true } | { ok: false; codigo: string; motivo: string };

export function arbitrar(e: EntradaArbitro): DecisaoArbitro {
  const { limites } = e;
  if (e.enviosHoje >= limites.enviosDia) {
    return { ok: false, codigo: 'teto_diario', motivo: `teto diário de ${limites.enviosDia} envios atingido` };
  }
  if (e.ehPrimeiroContato && e.novasHoje >= limites.novasEmpresasDia) {
    return { ok: false, codigo: 'teto_novas', motivo: `teto de ${limites.novasEmpresasDia} empresas novas por dia atingido` };
  }
  if (e.enviadasParaEmpresa >= limites.maxMensagensPorEmpresa) {
    return { ok: false, codigo: 'teto_empresa', motivo: `empresa já recebeu ${limites.maxMensagensPorEmpresa} mensagens` };
  }
  if (e.ultimoEnvioMarketingEm) {
    const horas = (e.agora.getTime() - e.ultimoEnvioMarketingEm.getTime()) / 3_600_000;
    if (horas < limites.intervaloMinHoras) {
      return { ok: false, codigo: 'intervalo_minimo', motivo: `menos de ${limites.intervaloMinHoras} h desde a última mensagem a este endereço` };
    }
  }
  return { ok: true };
}

/** Data (YYYY-MM-DD) do próximo passo da cadência, a partir do envio do passo atual. */
export function proximoPassoEm(passoAtual: number, enviadoEm: Date, limites: SalesLimites): Date | null {
  const dias = limites.cadenciaDias;
  const prox = passoAtual + 1;
  if (prox >= dias.length || prox >= limites.maxMensagensPorEmpresa) return null;
  const delta = (dias[prox] ?? 0) - (dias[passoAtual] ?? 0);
  return new Date(enviadoEm.getTime() + Math.max(delta, 1) * 86_400_000);
}
