// Descadastro das mensagens de prospecção. Puro.
//
// O link REUSA o mecanismo existente (`/api/unsubscribe?t=<uuid>`, server/routers/unsubscribe.ts +
// server/lib/unsubscribeToken.ts). Cada jornada tem `sales_journeys.unsub_token` (UUID), e
// `resolveEmailByToken` também procura nessa tabela do Premium. O descadastro passa por
// `suppressEmailGlobal`, que suprime nos dois bancos e cancela as sequências.
// Sem token ou sem origem https configurada, NÃO gera a mensagem (conta o motivo no ciclo).

export const MOTIVO_SEM_LINK_DESCADASTRO = 'link_descadastro_indisponivel';

export type LinkDescadastro = { ok: true; url: string } | { ok: false; motivo: string; detalhe: string };

export interface EntradaLinkDescadastro {
  /** Token de descadastro da jornada (`sales_journeys.unsub_token`). */
  token: string | null;
  /** Origem pública do site que atende `/api/unsubscribe` (ex.: https://www.premium.salvitarn.com.br). */
  baseUrl: string | null;
}

export function linkDescadastroProspeccao(e: EntradaLinkDescadastro): LinkDescadastro {
  if (!e.token) {
    return {
      ok: false,
      motivo: MOTIVO_SEM_LINK_DESCADASTRO,
      detalhe: 'a jornada ainda não tem token de descadastro',
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
