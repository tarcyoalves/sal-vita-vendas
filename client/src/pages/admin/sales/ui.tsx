// Peças visuais comuns das abas do painel "Vendas B2B". Mesmo visual do admin da loja (B2bLeads.tsx).
import { useState, type ReactNode } from 'react';
import { AlertCircle, Construction, RefreshCw } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { errorMessage } from '../../../components/premium/admin/adminLogic';

export type Tom = 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'blue';
const TOM: Record<Tom, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
  sky: 'bg-sky-50 text-sky-900 border-sky-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
};

export function Pill({ tom = 'slate', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${TOM[tom]}`}>{children}</span>;
}

export function Card({ titulo, acao, children, className = '' }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 min-w-0 ${className}`}>
      {(titulo || acao) && (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          {titulo && <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Aviso({ tom = 'amber', titulo, children }: { tom?: Tom; titulo?: string; children: ReactNode }) {
  return (
    <div role="status" className={`rounded-2xl border p-4 text-sm ${TOM[tom]}`}>
      {titulo && <p className="font-bold mb-0.5">{titulo}</p>}
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500 text-center py-8">{children}</p>;
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{rotulo}</span>
      {children}
      {dica && <span className="block text-[11px] text-slate-500 mt-1">{dica}</span>}
    </label>
  );
}

export function Interruptor({ ligado, onChange, rotulo, disabled }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className="inline-flex items-center gap-3 min-h-[44px] text-left cursor-pointer disabled:opacity-50"
    >
      <span className={`relative inline-block w-11 h-6 rounded-full transition shrink-0 ${ligado ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      <span className="text-sm font-medium text-slate-800">{rotulo}</span>
    </button>
  );
}

type ErroTrpc = { message: string; data?: { code?: string } | null } | null;

/** Erro "em construção" (operação ainda não implementada no servidor) é aviso, não falha. */
export function emConstrucao(e: ErroTrpc): boolean {
  return e?.data?.code === 'NOT_IMPLEMENTED';
}

export function EmConstrucao() {
  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-8 text-center">
      <Construction className="w-9 h-9 text-amber-600 mx-auto mb-2" aria-hidden="true" />
      <p className="font-bold text-slate-900 text-sm">Em construção</p>
      <p className="text-xs text-slate-600 mt-1">Esta parte do painel ainda não está ligada no servidor.</p>
    </div>
  );
}

/** Carregando / erro / em construção / conteúdo. Erro nunca parece lista vazia. */
export function Consulta({ carregando, erro, refazer, children }: {
  carregando: boolean; erro: ErroTrpc; refazer: () => void; children: ReactNode;
}) {
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-400" aria-label="Carregando" />
      </div>
    );
  }
  if (erro) {
    if (emConstrucao(erro)) return <EmConstrucao />;
    return (
      <div role="alert" className="bg-white rounded-2xl border border-rose-200 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" aria-hidden="true" />
        <p className="font-bold text-slate-900 text-sm">Não foi possível carregar</p>
        <p className="text-xs text-slate-600 mt-1 break-words">{errorMessage(erro)}</p>
        <button type="button" onClick={refazer} className={`${btn.primary} mt-3`}>Tentar de novo</button>
      </div>
    );
  }
  return <>{children}</>;
}

/** Pede um motivo (obrigatório) antes de executar. */
export function MotivoDialog({ aberto, aoFechar, titulo, descricao, rotulo = 'Motivo', confirmar, perigoso, minimo = 3, aoConfirmar }: {
  aberto: boolean; aoFechar: () => void; titulo: string; descricao?: ReactNode; rotulo?: string;
  confirmar: string; perigoso?: boolean; minimo?: number; aoConfirmar: (motivo: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const curto = texto.trim().length < minimo;
  return (
    <AlertDialog open={aberto} onOpenChange={(o) => { if (!o) { setTexto(''); aoFechar(); } }}>
      <AlertDialogContent className="bg-white text-slate-900 max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-slate-600 space-y-2">{descricao}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block text-xs font-semibold text-slate-600">
          {rotulo}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500} className={`${INPUT} mt-1.5`} />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel className={btn.secondary}>Voltar</AlertDialogCancel>
          <button
            type="button"
            disabled={curto}
            onClick={() => { const m = texto.trim(); setTexto(''); aoFechar(); aoConfirmar(m); }}
            className={perigoso ? btn.danger : btn.primary}
          >
            {confirmar}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function fmtData(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : fmtDataHora.format(dt);
}

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(d: Date | string | null | undefined, agora: number = Date.now()): string {
  if (!d) return 'nunca';
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  if (Number.isNaN(t)) return '—';
  const min = Math.max(0, Math.round((agora - t) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
}

export const brlCentavos = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data de hoje (America/Sao_Paulo) no formato AAAA-MM-DD, deslocada por `dias`. */
export function dataSp(dias = 0): string {
  const base = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(base);
}

/** Tabela no desktop, cartões no celular (sem rolagem horizontal). */
export function TabelaResp<T>({ colunas, linhas, chave, vazio = 'Sem dados no período.' }: {
  colunas: Array<{ titulo: string; render: (l: T) => ReactNode; alinhaDireita?: boolean }>;
  linhas: T[]; chave: (l: T) => string; vazio?: string;
}) {
  if (linhas.length === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <>
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            {colunas.map((c) => <th key={c.titulo} className={`py-2 pr-3 font-semibold ${c.alinhaDireita ? 'text-right' : ''}`}>{c.titulo}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={chave(l)} className="border-b border-slate-100 last:border-0">
              {colunas.map((c) => <td key={c.titulo} className={`py-2 pr-3 ${c.alinhaDireita ? 'text-right tabular-nums' : ''}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sm:hidden space-y-2">
        {linhas.map((l) => (
          <li key={chave(l)} className="rounded-xl border border-slate-200 p-3 text-sm space-y-1">
            {colunas.map((c) => (
              <div key={c.titulo} className="flex justify-between gap-3">
                <span className="text-slate-500 text-xs">{c.titulo}</span>
                <span className="font-medium text-slate-900 text-right min-w-0 break-words">{c.render(l)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export const SELECT = INPUT;
