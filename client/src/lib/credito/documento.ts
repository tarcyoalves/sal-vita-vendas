// Máscara e validação LOCAL de CNPJ/CPF (só para a tela não mandar lixo). O servidor valida de novo
// (server/lib/credito/documento.ts); aqui é cópia mínima, pura, porque aquele arquivo importa módulos de servidor.

export const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '');

/** Máscara progressiva: até 11 dígitos formata como CPF, de 12 a 14 como CNPJ. */
export function mascararDocumentoDigitando(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

/** Formata um documento completo (11 ou 14 dígitos); qualquer outra coisa volta como veio. */
export function formatarDocumento(v: string | null | undefined): string {
  const d = soDigitos(v);
  return d.length === 11 || d.length === 14 ? mascararDocumentoDigitando(d) : (v ?? '');
}

export const SEMAFOROS_MAX = 200;

/** Lista estável (ordenada, sem repetição, só CNPJ/CPF, até 200) para a chave da query `credito.semaforos`. */
export function documentosParaSemaforos(documentos: ReadonlyArray<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const d of documentos) {
    const x = soDigitos(d);
    if (x.length === 11 || x.length === 14) set.add(x);
  }
  return [...set].sort().slice(0, SEMAFOROS_MAX);
}

/** CPF de sócio -> ***.468.126-** (LGPD, igual ao PDF); CNPJ de sócio PJ sai formatado; resto vira "***". */
export function mascararDocumentoSocio(doc: string | null | undefined): string {
  if (!doc) return '—';
  if (doc.includes('*')) return doc.trim() || '***'; // a fonte já mascarou: impresso como veio
  const d = soDigitos(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return formatarDocumento(d);
  return '***';
}

function cpfValido(c: string): boolean {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    const s = c.slice(0, n).split('').reduce((a, d, i) => a + Number(d) * (n + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function cnpjValido(c: string): boolean {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((a, d, i) => a + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export type ResultadoDocumento = { ok: true; documento: string; tipo: 'CNPJ' | 'CPF' } | { ok: false; erro: string };

export function validarDocumentoLocal(bruto: string): ResultadoDocumento {
  const documento = soDigitos(bruto);
  const tipo = documento.length === 14 ? 'CNPJ' : documento.length === 11 ? 'CPF' : null;
  if (!tipo) return { ok: false, erro: 'Informe 11 dígitos (CPF) ou 14 dígitos (CNPJ).' };
  if (tipo === 'CNPJ' ? !cnpjValido(documento) : !cpfValido(documento)) return { ok: false, erro: `${tipo} inválido (dígitos verificadores não conferem).` };
  return { ok: true, documento, tipo };
}
