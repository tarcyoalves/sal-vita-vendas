import { Button } from '../components/ui/button';
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm font-medium text-slate-500">Erro 404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          O endereço não existe ou foi movido. Volte ao início para continuar.
        </p>
        <Button onClick={() => setLocation("/")} className="mt-5">
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
