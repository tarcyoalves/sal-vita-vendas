// Resposta com duração mínima fixa: quem pede recuperação de senha não descobre, pelo tempo, se o
// e-mail existe (com cadastro o servidor envia e-mail e demora mais; sem cadastro respondia em 300 ms).
export async function comTempoMinimo<T>(
  minMs: number,
  fn: () => Promise<T>,
  agora: () => number = Date.now,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<T> {
  const inicio = agora();
  const completar = async () => {
    const falta = minMs - (agora() - inicio);
    if (falta > 0) await dormir(falta);
  };
  try {
    const r = await fn();
    await completar();
    return r;
  } catch (e) {
    await completar();
    throw e;
  }
}
