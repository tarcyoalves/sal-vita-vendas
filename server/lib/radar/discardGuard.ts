// Regras de quem pode descartar uma empresa no Radar (puras, testáveis sem banco).

/** Mensagem de recusa, ou null se o descarte pode seguir. */
export function discardRefusal(opts: {
  reason: string;
  isStaff: boolean;
  /** Existe tarefa de OUTRO atendente com o mesmo CNPJ? */
  hasOtherSellersTask: boolean;
}): string | null {
  // "Não contatar" descadastra o e-mail de TODO o marketing do CRM e o restore não desfaz.
  if (opts.reason === 'nao_contatar' && !opts.isStaff) {
    return 'Só admin ou gerente pode registrar "pediu para não ser contatado" (isso descadastra o e-mail de todo o marketing).';
  }
  if (!opts.isStaff && opts.hasOtherSellersTask) {
    return 'Esta empresa já é cliente/tarefa de outro atendente. Peça ao admin ou gerente para descartar.';
  }
  return null;
}
