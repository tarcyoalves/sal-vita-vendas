import type { Response } from 'express';
import { safeErr } from './logSafe';

/**
 * Erro de processamento/banco num webhook: responde 500 para o provedor (Resend/Brevo) REENVIAR o evento.
 * 200 fica só para evento ignorado ou corpo inválido (reenviar não adiantaria).
 * Obs.: não há índice único em email_events; um reenvio depois de gravar parte do trabalho pode duplicar o evento.
 */
export function responderFalhaTemporaria(res: Response, label: string, err: unknown): void {
  console.error(`[${label}] error:`, safeErr(err));
  if (!res.headersSent) res.status(500).json({ error: 'temporary failure' });
}

/** Corpo de webhook que não é um objeto JSON (nulo, texto, lista): não há o que processar nem o que reenviar. */
export function corpoIgnoravel(body: unknown): boolean {
  return body === null || typeof body !== 'object' || Array.isArray(body);
}
