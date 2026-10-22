// Aviso de versão nova: o painel lê um arquivo ESTÁTICO do site do CRM (/vita-zap/versao.json, gerado por
// `npm run publicar`), no máximo 1 vez a cada 6 h. Não toca o banco do CRM. Lógica pura, com dependências
// injetadas, para testar sem chrome nem rede.

import { URL_CRM_PADRAO } from './constantes';

export const URL_VERSAO_JSON = `${URL_CRM_PADRAO}/vita-zap/versao.json`;
/** Página do CRM com o instalador, o zip e o passo a passo. */
export const URL_PAGINA_INSTALACAO = `${URL_CRM_PADRAO}/vita-zap`;
export const INTERVALO_CHECAGEM_MS = 6 * 60 * 60_000;

/** "0.7.0" → [0,7,0]. Texto que não é versão numérica → null. */
function partes(v: string): number[] | null {
  if (!/^\d+(\.\d+){0,3}$/.test(v.trim())) return null;
  return v.trim().split('.').map(Number);
}

/** <0 se a < b, 0 se iguais, >0 se a > b. Versão inválida conta como 0.0.0 (nunca "mais nova"). */
export function compararVersoes(a: string, b: string): number {
  const pa = partes(a) ?? [0];
  const pb = partes(b) ?? [0];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function ehVersaoMaior(nova: string, atual: string): boolean {
  return partes(nova) !== null && compararVersoes(nova, atual) > 0;
}

/** Lê o corpo do versao.json; qualquer coisa fora de `{ versao: "x.y.z" }` → null. */
export function lerVersaoJson(corpo: unknown): string | null {
  const v = typeof corpo === 'object' && corpo !== null ? (corpo as { versao?: unknown }).versao : undefined;
  return typeof v === 'string' && partes(v) !== null ? v.trim() : null;
}

export interface DependenciasVersao {
  agora: () => number;
  /** Quando foi a última checagem (ms), 0 se nunca. */
  ultimaChecagem: () => number;
  versaoGuardada: () => string;
  guardar: (checadaEm: number, versao: string) => void;
  /** Só chamada quando passou o intervalo e o Chrome já deu acesso ao CRM. */
  podeBuscar: () => Promise<boolean>;
  buscar: () => Promise<unknown>;
  versaoInstalada: () => string;
}

/** Devolve a versão nova disponível (maior que a instalada) ou null. Rede só se passaram 6 h. */
export async function versaoNovaDisponivel(d: DependenciasVersao): Promise<string | null> {
  const agora = d.agora();
  let publicada = d.versaoGuardada();
  if (agora - d.ultimaChecagem() >= INTERVALO_CHECAGEM_MS && (await d.podeBuscar().catch(() => false))) {
    let lida: string | null = null;
    try {
      lida = lerVersaoJson(await d.buscar());
    } catch {
      /* sem rede ou arquivo ruim: tenta de novo só daqui a 6 h */
    }
    if (lida) publicada = lida;
    d.guardar(agora, publicada);
  }
  return publicada && ehVersaoMaior(publicada, d.versaoInstalada()) ? publicada : null;
}
