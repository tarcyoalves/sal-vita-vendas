// Filtro das mudanças de DOM que o CRM do WhatsApp Web observa (MutationObserver em document.body).
//
// O WhatsApp muda a página o tempo todo: relógio das mensagens, ícone de status, "digitando...", hover.
// Cada mudança agendava um ciclo de leitura e desenho. Aqui ficam de fora só mudanças que o ciclo
// NUNCA usa; o resto passa como antes (falha aberta: na dúvida, é relevante).
//
// Fica de fora:
// - qualquer mudança DENTRO dos nossos elementos (marcados com data-vita-zap*);
// - inserção feita por nós (todos os nós adicionados são nossos e nada foi removido);
// - atributo/texto mudando dentro da área de mensagens da conversa aberta (#main, fora do cabeçalho e
//   do rodapé). Mensagem nova (childList) continua relevante: a conversa aberta lê as mensagens.
//
// Continua relevante, entre outros: o WhatsApp REMOVER um elemento nosso (é preciso redesenhar), troca
// de conversa, lista de conversas (linhas, rolagem virtual por style, textos), cabeçalho, tema (class).

import { dentroDe } from './selectors';

// data-vita-zap-empurrado NÃO entra: marca um elemento do WhatsApp que nós deslocamos; se o WhatsApp
// mexer nele, precisamos redesenhar.
const NOSSO = '[data-vita-zap],[data-vita-zap-linha]';

function elementoDe(n: Node | null): Element | null {
  if (!n) return null;
  return n.nodeType === 1 ? (n as Element) : n.parentElement;
}

export function ehNosso(n: Node | null): boolean {
  const el = elementoDe(n);
  return el !== null && el.closest(NOSSO) !== null;
}

/** Dentro de #main, mas fora do cabeçalho e do rodapé: a área das mensagens. */
function naAreaDeMensagens(n: Node | null): boolean {
  const el = elementoDe(n);
  if (!el) return false;
  if (!dentroDe(el, 'painelConversa')) return false;
  return !dentroDe(el, 'cabecalhoConversa') && !dentroDe(el, 'rodapeConversa');
}

export function mutacaoRelevante(r: MutationRecord): boolean {
  if (ehNosso(r.target)) return false;
  if (r.type === 'childList') {
    if (r.removedNodes.length === 0 && r.addedNodes.length > 0) {
      let todosNossos = true;
      r.addedNodes.forEach((n) => {
        if (!ehNosso(n)) todosNossos = false;
      });
      if (todosNossos) return false;
    }
    return true;
  }
  // attributes / characterData
  return !naAreaDeMensagens(r.target);
}

export function algumaRelevante(registros: readonly MutationRecord[]): boolean {
  for (const r of registros) if (mutacaoRelevante(r)) return true;
  return false;
}
