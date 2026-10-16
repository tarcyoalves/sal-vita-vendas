import { cn } from '../lib/utils';
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { ehErroDeChunk, recuperarDeVersaoAntiga } from "../lib/versaoNova";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Versão nova publicada: limpa o cache do app e recarrega sozinho (uma vez por minuto).
    if (ehErroDeChunk(error)) void recuperarDeVersaoAntiga();
  }

  render() {
    if (this.state.hasError && ehErroDeChunk(this.state.error)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Atualizando o sistema…</h2>
            <p className="mb-4 text-sm text-slate-600">Saiu uma versão nova. A página recarrega sozinha; se não recarregar, clique abaixo.</p>
            <button
              onClick={() => { void recuperarDeVersaoAntiga().then((ok) => { if (!ok) window.location.reload(); }); }}
              className={cn("flex items-center gap-2 mx-auto px-4 py-2 rounded-lg", "bg-primary text-primary-foreground", "hover:opacity-90 cursor-pointer")}
            >
              <RotateCcw size={16} />
              Atualizar agora
            </button>
          </div>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
