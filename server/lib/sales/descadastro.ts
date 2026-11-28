// Descadastro das mensagens de prospecção. Puro.
//
// A regra do projeto: o link de descadastro REUSA o mecanismo existente (`/api/unsubscribe?t=<uuid>`,
// server/routers/unsubscribe.ts + server/lib/unsubscribeToken.ts). Esse mecanismo só resolve tokens
// gravados em `email_campaign_recipients.unsub_token` ou `email_sequence_enrollments.unsub_token`
// (nos dois bancos). Uma jornada de prospecção não tem linha em nenhuma dessas tabelas, e criar uma
// linha falsa numa tabela do e-mail marketing para guardar o token seria usar a tabela de outra
// funcionalidade para outro fim (HANDOFF-HERMES.md, regra 1).
//
// Sem mudança de banco NÃO há como gerar um token que `/api/unsubscribe` reconheça. Por isso
// `linkDescadastroProspeccao` recusa, e o ciclo NÃO gera mensagem nenhuma (conta o motivo em
// `mensagensNaoGeradas`). Mudança necessária (fica para o dono decidir, fora deste lote):
//   1. coluna `unsub_token TEXT` em `sales_journeys` (salesMigrate.ts + schema.ts + SCHEMA_VERSION);
//   2. `resolveEmailByToken` (unsubscribe.ts) procurar também em `sales_journeys` do banco do Premium.
// Quando isso existir, esta função passa a devolver `${base}/api/unsubscribe?t=${token}`.

export const MOTIVO_SEM_LINK_DESCADASTRO = 'link_descadastro_indisponivel';

export type LinkDescadastro = { ok: true; url: string } | { ok: false; motivo: string; detalhe: string };

export interface EntradaLinkDescadastro {
  /** Token de descadastro da jornada, quando existir (hoje: nunca — ver o cabeçalho). */
  token: string | null;
  /** Origem pública do site que atende `/api/unsubscribe` (ex.: https://www.premium.salvitarn.com.br). */
  baseUrl: string | null;
}

export function linkDescadastroProspeccao(e: EntradaLinkDescadastro): LinkDescadastro {
  if (!e.token) {
    return {
      ok: false,
      motivo: MOTIVO_SEM_LINK_DESCADASTRO,
      detalhe: 'a jornada não tem token reconhecido por /api/unsubscribe (falta coluna unsub_token em sales_journeys e a busca em unsubscribe.ts)',
    };
  }
  const base = (e.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(base)) {
    return { ok: false, motivo: MOTIVO_SEM_LINK_DESCADASTRO, detalhe: 'origem do site para o link de descadastro não configurada (https)' };
  }
  return { ok: true, url: `${base}/api/unsubscribe?t=${encodeURIComponent(e.token)}` };
}

/**
 * Cabeçalhos de descadastro (RFC 2369 e RFC 8058) que o executor coloca na mensagem.
 * `mailto` usa a própria caixa de envio com assunto "sair" (o Hermes trata como PEDIU_PARA_SAIR).
 * `List-Unsubscribe-Post` só com link https (one-click exige https).
 * Sem nenhum dos dois → null (o servidor não autoriza o despacho).
 */
export function cabecalhosDescadastro(link: string | null, remetenteEmail: string | null): Record<string, string> | null {
  const partes: string[] = [];
  const caixa = (remetenteEmail ?? '').trim().toLowerCase();
  if (/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(caixa)) partes.push(`<mailto:${caixa}?subject=sair>`);
  const https = link && /^https:\/\//i.test(link) ? link : null;
  if (https) partes.push(`<${https}>`);
  if (partes.length === 0) return null;
  const h: Record<string, string> = { 'List-Unsubscribe': partes.join(', ') };
  if (https) h['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return h;
}

/** Extrai do corpo já montado o link de descadastro que foi gravado nele (o mesmo usado nos cabeçalhos). */
export function linkDescadastroNoCorpo(corpo: string): string | null {
  const m = /https:\/\/[^\s<>"]+\/api\/unsubscribe\?t=[A-Za-z0-9%-]+/.exec(corpo);
  return m ? m[0] : null;
}
