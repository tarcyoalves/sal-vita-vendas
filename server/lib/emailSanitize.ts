import sanitizeHtml from 'sanitize-html';

// Estilo inline perigoso: expression()/behavior (IE antigo), url() com esquema que não seja
// http(s), @import, escapes com barra invertida (usados para esconder as palavras acima).
function isDangerousStyle(style: string): boolean {
  if (/expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding|@import|\\/i.test(style)) return true;
  const urls = style.match(/url\s*\(\s*([^)]*)\)/gi) ?? [];
  return urls.some(u => !/^url\s*\(\s*["']?\s*https?:\/\//i.test(u));
}

/**
 * HTML da EQUIPE (admin/gerente: templates, campanhas, sequências): confiável, mas pode ter sido
 * colado de fora. Preserva o documento como está — inclusive <style> e media queries, de que os
 * templates de e-mail dependem — e remove só o que executa código ou embute conteúdo ativo:
 * script, iframe/object/embed/applet/form, eventos on*, javascript:/vbscript:/data:text/html
 * em href/src. Repete até estabilizar (defende `<scr<script>ipt>`).
 */
export function sanitizeCampaignHtml(html: string): string {
  let prev: string;
  let out = html;
  do {
    prev = out;
    out = out
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<(iframe|object|applet)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\/?(script|iframe|object|embed|applet|form)\b[^>]*>/gi, '')
      .replace(/[\s/]+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      .replace(/\b(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data\s*:\s*text\/html)\s*:?/gi, '$1=$2#');
  } while (out !== prev);
  return out;
}

/**
 * HTML de ATENDENTE (Disparo do atendente): não confiável. Allowlist com sanitize-html — tabelas,
 * estilos inline, imagens http(s) e links http/https/mailto/tel. Remove blocos <style> (só estilo
 * inline), script, iframe, form, svg, eventos on*, javascript:/data: em href/src e estilos com
 * expression()/url(javascript:). Os placeholders {nome}/{unsubscribe} passam (URL relativa).
 */
export function sanitizeUntrustedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'dd', 'del', 'div',
      'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
      'i', 'img', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small', 'span', 'strike', 'strong',
      'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'dir', 'lang', 'role'],
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      font: ['color', 'size', 'face'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      col: ['span'],
      colgroup: ['span'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'title', 'noscript'],
    transformTags: {
      '*': (tagName, attribs) => {
        const out = { ...attribs };
        if (out.style && isDangerousStyle(out.style)) delete out.style;
        if (tagName === 'a') out.rel = 'noopener noreferrer';
        return { tagName, attribs: out };
      },
    },
  });
}

const ATTACHMENT_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt']);

/** Anexo de atendente: só extensões de documento/imagem (nada de .exe, .html, .svg, .zip). */
export function isAllowedAttachmentName(filename: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return !!m && ATTACHMENT_EXTS.has(m[1].toLowerCase());
}

/** Escapa texto livre antes de interpolar em HTML de e-mail. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
