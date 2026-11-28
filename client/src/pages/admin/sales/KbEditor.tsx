import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, CheckCircle2, Pencil, Plus, Upload } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { ConfirmDialog } from '../../../components/premium/admin/ConfirmDialog';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import { Aviso, Campo, Card, Consulta, Pill, Vazio, fmtData } from './ui';
import { KB_KIND_LABEL, KB_STATUS_LABEL } from './motivos';

const KINDS = ['produto', 'politica', 'objecao', 'resposta_padrao', 'proibido'] as const;
type Kind = (typeof KINDS)[number];
const MAX = 4000;
const EXEMPLO = '[{"kind":"produto","key":"caixa-10kg","title":"Caixa de 10 kg","content":"Texto aprovado pelo dono..."}]';

type Rascunho = { id?: number; kind: Kind; key: string; title: string; content: string };
const VAZIO: Rascunho = { kind: 'produto', key: '', title: '', content: '' };

export default function KbEditor() {
  const utils = trpc.useUtils();
  const q = trpc.sales.kbListar.useQuery();
  const [form, setForm] = useState<Rascunho | null>(null);
  const [arquivar, setArquivar] = useState<number | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [importando, setImportando] = useState(false);
  const [json, setJson] = useState('');

  const refazer = () => utils.sales.kbListar.invalidate();
  const salvar = trpc.sales.kbSalvar.useMutation({
    onSuccess: (i) => { toast.success(i.status === 'draft' ? 'Salvo como rascunho. Aprove para o assistente usar.' : 'Salvo.'); setForm(null); refazer(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aprovar = trpc.sales.kbAprovar.useMutation({ onSuccess: () => { toast.success('Aprovado. O assistente já pode usar.'); refazer(); }, onError: (e) => toast.error(errorMessage(e)) });
  const arquivarMut = trpc.sales.kbArquivar.useMutation({ onSuccess: () => { toast.success('Arquivado.'); refazer(); }, onError: (e) => toast.error(errorMessage(e)) });
  const importar = trpc.sales.kbImportar.useMutation({
    onSuccess: (r) => { toast.success(`Importado: ${r.criados} novo(s), ${r.atualizados} atualizado(s). Todos entram como rascunho.`); setImportando(false); setJson(''); refazer(); },
    onError: (e) => toast.error(errorMessage(e), { duration: 10000 }),
  });

  const itens = (q.data ?? []).filter((i) => verArquivados || i.status !== 'archived');

  const enviarJson = () => {
    let valor: unknown;
    try { valor = JSON.parse(json); } catch { toast.error('Isso não é um JSON válido. Confira vírgulas e aspas.'); return; }
    importar.mutate({ itens: valor });
  };

  return (
    <Card
      titulo="Base de conhecimento do vendedor virtual"
      acao={
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setImportando(!importando)} className={btn.secondary}><Upload className="w-4 h-4" aria-hidden="true" /> Importar JSON</button>
          <button type="button" onClick={() => setForm({ ...VAZIO })} className={btn.primary}><Plus className="w-4 h-4" aria-hidden="true" /> Novo item</button>
        </div>
      }
    >
      <Aviso tom="sky" titulo="Só o que está aprovado chega ao assistente">
        Itens em rascunho ou arquivados nunca são usados nas conversas. Editar um item aprovado o devolve para rascunho: aprove de novo.
      </Aviso>

      {importando && (
        <div className="mt-4 rounded-xl border border-slate-200 p-3 space-y-2">
          <Campo rotulo="Cole a lista em JSON" dica={`Até 200 itens, cada texto com no máximo ${MAX} letras. Exemplo: ${EXEMPLO}`}>
            <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} className={`${INPUT} font-mono text-xs`} />
          </Campo>
          <button type="button" disabled={!json.trim() || importar.isPending} onClick={enviarJson} className={btn.primary}>Importar como rascunho</button>
        </div>
      )}

      {form && (
        <div className="mt-4 rounded-xl border border-slate-200 p-3 space-y-3">
          <p className="text-sm font-bold">{form.id ? 'Editar item' : 'Novo item'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })} className={INPUT}>
                {KINDS.map((k) => <option key={k} value={k}>{KB_KIND_LABEL[k]}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Código curto" dica="Sem espaços. Ex.: caixa-10kg"><input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} maxLength={80} className={INPUT} /></Campo>
          </div>
          <Campo rotulo="Título"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} className={INPUT} /></Campo>
          <Campo rotulo="Texto" dica={`${form.content.length} de ${MAX} letras`}>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={7} maxLength={MAX} className={INPUT} />
          </Campo>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={salvar.isPending || form.key.trim().length < 2 || form.title.trim().length < 2 || !form.content.trim()} onClick={() => salvar.mutate(form)} className={btn.primary}>Salvar</button>
            <button type="button" onClick={() => setForm(null)} className={btn.secondary}>Cancelar</button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-600 mt-4 min-h-[44px]">
        <input type="checkbox" checked={verArquivados} onChange={(e) => setVerArquivados(e.target.checked)} className="w-4 h-4" /> Mostrar arquivados
      </label>

      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {itens.length === 0 ? <Vazio>Nenhum item ainda.</Vazio> : (
          <div className="space-y-5">
            {KINDS.map((k) => {
              const grupo = itens.filter((i) => i.kind === k);
              if (grupo.length === 0) return null;
              return (
                <div key={k}>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{KB_KIND_LABEL[k]}</h4>
                  <ul className="space-y-2">
                    {grupo.map((i) => (
                      <li key={i.id} className="rounded-xl border border-slate-200 p-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-bold text-sm text-slate-900 break-words min-w-0">{i.title}</p>
                          <Pill tom={i.status === 'approved' ? 'emerald' : i.status === 'draft' ? 'amber' : 'slate'}>{KB_STATUS_LABEL[i.status]}</Pill>
                          <Pill>v{i.version}</Pill>
                        </div>
                        <p className="text-[11px] text-slate-500 break-all">{i.key}{i.approvedBy ? ` · aprovado por ${i.approvedBy} em ${fmtData(i.approvedAt)}` : ''}</p>
                        <p className="text-[13px] text-slate-700 mt-1 line-clamp-3 whitespace-pre-wrap break-words">{i.content}</p>
                        {i.status !== 'archived' && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button" onClick={() => setForm({ id: i.id, kind: i.kind, key: i.key, title: i.title, content: i.content })} className={btn.secondary}><Pencil className="w-4 h-4" aria-hidden="true" /> Editar</button>
                            {i.status === 'draft' && <button type="button" disabled={aprovar.isPending} onClick={() => aprovar.mutate({ id: i.id })} className={btn.success}><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Aprovar</button>}
                            <button type="button" onClick={() => setArquivar(i.id)} className={btn.secondary}><Archive className="w-4 h-4" aria-hidden="true" /> Arquivar</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Consulta>

      <ConfirmDialog
        open={arquivar !== null}
        onOpenChange={(o) => { if (!o) setArquivar(null); }}
        title="Arquivar este item?"
        description={<p>O assistente deixa de usar este texto.</p>}
        confirmLabel="Arquivar"
        destructive
        onConfirm={() => { if (arquivar !== null) arquivarMut.mutate({ id: arquivar }); }}
      />
    </Card>
  );
}
