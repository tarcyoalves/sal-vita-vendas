// Cobrança incerta: a consulta paga falhou DEPOIS de ser enviada (tempo esgotado, conexão derrubada) e o provedor
// pode ter cobrado. Repetir na hora paga duas vezes. Por isso o mesmo documento/produto fica travado por alguns
// minutos (o admin confere o extrato da API Full); `confirmarRepeticao: true` libera quando ele já conferiu.

/** Texto gravado em credit_queries.erro. O router grava e consulta por esta mesma marca. */
export const MARCA_COBRANCA_INCERTA = 'PODE TER SIDO COBRADA';
export const JANELA_COBRANCA_INCERTA_MS = 10 * 60 * 1000;

export interface ErroIncertoRecente { produto: string | null; finalizadoEm: Date | string | null }

/** Mensagem de bloqueio, ou null se pode consultar. Só conta erro incerto dos produtos que serão consultados agora. */
export function bloqueioPorCobrancaIncerta(
  recentes: readonly ErroIncertoRecente[],
  produtosAConsultar: readonly string[],
  opts: { confirmarRepeticao?: boolean; agora?: number },
): string | null {
  if (opts.confirmarRepeticao) return null;
  const agora = opts.agora ?? Date.now();
  let maisRecente = 0;
  for (const r of recentes) {
    if (!r.produto || !produtosAConsultar.includes(r.produto) || !r.finalizadoEm) continue;
    const t = new Date(r.finalizadoEm).getTime();
    if (Number.isNaN(t) || agora - t >= JANELA_COBRANCA_INCERTA_MS) continue;
    if (t > maisRecente) maisRecente = t;
  }
  if (maisRecente === 0) return null;
  const faltam = Math.max(1, Math.ceil((JANELA_COBRANCA_INCERTA_MS - (agora - maisRecente)) / 60_000));
  return `A última consulta deste documento falhou depois de enviada e PODE ter sido cobrada. Confira o extrato da API Full antes de repetir. Nova consulta liberada em ~${faltam} min (ou confirme a repetição, se já conferiu o extrato).`;
}
