// Documento (CNPJ/CPF) digitado na tarefa. Vazio é permitido; preenchido tem que ser válido.
// Motivo: tasks.cnpj libera leitura de crédito para o atendente (server/lib/credito/carteira.ts),
// então não pode aceitar lixo nem número inventado.
import { validarDocumento } from './credito/documento';

export type DocumentoTarefa = { ok: true; documento: string | undefined } | { ok: false; erro: string };

export function validarDocumentoDaTarefa(valor?: string | null): DocumentoTarefa {
  const digitos = (valor ?? '').replace(/\D/g, '');
  if (!digitos) return { ok: true, documento: undefined };
  const v = validarDocumento(digitos);
  return v.ok ? { ok: true, documento: v.documento } : { ok: false, erro: v.erro };
}
