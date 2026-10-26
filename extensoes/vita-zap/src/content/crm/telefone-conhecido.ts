// Memória nome → telefone do content script. O WhatsApp Web não mostra o número de contato salvo, então
// guardamos o telefone quando a conversa foi aberta POR TELEFONE (lembrete/cliente do CRM). Fica na memória
// da página e, quando a conversa/contato já existe no índice local, também no armazenamento (pelo repositório).

import { telefoneNoIndiceLocal } from '../../shared/crm-telefone-conhecido';
import { chaveDaConversa } from '../../shared/crm-regras';
import { normalizarTelefone } from '../../shared/telefone';
import type { Estado } from './estado';

const memoria = new Map<string, string>();
let estadoAtual: Estado | null = null;

/** Liga (ou desliga, com null) a ponte com o estado local. Chamado por iniciarCrm. */
export function ligarTelefones(estado: Estado | null): void {
  estadoAtual = estado;
}

/** Esquece tudo da memória (testes). */
export function esquecerTelefones(): void {
  memoria.clear();
}

export function memorizarTelefone(nome: string, telefone: string | null | undefined): void {
  const tel = normalizarTelefone(telefone);
  if (!tel || !nome.trim()) return;
  const chave = chaveDaConversa(nome);
  memoria.set(chave, tel);
  const e = estadoAtual;
  if (!e) return;
  const conversa = e.dados.conversas[chave];
  if (conversa && !conversa.telefone) {
    conversa.telefone = tel;
    e.conversasMudaram();
  }
  void e.fazer((r) => r.registrarVistos([{ ref: { nome, telefone: tel } }])).catch(() => undefined);
}

/** Memorizado nesta página, ou conhecido do índice local (contato/conversa). */
export function telefoneConhecido(nome: string): string | null {
  const m = memoria.get(chaveDaConversa(nome));
  if (m) return m;
  return estadoAtual ? telefoneNoIndiceLocal(estadoAtual.dados, nome) : null;
}
