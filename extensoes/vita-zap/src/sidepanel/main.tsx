import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilo.css';

// Enter no painel nunca aciona botão: o Enter do fluxo "uma tecla" é para o WhatsApp.
// Se o foco ficou num botão do painel, um Enter distraído poderia "Pular" o contato.
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) e.preventDefault();
  },
  true,
);

const raiz = document.getElementById('raiz');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
