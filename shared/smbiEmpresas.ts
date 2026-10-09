// Catálogo canônico das empresas emissoras no SMBI (envio de pedido com escolha de empresa).
// Fonte única para servidor, testes e tela. A empresa é escolhida SÓ no clique de "Enviar para o SMBI";
// não afeta cálculo, comissão nem peso no CRM. Ver docs/SMBI-MULTIEMPRESA.md.

export const SMBI_EMPRESAS = [
  { cnpj: '51422900000168', nome: 'A S Comércio — Sal Vita', curto: 'A S Comércio', homologada: true },
  // Só vira true (commit futuro) depois do mapa de códigos da empresa aprovado.
  { cnpj: '49748258000160', nome: 'C Alves Comércio e Moagem de Sal', curto: 'C Alves', homologada: false },
] as const;

export type SmbiEmpresa = (typeof SMBI_EMPRESAS)[number];
export type SmbiEmpresaCnpj = SmbiEmpresa['cnpj'];

/** Mesmo valor para zod (`z.enum`). */
export const SMBI_EMPRESA_CNPJS = SMBI_EMPRESAS.map((e) => e.cnpj) as unknown as [SmbiEmpresaCnpj, ...SmbiEmpresaCnpj[]];

/**
 * Empresa que a coluna `smbi_client_registrations.empresa_cnpj` assume para linhas anteriores à
 * multiempresa. Existe só para o ALTER não quebrar linhas existentes (a tabela está vazia em produção).
 * NUNCA use como padrão de pedido ou de decisão: pedido sem empresa escolhida fica NULL.
 */
export const SMBI_EMPRESA_PADRAO_LEGADO: SmbiEmpresaCnpj = '51422900000168';

/**
 * Aceita SOMENTE a string exata dos 14 dígitos de uma empresa do catálogo. Sem pontuação, sem espaço,
 * sem "reparar": qualquer outra entrada (inclusive o CNPJ do comprador) devolve null.
 */
export function empresaPorCnpj(literal: unknown): SmbiEmpresa | null {
  if (typeof literal !== 'string') return null;
  return SMBI_EMPRESAS.find((e) => e.cnpj === literal) ?? null;
}

/** Só para apresentação (nunca para comparar ou gravar): 51.422.900/0001-68. */
export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
