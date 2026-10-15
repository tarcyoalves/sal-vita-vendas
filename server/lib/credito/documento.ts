// Documento da análise de crédito: só dígitos, CNPJ (14) ou CPF (11), com dígitos verificadores válidos.
import type { TipoDocumento } from '../../../shared/credito';
import { cnpjValido } from '../smbiCadastro';
import { cpfValido } from '../smbiCadastroDecisoes';

export type DocumentoResultado = { ok: true; documento: string; tipo: TipoDocumento } | { ok: false; erro: string };

export function validarDocumento(bruto: string, tipoEsperado?: TipoDocumento): DocumentoResultado {
  const documento = (bruto ?? '').replace(/\D/g, '');
  const tipo: TipoDocumento | null = documento.length === 14 ? 'CNPJ' : documento.length === 11 ? 'CPF' : null;
  if (!tipo) return { ok: false, erro: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)' };
  if (tipoEsperado && tipoEsperado !== tipo) return { ok: false, erro: `O documento informado é um ${tipo}, não um ${tipoEsperado}` };
  if (tipo === 'CNPJ' ? !cnpjValido(documento) : !cpfValido(documento)) return { ok: false, erro: `${tipo} inválido (dígitos verificadores não conferem)` };
  return { ok: true, documento, tipo };
}
