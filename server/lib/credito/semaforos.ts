// Regras PURAS do endpoint `semaforos` (lista de pedidos: um semáforo por CNPJ sem 1 query por linha).
// O router só executa o SQL; quais documentos valem e quem pode vê-los é decidido aqui.
import { SEMAFORO, relatorioValido, type Semaforo, type Veredito } from '../../../shared/credito';

export const SEMAFOROS_MAX_DOCUMENTOS = 200;

/** Só dígitos, só CNPJ (14) ou CPF (11), sem repetição, no máximo 200. A ordem de chegada é mantida. */
export function normalizarDocumentosSemaforo(brutos: readonly string[]): string[] {
  const vistos = new Set<string>();
  for (const b of brutos) {
    const d = (b ?? '').replace(/\D/g, '');
    if (d.length !== 11 && d.length !== 14) continue;
    vistos.add(d);
    if (vistos.size >= SEMAFOROS_MAX_DOCUMENTOS) break;
  }
  return [...vistos];
}

/** Admin e gerente veem todos; atendente só os documentos de tarefa ou de pedido dele. */
export function documentosVisiveis(
  documentos: readonly string[],
  quem: { staff: boolean; daCarteira: ReadonlySet<string> },
): string[] {
  return quem.staff ? [...documentos] : documentos.filter((d) => quem.daCarteira.has(d));
}

export interface SemaforoDoDocumento { veredito: Veredito; semaforo: Semaforo; valido: boolean; simulado: boolean }

export function montarSemaforos(
  linhas: ReadonlyArray<{ documento: string; veredito: Veredito; consultadoEm: Date | string; provedor: string }>,
  agora: Date = new Date(),
): Record<string, SemaforoDoDocumento> {
  const out: Record<string, SemaforoDoDocumento> = {};
  for (const l of linhas) {
    if (out[l.documento]) continue; // a primeira linha de cada documento é a mais recente
    out[l.documento] = {
      veredito: l.veredito, semaforo: SEMAFORO[l.veredito], valido: relatorioValido(l.consultadoEm, agora), simulado: l.provedor === 'simulado',
    };
  }
  return out;
}
