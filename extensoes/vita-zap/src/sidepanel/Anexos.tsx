// Anexos da campanha (0.7.65): escolher, listar com miniatura/ícone e trocar. Só o modo "texto primeiro, arquivos depois".
import { useEffect, useState } from 'react';
import { guardarAnexos, lerAnexoGuardado, type Banco } from '../shared/banco';
import {
  AVISO_BACKUP_ANEXOS,
  EXPLICACAO_MODO_ANEXOS,
  MAX_ANEXOS,
  ehImagem,
  formatarTamanho,
  tipoDoArquivo,
  montarMetadados,
  validarAnexos,
  type AnexoMeta,
} from '../shared/anexos';

const ACEITA = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

interface LinhaAnexo {
  chave: string;
  nome: string;
  tipo: string;
  tamanho: number;
  blob: Blob | null;
  /** false = o arquivo não está neste computador (ex.: backup restaurado). */
  guardado?: boolean;
}

/** Miniatura (imagem) ou ícone + nome (PDF). */
export function ListaAnexos({ linhas, aoRemover }: { linhas: LinhaAnexo[]; aoRemover?: (chave: string) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const novas: Record<string, string> = {};
    for (const l of linhas) if (l.blob && ehImagem(l.tipo) && typeof URL.createObjectURL === 'function') novas[l.chave] = URL.createObjectURL(l.blob);
    setUrls(novas);
    return () => {
      for (const u of Object.values(novas)) URL.revokeObjectURL(u);
    };
  }, [linhas]);
  if (linhas.length === 0) return null;
  return (
    <ul className="lista-anexos" style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}>
      {linhas.map((l, i) => (
        <li key={l.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
          {urls[l.chave] ? (
            <img src={urls[l.chave]} alt={l.nome} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
          ) : (
            <span aria-hidden="true" style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
              {ehImagem(l.tipo) ? 'IMG' : 'PDF'}
            </span>
          )}
          <span style={{ flex: 1, fontSize: 13 }}>
            {i + 1}. {l.nome} <span style={{ color: 'var(--suave)' }}>({formatarTamanho(l.tamanho)})</span>
            {l.guardado === false && <b style={{ color: '#b91c1c' }}> · arquivo ausente neste computador: anexe de novo</b>}
          </span>
          {aoRemover && (
            <button type="button" className="pequeno" onClick={() => aoRemover(l.chave)}>
              Remover
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Campo "Anexos": até 3 arquivos, imagem (jpg/png/webp) ou PDF, 5 MB cada e 12 MB no total. Recusa fora disso com mensagem clara. */
export function CampoAnexos({ arquivos, aoMudar }: { arquivos: File[]; aoMudar: (f: File[]) => void }) {
  const [erros, setErros] = useState<string[]>([]);
  function aoEscolher(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const todos = [...arquivos, ...Array.from(lista)];
    const e = validarAnexos(todos);
    setErros(e);
    if (e.length === 0) aoMudar(todos);
  }
  return (
    <div className="campo-anexos">
      <label>
        Anexos (opcional, até {MAX_ANEXOS}: foto ou PDF)
        <input type="file" multiple accept={ACEITA} disabled={arquivos.length >= MAX_ANEXOS} onChange={(e) => { aoEscolher(e.target.files); e.target.value = ''; }} />
      </label>
      <ListaAnexos
        linhas={arquivos.map((f, i) => ({ chave: `${i}:${f.name}`, nome: f.name, tipo: tipoDoArquivo(f.name, f.type), tamanho: f.size, blob: f }))}
        aoRemover={(chave) => {
          aoMudar(arquivos.filter((f, i) => `${i}:${f.name}` !== chave));
          setErros([]);
        }}
      />
      {erros.map((e) => (
        <p key={e} className="erro" role="alert">
          {e}
        </p>
      ))}
      <p className="ajuda">{EXPLICACAO_MODO_ANEXOS}</p>
      <p className="ajuda">{AVISO_BACKUP_ANEXOS}</p>
    </div>
  );
}

/** Anexos de uma campanha já gravada (lê os Blobs do IndexedDB para as miniaturas e para avisar os que faltam). */
export function AnexosDaCampanha({ db, campanhaId, anexos }: { db: Banco; campanhaId: string; anexos: AnexoMeta[] }) {
  const [linhas, setLinhas] = useState<LinhaAnexo[]>(() => anexos.map((a) => ({ chave: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, blob: null })));
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const lidas: LinhaAnexo[] = [];
      for (const a of anexos) {
        const g = await lerAnexoGuardado(db, campanhaId, a.id).catch(() => undefined);
        lidas.push({ chave: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, blob: g?.blob ?? null, guardado: g != null });
      }
      if (vivo) setLinhas(lidas);
    })();
    return () => {
      vivo = false;
    };
  }, [db, campanhaId, anexos]);
  return <ListaAnexos linhas={linhas} />;
}

/** Anexar de novo (ex.: depois de restaurar um backup) ou trocar os anexos de uma campanha que ainda não começou a mandar arquivos. */
export function TrocarAnexos({ db, campanhaId, aoSalvar }: { db: Banco; campanhaId: string; aoSalvar: (anexos: AnexoMeta[], guardar: () => Promise<void>) => Promise<boolean> }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  async function salvar(lista: File[]) {
    const e = validarAnexos(lista);
    if (e.length > 0) return setMsg(e.join(' '));
    const metas = await montarMetadados(lista, () => `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`);
    const ok = await aoSalvar(metas, () => guardarAnexos(db, campanhaId, metas.map((m, i) => ({ anexoId: m.id, nome: m.nome, tipo: m.tipo, blob: lista[i] }))));
    setMsg(ok ? (lista.length > 0 ? 'Anexos guardados.' : 'Anexos removidos.') : 'Não troquei: a campanha está rodando ou já enviou texto a alguém. Troque antes de iniciar.');
    if (ok) setArquivos([]);
  }
  return (
    <div>
      <CampoAnexos arquivos={arquivos} aoMudar={setArquivos} />
      <div className="botoes">
        <button type="button" className="pequeno" disabled={arquivos.length === 0} onClick={() => void salvar(arquivos)}>
          Guardar estes anexos
        </button>
        <button type="button" className="pequeno" onClick={() => void salvar([])}>
          Remover os anexos da campanha
        </button>
      </div>
      {msg && <p className="info" role="status">{msg}</p>}
    </div>
  );
}
