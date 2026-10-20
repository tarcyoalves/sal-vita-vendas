// Regras PURAS do endpoint `semaforos` (lista de pedidos: um semáforo por CNPJ sem 1 query por linha).
// O router só executa o SQL; quais documentos valem e quem pode vê-los é decidido aqui.
import { SEMAFORO, type Semaforo, type Veredito } from '../../../shared/credito';
import { escolherEfetivo } from './produtos';

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

/**
 * Semáforo EFETIVO por documento: o mais recente válido (<30 dias) de cada produto e, entre produtos, o pior veredito.
 * `linhas` vêm da mais recente para a mais antiga. Sem nenhum válido, vale o mais recente (marcado vencido).
 */
export function montarSemaforos(
  linhas: ReadonlyArray<{ documento: string; veredito: Veredito; consultadoEm: Date | string; provedor: string; produto?: string | null }>,
  agora: Date = new Date(),
): Record<string, SemaforoDoDocumento> {
  const porDocumento = new Map<string, Array<(typeof linhas)[number]>>();
  for (const l of linhas) {
    const lista = porDocumento.get(l.documento);
    if (lista) lista.push(l); else porDocumento.set(l.documento, [l]);
  }
  const out: Record<string, SemaforoDoDocumento> = {};
  for (const [documento, lista] of porDocumento) {
    const e = escolherEfetivo(lista, agora);
    if (!e) continue;
    out[documento] = { veredito: e.veredito, semaforo: SEMAFORO[e.veredito], valido: e.valido, simulado: e.principal.provedor === 'simulado' };
  }
  return out;
}
