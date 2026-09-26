// Radar de Cargas — mensagem padrão de contato, gerada no cliente quando o
// atendente ainda não pediu "Gerar mensagem" (IA). Curta, neutra, sem preço
// nem alegação de produto — só o suficiente para abrir a conversa.
export function defaultContactMessage(input: {
  attendantName: string;
  cityLabel: string;
  bags: number;
}): string {
  const { attendantName, cityLabel, bags } = input;
  const regiao = cityLabel ? ` para a região de ${cityLabel}` : '';
  return `Olá! Aqui é ${attendantName}, da Sal Vita. Temos uma carreta indo${regiao} com espaço para ${bags} sacos de 25 kg. Posso te passar um orçamento?`;
}
