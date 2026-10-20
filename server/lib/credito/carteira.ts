// Regra PURA de quem enxerga o crédito de um documento (atendente). O router só executa o SQL.
//
// Por que existe: `tasks.cnpj` é digitado pelo atendente. Antes, bastava criar uma tarefa com o
// CNPJ de qualquer cliente para "entrar na carteira" e ler o relatório de crédito dele.
// Regra adotada:
//   1) pedido do atendente (fat_orders.seller_id) com o documento -> vê (dado do ERP, não digitado por ele);
//   2) tarefa do atendente com o documento SÓ vale se a tarefa já existia antes da primeira
//      consulta de crédito desse documento (tarefa criada depois do relatório não dá acesso).
// Sem relatório algum não há o que ver, então a data de corte ausente não libera nada.

export interface TarefaDoDocumento { documento: string; criadaEm: Date | string }

const ms = (d: Date | string): number => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** A tarefa conta como carteira? Só se foi criada ESTRITAMENTE antes da primeira consulta de crédito. */
export function tarefaDaCarteira(criadaEm: Date | string, primeiraConsultaEm: Date | string | null | undefined): boolean {
  if (primeiraConsultaEm == null) return false;
  const t = ms(criadaEm);
  const c = ms(primeiraConsultaEm);
  if (Number.isNaN(t) || Number.isNaN(c)) return false;
  return t < c;
}

/** Documentos liberados por tarefa: aplica `tarefaDaCarteira` com a data da primeira consulta de cada documento. */
export function documentosLiberadosPorTarefa(
  tarefas: readonly TarefaDoDocumento[],
  primeiraConsulta: ReadonlyMap<string, Date | string>,
): Set<string> {
  const out = new Set<string>();
  for (const t of tarefas) if (tarefaDaCarteira(t.criadaEm, primeiraConsulta.get(t.documento))) out.add(t.documento);
  return out;
}
