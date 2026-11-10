/**
 * Variantes de número para o WhatsApp. A alternativa (sem o 9) só existe quando o número nacional tem
 * 11 dígitos e o 3º é 9 (celular). NUNCA insere um 9: número de 10 dígitos pode ser fixo, e inserir
 * o 9 mandaria os dados do pedido ao celular de um desconhecido.
 */
export function whatsappVariants(rawDigits: string): string[] {
  const digits = rawDigits.replace(/\D/g, '');
  const primary = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits : `55${digits}`;
  const national = primary.slice(2);
  if (national.length === 11 && national[2] === '9') return [primary, primary.slice(0, 4) + primary.slice(5)];
  return [primary];
}
