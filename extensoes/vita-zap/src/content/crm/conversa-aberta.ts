// Quem é o contato da conversa aberta: nome do cabeçalho e, se der para ler no HTML, o telefone
// (normalizado, só dígitos com DDI). Fontes, da mais para a menos confiável:
// 1) o nome exibido, quando o contato não está salvo (aparece o número);
// 2) o id das mensagens da conversa (xxxxx@c.us);
// 3) o painel "Dados do contato", se estiver aberto.

import type { RefContato } from '../../shared/crm-tipos';
import { telefoneDoJid, telefoneDoNomeExibido, normalizarTelefone } from '../../shared/telefone';
import { limparMarcas } from '../dom';
import { nomeDaConversaAberta } from '../execucao';
import { encontrar, encontrarTodos } from '../selectors';

function telefoneDasMensagens(): string | null {
  for (const el of encontrarTodos(document, 'mensagem').slice(0, 20)) {
    const t = telefoneDoJid(el.getAttribute('data-id') ?? '');
    if (t) return t;
  }
  return null;
}

/** Procura um número de telefone nos textos do painel de dados do contato (se estiver aberto). */
function telefoneDoPainelDeDados(): string | null {
  const painel = encontrar(document, 'painelDadosContato');
  if (!painel) return null;
  for (const f of painel.querySelectorAll<HTMLElement>('span, div')) {
    if (f.children.length > 0) continue;
    const t = limparMarcas(f.textContent ?? '');
    if (/^\+\d[\d\s().-]{9,}$/.test(t)) return normalizarTelefone(t);
  }
  return null;
}

export function telefoneDaConversaAberta(nome: string): string | null {
  return telefoneDoNomeExibido(nome) ?? telefoneDasMensagens() ?? telefoneDoPainelDeDados();
}

/** Referência ao contato da conversa aberta, ou null se não há conversa aberta. */
export function refDaConversaAberta(): RefContato | null {
  const nome = nomeDaConversaAberta();
  if (!nome) return null;
  const telefone = telefoneDaConversaAberta(nome);
  return { nome, ...(telefone ? { telefone } : {}) };
}
