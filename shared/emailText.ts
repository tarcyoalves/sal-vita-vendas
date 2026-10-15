/**
 * Texto simples → HTML de e-mail, para quem escreve sequências no painel sem saber HTML.
 * Usado pelo servidor (marketingEngine.bodyToHtml) e pela prévia do editor no painel, para
 * os dois mostrarem exatamente a mesma coisa.
 *
 * Como escrever:
 *   - Linha em branco separa parágrafos; quebra de linha simples continua no mesmo parágrafo.
 *   - Linhas começando com "- " viram lista.
 *   - [texto do link](endereço) vira link. Ex.: [Fazer um novo pedido]({link_loja})
 *   - **assim** fica em negrito.
 */

const P_STYLE = 'margin:0 0 16px;line-height:1.6;color:#334155;';
const LIST_STYLE = 'margin:0 0 16px;padding-left:20px;line-height:1.7;color:#334155;';
const LINK_STYLE = 'color:#0C3680;font-weight:600;';

/** Corpo já em HTML (sequências antigas, campanhas): não converter. */
export function looksLikeHtml(body: string): boolean {
  return /<\/?(p|div|table|ul|ol|li|br|a|strong|b|em|span|h[1-6])\b[^>]*>/i.test(body);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Só aceita link http(s), mailto ou um marcador ainda não trocado ({link_loja}, {unsubscribe}). */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url) || /^\{[a-z_]+\}$/i.test(url)) return url.replace(/"/g, '%22');
  return null;
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // [texto](endereço) — depois do escape, os colchetes e parênteses continuam iguais
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    const safe = safeHref(href.replace(/&amp;/g, '&'));
    return safe ? `<a href="${safe.replace(/&/g, '&amp;')}" style="${LINK_STYLE}">${label}</a>` : m;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

export function plainTextToEmailHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '');
    if (lines.length && lines.every(l => /^\s*-\s+/.test(l))) {
      const items = lines.map(l => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('');
      return `<ul style="${LIST_STYLE}">${items}</ul>`;
    }
    return `<p style="${P_STYLE}">${lines.map(inline).join('<br/>')}</p>`;
  }).join('\n');
}
