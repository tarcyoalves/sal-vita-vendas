// Download do PDF de crédito: `credito.pdf` devolve { nomeArquivo, base64 }. A parte pura (nome seguro, bytes)
// é testada; só `baixarPdfBase64` toca no DOM.

const NOME_PADRAO = 'analise-credito.pdf';

/** Nome de arquivo seguro: sem barras, sem caracteres de controle, sempre terminando em .pdf. */
export function nomeArquivoPdf(nome: string | null | undefined): string {
  const limpo = (nome ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^\.+/, '')
    .trim();
  if (!limpo) return NOME_PADRAO;
  return /\.pdf$/i.test(limpo) ? limpo : `${limpo}.pdf`;
}

export function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** PDF começa com "%PDF-": evita baixar lixo se a resposta vier corrompida. */
export function pareceUmPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) === '%PDF-';
}

export function baixarPdfBase64(base64: string, nomeArquivo: string): void {
  const bytes = base64ParaBytes(base64);
  if (!pareceUmPdf(bytes)) throw new Error('O arquivo recebido não é um PDF válido.');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivoPdf(nomeArquivo);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // adia a liberação: alguns navegadores (iOS) só leem o blob depois do clique
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
