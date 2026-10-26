// ⚠️ HTML SINTÉTICO (não é cópia do WhatsApp real): WhatsApp Web falso COM busca e painel "Dados do contato".
// - Digitar na busca filtra os contatos pelos dígitos do telefone ou pelo nome (como a busca real, em linhas).
// - Clicar numa linha abre a conversa (cabeçalho + mensagens SEM jid no data-id, como o WhatsApp de 10/2026).
// - Clicar no nome do cabeçalho abre o painel de dados com o telefone; o X dele fecha.
// Tudo registrado em `eventos` para os testes provarem que a página NUNCA recarregou nem enviou nada.

import { vi } from 'vitest';

export interface ContatoFalso {
  nome: string;
  telefone: string; // só dígitos com DDI
  /** Tem conversa (linha com data) ou só contato da agenda (seção "Contatos"). */
  conversa?: boolean;
  grupo?: boolean;
  /** Última mensagem da linha é minha (ícone de entrega). */
  minha?: boolean;
}

export interface BuscaFalsa {
  eventos: string[];
  /** Nome da conversa aberta agora. */
  aberta(): string | null;
  drawerAberto(): boolean;
}

export interface OpcoesBuscaFalsa {
  /** Painel de dados: 'padrao' (data-testid), 'generico' (div sem rótulo, irmão do #main) ou 'nenhum' (não abre). */
  painel?: 'padrao' | 'generico' | 'nenhum';
  /** Mostra o telefone formatado no painel (padrão: true). */
  mostraTelefone?: boolean;
}

function formatar(tel: string): string {
  return `+${tel.slice(0, 2)} ${tel.slice(2, 4)} ${tel.slice(4, 9)}-${tel.slice(9)}`;
}

export function montarWhatsAppComBusca(contatos: ContatoFalso[], op: OpcoesBuscaFalsa = {}): BuscaFalsa {
  // No ambiente jsdom do vitest o `window` global não é o Window do jsdom, e `new MouseEvent({ view: window })` recusa:
  // nos testes o MouseEvent ignora o `view` (no Chrome real ele é o window da página).
  const MouseEventReal = MouseEvent;
  vi.stubGlobal(
    'MouseEvent',
    class extends MouseEventReal {
      constructor(tipo: string, init?: MouseEventInit) {
        super(tipo, { ...init, view: null });
      }
    },
  );
  document.body.className = '';
  document.body.innerHTML = `
  <div id="app"><div id="raiz">
    <div id="side">
      <header><span>Conversas</span></header>
      <div><input role="textbox" aria-label="Pesquisar ou começar uma nova conversa" value="" /></div>
      <div id="pane-side"><div id="lista"></div></div>
    </div>
    <div id="main"></div>
  </div></div>`;
  const eventos: string[] = [];
  const lista = document.getElementById('lista')!;
  const main = document.getElementById('main')!;
  const raiz = document.getElementById('raiz')!;
  const busca = document.querySelector('input')!;
  let aberta: string | null = null;

  const secao = (txt: string, y: number): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.style.transform = `translateY(${y}px)`;
    el.innerHTML = `<div>${txt}</div>`;
    return el;
  };
  const linha = (c: ContatoFalso, y: number): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.setAttribute('data-nome', c.nome);
    el.style.transform = `translateY(${y}px)`;
    const data = c.conversa ? '<div>11:40</div>' : '';
    const icone = c.minha ? '<span data-icon="msg-dblcheck"></span>' : '';
    const grupo = c.grupo ? '<span data-icon="default-group"></span>' : '';
    el.innerHTML = `${grupo}<div><span dir="auto" title="${c.nome}">${c.nome}</span>${data}</div><div>${icone}<span title="prévia"><span>prévia</span></span></div>`;
    el.addEventListener('click', () => abrir(c));
    return el;
  };

  const fecharDrawer = (): void => {
    document.getElementById('drawer')?.remove();
    eventos.push('drawer:fechou');
  };
  const abrirDrawer = (c: ContatoFalso): void => {
    if (op.painel === 'nenhum' || document.getElementById('drawer')) return;
    const d = document.createElement('div');
    d.id = 'drawer';
    if (op.painel !== 'generico') d.setAttribute('data-testid', 'contact-info-drawer');
    const tel = op.mostraTelefone === false ? '' : `<span>${formatar(c.telefone)}</span>`;
    d.innerHTML = `<header><button aria-label="Fechar"><span data-icon="x"></span></button><span>${c.grupo ? 'Dados do grupo' : 'Dados do contato'}</span></header><div><span>~ ${c.nome}</span>${tel}</div>`;
    d.querySelector('button')!.addEventListener('click', fecharDrawer);
    (op.painel === 'generico' ? raiz : document.getElementById('app')!).append(d);
    eventos.push('drawer:abriu');
  };

  function abrir(c: ContatoFalso): void {
    aberta = c.nome;
    eventos.push(`abriu:${c.nome}`);
    main.innerHTML = `<header>${c.grupo ? '<span data-icon="default-group"></span>' : ''}<span dir="auto" title="${c.nome}">${c.nome}</span></header>
      <div data-id="3EB0285DB0862B7F92F1CA"></div>
      <footer><div><div contenteditable="true" role="textbox"></div></div></footer>`;
    main.querySelector('header span[dir]')!.addEventListener('click', () => abrirDrawer(c));
  }

  const desenhar = (q: string): void => {
    lista.replaceChildren();
    const termo = q.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    const acha = (c: ContatoFalso): boolean =>
      termo === '' || (digitos.length >= 4 && c.telefone.includes(digitos)) || c.nome.toLowerCase().includes(termo);
    const achados = contatos.filter(acha);
    let y = 0;
    const conversas = achados.filter((c) => c.conversa || termo === '');
    const agenda = achados.filter((c) => !c.conversa && termo !== '');
    for (const c of conversas) lista.append(linha(c, (y += 72)));
    if (agenda.length > 0) {
      lista.append(secao('Contatos', (y += 72)));
      for (const c of agenda) lista.append(linha(c, (y += 72)));
    }
    if (termo !== '') {
      lista.append(secao('Mensagens', (y += 72)));
      // achado dentro de uma mensagem: NÃO é contato nem conversa
      lista.append(linha({ nome: 'Achado numa mensagem', telefone: '0', conversa: true }, (y += 72)));
    }
  };
  busca.addEventListener('input', () => desenhar(busca.value));
  desenhar('');

  window.addEventListener('beforeunload', () => eventos.push('recarregou'));
  return { eventos, aberta: () => aberta, drawerAberto: () => document.getElementById('drawer') != null };
}
