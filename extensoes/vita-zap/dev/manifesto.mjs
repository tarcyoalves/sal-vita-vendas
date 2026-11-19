// Manifesto da extensão: o de PRODUÇÃO (public/manifest.json, o que vai no dist/ e no zip) nunca aponta para localhost
// nem 127.0.0.1. O desenvolvimento acrescenta o que precisa (dev/manifest.dev.json) só quando o build é feito com
// `--mode development` (npm run build:dev). O plugin do vite.config.ts usa gerarManifesto() e falha o build de produção
// se sobrar um endereço local.

const LOCAL = /localhost|127\.0\.0\.1|\[::1\]/i;

/** Endereços locais encontrados em qualquer valor do manifesto (host_permissions, content_scripts, externally_connectable…). */
export function enderecosLocais(manifesto) {
  return JSON.stringify(manifesto)
    .split('"')
    .filter((t) => LOCAL.test(t));
}

function unir(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

/**
 * `base` = public/manifest.json. Produção: devolve a base (e falha se ela tiver endereço local).
 * Desenvolvimento: acrescenta as listas de `extra` (dev/manifest.dev.json) e marca o nome com "(dev)".
 */
export function gerarManifesto(base, desenvolvimento = false, extra = {}) {
  if (!desenvolvimento) {
    const achados = enderecosLocais(base);
    if (achados.length > 0) throw new Error(`O manifesto de produção não pode ter endereço local: ${achados.join(', ')}`);
    return base;
  }
  const saida = { ...base, name: `${base.name}${extra.name_sufixo ?? ' (dev)'}` };
  if (extra.optional_host_permissions) saida.optional_host_permissions = unir(base.optional_host_permissions, extra.optional_host_permissions);
  if (extra.host_permissions) saida.host_permissions = unir(base.host_permissions, extra.host_permissions);
  if (extra.externally_connectable) {
    saida.externally_connectable = { ...base.externally_connectable, matches: unir(base.externally_connectable?.matches, extra.externally_connectable.matches) };
  }
  return saida;
}
