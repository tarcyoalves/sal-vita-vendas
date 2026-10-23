import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilo.css';

// Mostra erro caso algo quebre antes ou durante a inicialização do módulo.
function exibirErroFatal(titulo: string, detalhe: string): void {
  const raiz = document.getElementById('raiz') ?? document.body;
  if (!raiz) return;
  raiz.innerHTML = `
    <div style="padding:16px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff;min-height:100vh;box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;color:#dc2626;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong style="font-size:15px;">${titulo}</strong>
      </div>
      <p style="font-size:12px;color:#64748b;margin:0 0 12px 0;">Ocorreu um erro no painel do Vita Zap. Clique no botão abaixo para recarregar.</p>
      <pre style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px;border-radius:6px;font-size:11px;overflow:auto;max-height:220px;white-space:pre-wrap;word-break:break-all;">${detalhe}</pre>
      <button onclick="window.location.reload()" style="margin-top:14px;background:#059669;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
        Recarregar painel
      </button>
    </div>
  `;
}

window.addEventListener('error', (e) => {
  console.error('[Vita Zap Painel] Erro:', e.error ?? e.message);
  const raiz = document.getElementById('raiz');
  if (raiz && !raiz.hasChildNodes()) {
    exibirErroFatal('Erro ao carregar o painel', (e.error && (e.error.stack || e.error.message)) || e.message || 'Erro desconhecido');
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Vita Zap Painel] Promessa rejeitada:', e.reason);
});

// Boundary do React para nunca deixar o painel em branco se um componente falhar.
class PainelErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null; stack: string | null }> {
  override state = { erro: null, stack: null };

  static getDerivedStateFromError(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { erro: err.message, stack: err.stack ?? null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Vita Zap Painel] Erro capturado pelo boundary:', error, info);
  }

  override render() {
    if (this.state.erro) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b', minHeight: '100vh', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#dc2626' }}>
            <strong style={{ fontSize: 15 }}>Erro no componente do painel</strong>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px 0' }}>
            {this.state.erro}
          </p>
          {this.state.stack && (
            <pre style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 10, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 220, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.stack}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 14, background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Recarregar painel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <PainelErrorBoundary>
        <App />
      </PainelErrorBoundary>
    </StrictMode>,
  );
}
