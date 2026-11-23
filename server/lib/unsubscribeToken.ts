/** Os tokens de descadastro são UUIDs (crypto.randomUUID). Formato inválido nem chega ao banco. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const tokenDescadastroValido = (t: unknown): t is string => typeof t === 'string' && UUID.test(t);
