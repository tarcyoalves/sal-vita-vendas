// Fuso das datas que o servidor escreve em texto (IA, PDF, relatórios).
// A Vercel roda em UTC: toLocaleString sem timeZone mostraria 3h adiantado (um pedido das 22h aparece como dia seguinte).
// Mesmo fuso fixo da janela do robô SMBI (shared/smbiJanela.ts); o Brasil não tem horário de verão.
export const FUSO_BR = 'America/Fortaleza';
export const OPCOES_FUSO_BR = { timeZone: FUSO_BR } as const;

export const dataHoraBr = (d: Date | string | number): string => new Date(d).toLocaleString('pt-BR', OPCOES_FUSO_BR);
export const dataBr = (d: Date | string | number): string => new Date(d).toLocaleDateString('pt-BR', OPCOES_FUSO_BR);

/** 'AAAAMMDD' do dia em Fortaleza (nome de arquivo); toISOString() daria o dia UTC, que vira o dia seguinte depois das 21h. */
export const diaBrCompacto = (d: Date | string | number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_BR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)).replace(/-/g, '');
