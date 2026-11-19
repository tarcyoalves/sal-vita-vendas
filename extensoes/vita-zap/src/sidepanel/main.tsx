import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ATRIBUTO_RECARREGAR, codigoDeSuporte, exibirErroFatal, instalarTratamentoDeErroFatal, recarregarPainel, teclaDeAcionar } from './erro-fatal';
import './estilo.css';

// Erros antes ou durante a inicialização: tela simples com botão de recarregar (sem HTML inline, a CSP da extensão bloqueia).
instalarTratamentoDeErroFatal();

// Boundary do React para nunca deixar o painel em branco se um componente falhar.
class PainelErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null }> {
  override state = { erro: null };

  static getDerivedStateFromError(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { erro: err.stack || err.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Vita Zap Painel] Erro capturado pelo boundary:', error, info);
  }

  override render() {
    if (this.state.erro) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b', minHeight: '100vh', boxSizing: 'border-box' }}>
          <strong style={{ display: 'block', fontSize: 15, color: '#dc2626', marginBottom: 12 }}>O painel do Vita Zap parou</strong>
          <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px 0' }}>Clique em "Recarregar painel". Se continuar assim, fale com o suporte e informe o código abaixo.</p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px 0' }}>Código de suporte: {codigoDeSuporte(this.state.erro)}</p>
          <button
            type="button"
            {...{ [ATRIBUTO_RECARREGAR]: '1' }}
            onClick={recarregarPainel}
            onKeyDown={(e) => {
              if (!teclaDeAcionar(e)) return;
              e.preventDefault();
              recarregarPainel();
            }}
            style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Recarregar painel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// O App é carregado depois dos ouvintes: se o módulo falhar ao carregar, a tela de erro aparece (um import estático derrubaria tudo em branco).
const raiz = document.getElementById('raiz');
if (raiz) {
  import('./App')
    .then(({ App }) => {
      createRoot(raiz).render(
        <StrictMode>
          <PainelErrorBoundary>
            <App />
          </PainelErrorBoundary>
        </StrictMode>,
      );
    })
    .catch((e: unknown) => {
      console.error('[Vita Zap Painel] Falha ao carregar o painel:', e);
      exibirErroFatal(raiz, e instanceof Error ? e.stack || e.message : String(e));
    });
}
