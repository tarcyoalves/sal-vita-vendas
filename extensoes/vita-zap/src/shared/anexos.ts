// Anexos da campanha (0.7.65): até 3 arquivos (imagem jpg/png/webp ou PDF) enviados DEPOIS do texto, um por vez.
//
// Modo único: "Texto primeiro, arquivos depois". A legenda da prévia de mídia do WhatsApp fica SEMPRE vazia (nunca se cola
// texto nela): o texto da campanha sai como mensagem normal e cada arquivo sai sozinho, em seguida.
// Os arquivos (Blob) ficam só no IndexedDB deste computador (loja `anexos`); o backup leva apenas os metadados.

export const MAX_ANEXOS = 3;
export const MAX_BYTES_ARQUIVO = 5 * 1024 * 1024;
export const MAX_BYTES_TOTAL = 12 * 1024 * 1024;
export const TIPOS_ANEXO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export const AVISO_BACKUP_ANEXOS = 'Os anexos não vão no backup; anexe de novo após restaurar.';
export const EXPLICACAO_MODO_ANEXOS =
  'Modo único: o texto sai primeiro, como mensagem normal, e depois cada arquivo sai sozinho (sem legenda). No envio manual, o programa cola o arquivo e deixa a prévia do WhatsApp aberta: você aperta o botão de enviar da prévia.';

/** O que fica no registro da campanha (e no backup): nunca o conteúdo do arquivo. */
export interface AnexoMeta {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  /** SHA-256 (hex) do conteúdo. */
  hash: string;
}

/** Linha da loja `anexos` do IndexedDB (chave `${campanhaId}:${anexoId}`). */
export interface AnexoGuardado {
  id: string;
  campanhaId: string;
  anexoId: string;
  nome: string;
  tipo: string;
  tamanho: number;
  blob: Blob;
}

/** Progresso por contato: o que JÁ saiu. Texto enviado nunca é reenviado ao retomar. */
export interface ProgressoItem {
  textoEnviado: boolean;
  /** Quantos anexos já saíram (na ordem). */
  anexosEnviados: number;
}

/** Arquivo que atravessa o chrome.runtime até o content script (mensagem JSON: bytes em base64). */
export interface ArquivoParaColar {
  nome: string;
  tipo: string;
  tamanho: number;
  base64: string;
}

const POR_EXTENSAO: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** Tipo efetivo: o declarado, ou o deduzido da extensão quando o navegador deixa em branco. */
export function tipoDoArquivo(nome: string, tipo: string): string {
  const t = tipo.trim().toLowerCase();
  if (t === 'image/jpg') return 'image/jpeg';
  if (t !== '') return t;
  const ext = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase() ?? '';
  return POR_EXTENSAO[ext] ?? '';
}

export function ehImagem(tipo: string): boolean {
  return tipo.startsWith('image/');
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export interface ArquivoBasico {
  name: string;
  type: string;
  size: number;
}

/** Erros (em português) que impedem usar estes arquivos. Lista vazia = pode. */
export function validarAnexos(arquivos: ReadonlyArray<ArquivoBasico>): string[] {
  const erros: string[] = [];
  if (arquivos.length > MAX_ANEXOS) erros.push(`No máximo ${MAX_ANEXOS} anexos por campanha (você escolheu ${arquivos.length}).`);
  let total = 0;
  for (const a of arquivos) {
    total += a.size;
    const tipo = tipoDoArquivo(a.name, a.type);
    if (!(TIPOS_ANEXO as readonly string[]).includes(tipo)) erros.push(`"${a.name}": tipo não aceito. Use imagem (jpg, png ou webp) ou PDF.`);
    if (a.size <= 0) erros.push(`"${a.name}": arquivo vazio.`);
    else if (a.size > MAX_BYTES_ARQUIVO) erros.push(`"${a.name}" tem ${formatarTamanho(a.size)}: o limite é ${formatarTamanho(MAX_BYTES_ARQUIVO)} por arquivo.`);
  }
  if (total > MAX_BYTES_TOTAL) erros.push(`Os anexos somam ${formatarTamanho(total)}: o limite é ${formatarTamanho(MAX_BYTES_TOTAL)} no total.`);
  return erros;
}

export async function hashDoBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function blobParaBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCodePoint(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const s = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) bytes[i] = (s.codePointAt(i) ?? 0);
  return bytes;
}

/** Monta os metadados (com hash) de arquivos já validados. */
export async function montarMetadados(arquivos: ReadonlyArray<File>, novoId: () => string): Promise<AnexoMeta[]> {
  const metas: AnexoMeta[] = [];
  for (const f of arquivos) {
    metas.push({ id: novoId(), nome: f.name, tipo: tipoDoArquivo(f.name, f.type), tamanho: f.size, hash: await hashDoBlob(f) });
  }
  return metas;
}

/** Texto curto do progresso de um contato, para a lista. */
export function resumoDoProgresso(p: ProgressoItem | undefined, total: number): string | null {
  if (!p || !p.textoEnviado || total === 0) return null;
  return `texto enviado · anexos ${p.anexosEnviados}/${total}`;
}
