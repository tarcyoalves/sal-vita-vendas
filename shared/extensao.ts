// Extensão Vita Zap (Chrome): ID fixo e origens aceitas pelo CORS e pelo csrfGuard do /api/trpc.
//
// O ID vem do par RSA cuja chave PÚBLICA está em `key` no manifest da extensão
// (extensoes/vita-zap/public/manifest.json). A chave privada NÃO é versionada.
// Aqui só entra a origem EXATA da extensão: nunca "*" e nunca "qualquer chrome-extension://".

export const EXTENSAO_VITA_ZAP_ID = 'anlifdaoagpcbdjpbflodkcialbdbghh';

export const EXTENSAO_VITA_ZAP_ORIGIN = `chrome-extension://${EXTENSAO_VITA_ZAP_ID}`;

/** Origem de extensão válida: esquema + ID de 32 letras a-p (alfabeto de ID do Chrome). */
const ORIGEM_EXTENSAO_RX = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * Origens de extensão aceitas. Padrão: só a Vita Zap. A env `EXTENSION_ORIGINS` (lista separada por
 * vírgula) SUBSTITUI o padrão; entradas que não sejam `chrome-extension://<id de 32 letras a-p>`
 * são descartadas, e se nada sobrar vale o padrão.
 */
export function origensDeExtensao(env?: string | null): string[] {
  const validas = (env ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => ORIGEM_EXTENSAO_RX.test(o));
  return validas.length > 0 ? [...new Set(validas)] : [EXTENSAO_VITA_ZAP_ORIGIN];
}
