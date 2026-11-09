// Extensão desligada NESTA ABA pelo usuário ("Usar o WhatsApp sem a extensão" na tela de bloqueio).
// Vale até a página ser recarregada: fica só na memória da página (window), não é gravado em lugar
// nenhum. Enquanto desligada, nenhuma ferramenta do Vita Zap roda nesta aba (CRM, barra de formatação,
// pedidos do painel). Na window (e não numa variável do módulo) para valer também se o script for reinjetado.

declare global {
  interface Window { __vitaZapDesligado?: boolean }
}

export function desligarNestaAba(): void {
  window.__vitaZapDesligado = true;
}

export function extensaoDesligadaNestaAba(): boolean {
  return typeof window !== 'undefined' && window.__vitaZapDesligado === true;
}

/** Só para testes. */
export function religarParaTeste(): void {
  delete window.__vitaZapDesligado;
}
