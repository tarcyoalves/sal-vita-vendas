/**
 * Chave do Painel TV. DESLIGADO por padrão (economia do Neon: a TV ficava aberta 24h
 * consultando o banco). Para religar: defina VITE_TV_PAINEL_ATIVO=1 na Vercel e faça NOVO
 * deploy (VITE_* é embutida no build do cliente). Ligado, ainda só consulta no expediente.
 */
// Literal `import.meta.env.VITE_*`: é o único formato que o Vite substitui no build.
// @ts-expect-error import.meta não tipado sob module CommonJS (tsconfig)
const BRUTO: unknown = import.meta.env.VITE_TV_PAINEL_ATIVO;
export const TV_PAINEL_ATIVO: boolean = String(BRUTO ?? '').trim() === '1';
