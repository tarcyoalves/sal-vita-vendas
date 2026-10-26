// Quem é o contato da conversa aberta: nome do cabeçalho e, se der para ler no HTML, o telefone
// (normalizado, só dígitos com DDI). Fontes, da mais para a menos confiável:
// 1) o nome exibido, quando o contato não está salvo (aparece o número);
// 2) o id das mensagens da conversa (xxxxx@c.us);
// 3) o painel "Dados do contato", se estiver aberto;
// 4) o telefone memorizado / do índice local (telefone-conhecido.ts).

import type { RefContato } from '../../shared/crm-tipos';
import { telefoneDoJid, telefoneDoNomeExibido } from '../../shared/telefone';
import { nomeDaConversaAberta } from '../execucao';
import { encontrarTodos } from '../selectors';
import { telefoneDoPainelDeDados } from './dados-do-contato';
import { telefoneConhecido } from './telefone-conhecido';

function telefoneDasMensagens(): string | null {
  for (const el of encontrarTodos(document, 'mensagem').slice(0, 20)) {
    const t = telefoneDoJid(el.getAttribute('data-id') ?? '');
    if (t) return t;
  }
  return null;
}

/**
 * Telefone da conversa aberta, sem clicar em nada. Fontes, da mais para a menos confiável:
 * nome exibido (número) → id das mensagens → painel "Dados do contato" já aberto → telefone memorizado
 * (conversa aberta pelo telefone ou por lembrete/cliente do CRM) → índice local de contatos/conversas.
 * A leitura ativa do painel (abre e fecha) só acontece ao pedir "Criar lead" sem telefone: dados-do-contato.ts.
 */
export function telefoneDaConversaAberta(nome: string): string | null {
  return telefoneDoNomeExibido(nome) ?? telefoneDasMensagens() ?? telefoneDoPainelDeDados() ?? telefoneConhecido(nome);
}

/** Referência ao contato da conversa aberta, ou null se não há conversa aberta. */
export function refDaConversaAberta(): RefContato | null {
  const nome = nomeDaConversaAberta();
  if (!nome) return null;
  const telefone = telefoneDaConversaAberta(nome);
  return { nome, ...(telefone ? { telefone } : {}) };
}
