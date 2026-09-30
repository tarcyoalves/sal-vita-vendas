// "Cliente ativo" no Radar = quem já COMPROU: pedido faturado ou tarefa convertida em cliente.
// Atendente não vê cliente ativo na busca de empresas novas (regra do dono, 30/09/2026);
// admin e gerente veem, com a marca. Lógica pura; a consulta ao banco fica no router.

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export interface CandidatoRadar {
  cnpj: string;
  phones: string[]; // só dígitos
}

/**
 * CNPJs (do Radar) que são cliente ativo: o CNPJ tem pedido faturado ou tarefa convertida, ou um
 * telefone da empresa é o de uma tarefa convertida (o mesmo critério do "Já no CRM").
 */
export function cnpjsDeClientesAtivos(
  candidatos: CandidatoRadar[],
  cnpjsComPedidoFaturado: Array<string | null | undefined>,
  tarefasConvertidas: Array<{ cnpj: string | null; phone: string | null }>,
): Set<string> {
  const cnpjAtivo = new Set<string>();
  const telAtivo = new Set<string>();
  for (const c of cnpjsComPedidoFaturado) { const d = soDigitos(c); if (d) cnpjAtivo.add(d); }
  for (const t of tarefasConvertidas) {
    const c = soDigitos(t.cnpj); if (c) cnpjAtivo.add(c);
    const p = soDigitos(t.phone); if (p) telAtivo.add(p);
  }
  const out = new Set<string>();
  for (const c of candidatos) {
    if (cnpjAtivo.has(soDigitos(c.cnpj)) || c.phones.some((p) => telAtivo.has(soDigitos(p)))) out.add(c.cnpj);
  }
  return out;
}
