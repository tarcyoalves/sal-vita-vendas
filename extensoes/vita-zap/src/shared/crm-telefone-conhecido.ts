// Telefone que a extensão já conhece de um contato, pelo NOME exibido no WhatsApp (que, para contato salvo,
// não mostra o número). Fontes locais: o contato do índice do CRM da extensão e a conversa lida da lista.

import { acharNoIndice, criarIndice } from './crm-contatos';
import { chaveDaConversa } from './crm-regras';
import type { DadosCrm } from './crm-tipos';
import { normalizarTelefone } from './telefone';

export function telefoneNoIndiceLocal(dados: DadosCrm, nome: string): string | null {
  const contato = acharNoIndice(criarIndice(dados), { nome });
  const doContato = normalizarTelefone(contato?.telefone);
  if (doContato) return doContato;
  return normalizarTelefone(dados.conversas[chaveDaConversa(nome)]?.telefone);
}
