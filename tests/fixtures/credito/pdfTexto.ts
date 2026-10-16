// Texto de um PDF gerado SEM compressão (CREDITO_PDF_SEM_COMPRESSAO=1): lê os operadores TJ/Tj do pdfkit.
export function extrairTextoPdf(pdf: Buffer): string {
  const bruto = pdf.toString('latin1');
  const linhas: string[] = [];
  const re = /\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const trecho = m[1] ?? `<${m[2]}>`;
    let linha = '';
    for (const h of trecho.matchAll(/<([0-9a-fA-F]+)>/g)) {
      for (let i = 0; i < h[1].length; i += 2) {
        const c = parseInt(h[1].slice(i, i + 2), 16);
        linha += c === 0x97 ? '—' : c === 0x95 ? '•' : String.fromCharCode(c);
      }
    }
    linhas.push(linha);
  }
  return linhas.join('\n');
}

/** Nº de páginas do PDF (objetos /Type /Page, sem contar /Pages). */
export function paginasDoPdf(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}
