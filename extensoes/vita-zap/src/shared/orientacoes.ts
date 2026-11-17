// Orientações do dono para a IA (v0.7.57): regras fixas escritas por ele ("não cobrar quem comprou nos últimos 15 dias",
// "nunca falar de preço", "trate por você"). Valem para TODA chamada de IA da extensão (classificar respostas, escrever
// cobrança/reativação, avaliar reativação, Pedir à IA). O servidor as injeta num bloco "abaixo das regras de segurança,
// LGPD e conformidade": a validação da saída (sem link, preço, termos proibidos) continua valendo acima delas.
// Regras puras, sem rede.

export const MAX_ORIENTACOES = 1500;
/** Chave no armazenamento da extensão (chrome.storage.local), lida pelo service worker a cada chamada de IA. */
export const CHAVE_ORIENTACOES = 'vz.ia.orientacoes';

export const PLACEHOLDER_ORIENTACOES =
  'Ex.: não cobrar quem comprou nos últimos 15 dias. Nunca falar de preço. Trate o cliente por você. Se ele disser que já tem estoque, sugira conversar de novo em 30 dias.';

/** Texto do campo → texto guardado: sem caracteres de controle, linhas em branco repetidas viram uma só, até 1500 caracteres. */
export function normalizarOrientacoes(v: unknown): string {
  if (typeof v !== 'string') return '';
  const semControle = [...v.replace(/\r\n?/g, '\n')].filter((c) => c === '\n' || c === '\t' || (c.codePointAt(0) ?? 0) >= 32).join('');
  return semControle
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_ORIENTACOES);
}

/** Só o que vai ao servidor: nada (campo ausente) quando está vazio, para o prompt ficar exatamente como era. */
export function orientacoesParaEnvio(v: unknown): { orientacoes: string } | Record<string, never> {
  const t = normalizarOrientacoes(v);
  return t === '' ? {} : { orientacoes: t };
}
