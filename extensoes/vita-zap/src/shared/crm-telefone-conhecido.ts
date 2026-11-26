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

/**
 * Telefone conhecido de vários contatos varridos de uma vez (um só índice do CRM): chave do contato → telefone normalizado.
 * Quem não tem telefone conhecido fica de fora do mapa. Só fontes locais (contato do CRM da extensão e conversa vista).
 */
export function telefonesConhecidosPorChave(dados: DadosCrm | null | undefined, contatos: ReadonlyArray<{ chave: string; nome: string }>): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!dados) return mapa;
  const indice = criarIndice(dados);
  for (const c of contatos) {
    const doContato = normalizarTelefone(acharNoIndice(indice, { nome: c.nome })?.telefone);
    const tel = doContato ?? normalizarTelefone(dados.conversas[chaveDaConversa(c.nome)]?.telefone);
    if (tel) mapa.set(c.chave, tel);
  }
  return mapa;
}
