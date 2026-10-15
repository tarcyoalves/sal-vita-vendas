import { useEffect } from 'react';

/**
 * Diálogos encadeados (fechar a confirmação e abrir o relatório no mesmo instante) podem deixar o Radix com o
 * bloqueio de rolagem preso no <body> (overflow hidden / pointer-events none / margem de scrollbar).
 * Com a tela sem nenhum diálogo aberto, tira esses restos.
 */
export function limparBloqueioDeScrollSeOrfao(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
  const b = doc.body;
  let mudou = false;
  if (b.style.pointerEvents === 'none') { b.style.pointerEvents = ''; mudou = true; }
  if (b.style.overflow === 'hidden') { b.style.overflow = ''; mudou = true; }
  if (b.style.paddingRight) { b.style.paddingRight = ''; mudou = true; }
  if (b.style.marginRight) { b.style.marginRight = ''; mudou = true; }
  if (b.hasAttribute('data-scroll-locked')) { b.removeAttribute('data-scroll-locked'); mudou = true; }
  return mudou;
}

/** `algumAberto=false` por 400 ms ⇒ limpa o que sobrou. */
export function useLiberarScrollTravado(algumAberto: boolean): void {
  useEffect(() => {
    if (algumAberto) return;
    const t = setTimeout(() => { limparBloqueioDeScrollSeOrfao(); }, 400);
    return () => clearTimeout(t);
  }, [algumAberto]);
}
