import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSENT_CHANGE_EVENT, CONSENT_OPEN_EVENT, getConsent, loadMetaPixel, saveConsent, stopPixel,
  type ConsentChoice,
} from './pixelConsent';

// Aviso de cookies do Meta Pixel. O Pixel só carrega depois do "Aceitar". "Recusar" grava a
// escolha e nunca carrega. Os dois botões têm o mesmo peso visual. Fixo no rodapé; no celular
// a barra de compra sobe junto (variável --sv-consent-h) para o botão de compra continuar livre.

const NAVY = '#0b1f3a';
const GOLD = '#c9a227';

export default function ConsentBanner({ pageView = true }: { pageView?: boolean }) {
  const [open, setOpen] = useState(() => getConsent() === null);
  const ref = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  // Reabre pelo link "Preferências de cookies".
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, show);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, show);
  }, []);

  // Reserva o espaço do banner: a barra fixa de compra sobe e a página ganha folga no fim.
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.classList.remove('sv-consent-open');
      root.style.removeProperty('--sv-consent-h');
      return;
    }
    const apply = () => {
      const h = ref.current?.offsetHeight ?? 0;
      root.style.setProperty('--sv-consent-h', `${h}px`);
    };
    root.classList.add('sv-consent-open');
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      root.classList.remove('sv-consent-open');
      root.style.removeProperty('--sv-consent-h');
    };
  }, [open]);

  // Quando reaberto pelo link, leva o foco ao banner.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) firstBtn.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const choose = useCallback((choice: ConsentChoice) => {
    const before = getConsent();
    saveConsent(choice);
    if (choice === 'accepted') loadMetaPixel({ pageView });
    else if (before === 'accepted') stopPixel();
    setOpen(false);
    try { window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT)); } catch { /* ignora */ }
  }, [pageView]);

  if (!open) return null;

  return (
    <>
      <style>{`
        .svc-wrap{position:fixed;left:0;right:0;bottom:0;z-index:600;background:${NAVY};border-top:2px solid ${GOLD};color:#fff;padding:14px 16px calc(14px + env(safe-area-inset-bottom));font-family:'Inter',system-ui,sans-serif}
        .svc-in{max-width:1080px;margin:0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
        .svc-txt{flex:1 1 340px;margin:0;font-size:.9rem;line-height:1.5;color:rgba(255,255,255,.9)}
        .svc-txt a{color:#e0bf54;text-decoration:underline;text-underline-offset:3px}
        .svc-btns{display:flex;gap:10px;flex:0 0 auto}
        .svc-btn{min-height:44px;min-width:112px;padding:0 20px;background:transparent;color:#fff;border:1.5px solid ${GOLD};border-radius:10px;font:inherit;font-size:.92rem;font-weight:700;cursor:pointer}
        .svc-btn:hover{background:rgba(201,162,39,.18)}
        .svc-btn:focus-visible{outline:3px solid #e0bf54;outline-offset:2px}
        html.sv-consent-open body{padding-bottom:var(--sv-consent-h,0)}
        @media (max-width:760px){
          html.sv-consent-open .sticky-bar{bottom:var(--sv-consent-h,0)!important;padding-bottom:10px!important}
          .svc-wrap{padding:12px 14px calc(12px + env(safe-area-inset-bottom))}
          .svc-txt{font-size:.84rem;line-height:1.45}
          .svc-btns{width:100%}
          .svc-btn{flex:1}
        }
      `}</style>
      <div ref={ref} className="svc-wrap" role="region" aria-label="Aviso de cookies">
        <div className="svc-in">
          <p className="svc-txt">
            Usamos o Pixel da Meta para medir a visita e avaliar nossos anúncios. Ele só é ativado se você aceitar.
            Veja os detalhes na <a href="/privacidade">Política de privacidade</a>.
          </p>
          <div className="svc-btns">
            <button type="button" ref={firstBtn} className="svc-btn" onClick={() => choose('declined')}>Recusar</button>
            <button type="button" className="svc-btn" onClick={() => choose('accepted')}>Aceitar</button>
          </div>
        </div>
      </div>
    </>
  );
}
