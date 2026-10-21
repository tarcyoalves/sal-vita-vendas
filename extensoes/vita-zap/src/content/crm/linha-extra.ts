// Selo dentro de uma linha da lista: "há N dias" (Aguardando) e botão "Dispensar" (Precisa de resposta).
// Cada selo é um host Shadow DOM filho da linha; o clique não chega ao WhatsApp (não abre a conversa).

import { criarHost, h, isolarCliques, sincronizarTema, type Host } from './ui';

export interface SeloDaLinha {
  idade?: string;
  aoDispensar?: () => void;
}

interface Registro {
  host: Host;
  chave: string;
}

const registros = new WeakMap<HTMLElement, Registro>();

export function anotarLinha(el: HTMLElement, selo: SeloDaLinha | null, chaveConversa: string): void {
  const reg = registros.get(el);
  if (!selo || (!selo.idade && !selo.aoDispensar)) {
    if (reg) {
      reg.host.host.remove();
      registros.delete(el);
    }
    return;
  }
  const chave = `${chaveConversa}|${selo.idade ?? ''}|${selo.aoDispensar ? 'd' : ''}`;
  if (reg && reg.host.host.isConnected && reg.chave === chave) return;
  reg?.host.host.remove();
  const host = criarHost('vita-zap-linha');
  host.host.removeAttribute('id'); // há um por linha: id repetido seria HTML inválido
  host.host.setAttribute('data-vita-zap-linha', '');
  Object.assign(host.host.style, { display: 'block', width: '0', height: '0' });
  sincronizarTema(host.host);
  const dispensar = selo.aoDispensar;
  host.conteudo.append(
    h(
      'div',
      { class: 'linha' },
      selo.idade ? h('span', { class: 'mini idade', title: 'Tempo desde a sua última mensagem' }, selo.idade) : null,
      dispensar ? h('button', { class: 'mini', type: 'button', title: 'Tirar de "Precisa de resposta" até chegar mensagem nova', onclick: () => dispensar() }, 'dispensar') : null,
    ),
  );
  isolarCliques(host.host);
  el.append(host.host);
  registros.set(el, { host, chave });
}

export function removerSelo(el: HTMLElement): void {
  anotarLinha(el, null, '');
}
