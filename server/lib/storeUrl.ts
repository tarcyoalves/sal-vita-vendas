// URL pública da loja Premium. Sempre com "www": o domínio sem www
// (premium.salvitarn.com.br) não tem certificado TLS na Vercel. Usar em TODO link
// que sai do servidor (Mercado Pago, Meta CAPI, WhatsApp, e-mail, prompts de IA).
// A lista de CORS em api/index.ts é a única exceção: lá os dois hosts ficam.
export const STORE_URL = 'https://www.premium.salvitarn.com.br';
