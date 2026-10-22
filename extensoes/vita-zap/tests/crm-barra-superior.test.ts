// @vitest-environment jsdom
//
// Barra superior de largura total (HTML SINTÉTICO do WhatsApp): aparece, empurra o contêiner raiz, as abas
// filtram, o "+" cria aba por etiqueta, o ponto verde avisa novidade, os ícones da caixa só colam/agendam e
// desligar a barra devolve o layout antigo. Se o seletor da raiz falha, a barra flutua e avisa uma vez.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA } from './ajuda/crm-falso';
import { contato, porId } from './ajuda/fabrica';
import { montarWhatsApp, nomesVisiveis, type LinhaFalsa } from './ajuda/whatsapp-falso';

// 2026-10-21 12:00 em Fortaleza.
const AGORA = new Date('2026-10-21T15:00:00Z');

const LINHAS: LinhaFalsa[] = [
  { nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica o saco de 50 kg?' },
  { nome: 'Bruno Lima', data: '14/10/2026', previa: 'Segue o orçamento', minha: true },
  { nome: 'Carla Dias', data: '10:05', previa: 'Pode entregar amanhã?', naoLidas: 2 },
  { nome: 'Clientes Sal', data: '09:00', previa: 'Maria: bom dia', grupo: true },
  { nome: 'Eva Prado', data: '19/10/2026', previa: 'Combinado, aguardo', minha: true },
  { nome: 'Fábio Reis', data: 'Ontem', previa: 'obrigado!' },
];

const INICIAL = {
  'vz.etiquetas': [{ id: 'e1', nome: 'Padaria', cor: '#00a884' }],
  'vz.contatos': porId(contato('Ana Souza', { etiquetas: ['e1'] }), contato('Eva Prado', { etiquetas: ['e1'] }), contato('Fábio Reis', { fase: 'negociando' })),
};

let ctrl: ControladorCrm | null = null;
let chrome: ChromeFalso;
let teclas = 0;
let mensagens: unknown[] = [];

async function iniciar(config: Record<string, unknown> | null = null): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  if (config) await ctrl.estado.fazer((r) => r.salvarConfig({ ...ctrl!.estado.dados.config, ...config }));
  ctrl.ciclo();
  return ctrl;
}

const sombra = (id: string): ShadowRoot => {
  const host = document.getElementById(id);
  if (!host?.shadowRoot) throw new Error(`host ${id} não encontrado`);
  return host.shadowRoot;
};
const topo = () => sombra('vita-zap-topo');
const popover = () => sombra('vita-zap-overlay');
const raiz = () => document.getElementById('app') as HTMLElement;

function abas(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const b of topo().querySelectorAll('.taba')) r[(b.childNodes[b.childNodes.length - 3]?.textContent ?? '').trim() || (b.textContent ?? '')] = Number(b.querySelector('.n')?.textContent);
  return r;
}
const rotulos = (): string[] => [...topo().querySelectorAll('.taba')].map((b) => [...b.childNodes].find((n) => n.nodeType === 3)?.textContent ?? '');
const aba = (rotulo: string): HTMLButtonElement => {
  const b = [...topo().querySelectorAll<HTMLButtonElement>('.taba')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent === rotulo));
  if (!b) throw new Error(`aba "${rotulo}" não encontrada`);
  return b;
};
const botaoTopo = (dica: string): HTMLButtonElement => {
  const b = [...topo().querySelectorAll<HTMLButtonElement>('button')].find((x) => x.getAttribute('data-tip')?.startsWith(dica));
  if (!b) throw new Error(`botão "${dica}" não encontrado`);
  return b;
};
const botao = (raizBusca: ParentNode, texto: string): HTMLButtonElement => {
  const b = [...raizBusca.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};

beforeEach(() => {
  limparAvisos();
  chrome = instalarChromeFalso(INICIAL);
  mensagens = [];
  (chrome.chrome as { runtime: { sendMessage: (m: unknown) => Promise<void> } }).runtime.sendMessage = (m) => {
    mensagens.push(m);
    return Promise.resolve();
  };
  montarWhatsApp(LINHAS, 'Ana Souza');
  teclas = 0;
  for (const tipo of ['keydown', 'keyup', 'keypress']) document.addEventListener(tipo, () => (teclas += 1), true);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 40)); // deixa as gravações pendentes terminarem antes de trocar o storage falso
  ctrl?.parar();
  ctrl = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('barra superior: aparece e empurra o WhatsApp', () => {
  it('aparece no topo (Shadow DOM), na ordem pedida e com os contadores', async () => {
    await iniciar();
    const host = document.getElementById('vita-zap-topo') as HTMLElement;
    expect(host.parentElement).toBe(document.body);
    expect(host.style.position).toBe('fixed');
    expect(host.style.height).toBe('48px');
    expect(rotulos().slice(0, 4)).toEqual(['Todas', 'Não lidas', 'Aguardando resposta', 'Precisa de resposta']);
    expect(rotulos().slice(4)).toEqual(['Novo', 'Orçamento', 'Negociando', 'Fechado', 'Perdido']);
    expect(Number(aba('Todas').querySelector('.n')?.textContent)).toBe(6);
    expect(Number(aba('Não lidas').querySelector('.n')?.textContent)).toBe(1);
    expect(Number(aba('Aguardando resposta').querySelector('.n')?.textContent)).toBe(2);
    expect(Number(aba('Precisa de resposta').querySelector('.n')?.textContent)).toBe(3);
    expect(Number(aba('Negociando').querySelector('.n')?.textContent)).toBe(1);
    expect(aba('Todas').getAttribute('aria-selected')).toBe('true');
    expect(topo().querySelector('.logo svg')).not.toBeNull();
    expect(abas()).toBeTruthy();
  });

  it('empurra o contêiner raiz para baixo e devolve ao desligar', async () => {
    raiz().style.height = '100%';
    const c = await iniciar();
    expect(raiz().getAttribute('data-vita-zap-empurrado')).toBe('48');
    expect(raiz().style.getPropertyValue('height')).toBe('calc(100vh - 48px)');
    expect(raiz().style.getPropertyValue('margin-top')).toBe('48px');
    expect(document.getElementById('vita-zap-topo')?.classList.contains('flutuando')).toBe(false);

    await c.estado.fazer((r) => r.salvarConfig({ ...c.estado.dados.config, barraSuperior: false }));
    c.ciclo();
    expect(document.getElementById('vita-zap-topo')).toBeNull();
    expect(raiz().hasAttribute('data-vita-zap-empurrado')).toBe(false);
    expect(raiz().style.getPropertyValue('height')).toBe('100%'); // o que o WhatsApp tinha
    expect(raiz().style.getPropertyValue('margin-top')).toBe('');
  });

  it('as abas saem de cima da lista: não há abas duplicadas, só os chips', async () => {
    await iniciar();
    const barra = sombra('vita-zap-barra');
    expect(barra.querySelectorAll('.aba').length).toBe(0);
    expect(barra.querySelector('.chips.compacta')).not.toBeNull();
    expect(botao(barra, 'Etiquetas').className).toContain('chip');
  });

  it('desligado, volta ao layout antigo: abas acima da lista e nada empurrado', async () => {
    await iniciar({ barraSuperior: false });
    expect(document.getElementById('vita-zap-topo')).toBeNull();
    expect(raiz().getAttribute('style') ?? '').toBe('');
    const barra = sombra('vita-zap-barra');
    expect(barra.querySelectorAll('.aba').length).toBe(4);
    expect(barra.querySelector('.chips.compacta')).toBeNull();
  });

  it('religar a barra a traz de volta', async () => {
    const c = await iniciar({ barraSuperior: false });
    await c.estado.fazer((r) => r.salvarConfig({ ...c.estado.dados.config, barraSuperior: true }));
    c.ciclo();
    expect(document.getElementById('vita-zap-topo')).not.toBeNull();
    expect(raiz().getAttribute('data-vita-zap-empurrado')).toBe('48');
  });

  it('se o seletor da raiz falha, não empurra nada: a barra flutua e avisa uma vez só', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    raiz().id = 'outra-raiz';
    const c = await iniciar();
    c.ciclo();
    c.ciclo();
    const host = document.getElementById('vita-zap-topo') as HTMLElement;
    expect(host.classList.contains('flutuando')).toBe(true);
    expect(document.getElementById('outra-raiz')?.getAttribute('style') ?? '').toBe('');
    expect(aviso.mock.calls.filter((a) => String(a[0]).includes('raizApp'))).toHaveLength(1);
    expect(topo().querySelectorAll('.taba').length).toBeGreaterThan(4);
  });
});

describe('barra superior: abas', () => {
  it('"Precisa de resposta" e "Aguardando resposta" filtram a lista; "Todas" restaura', async () => {
    await iniciar();
    aba('Precisa de resposta').click();
    expect(nomesVisiveis()).toEqual(['Ana Souza', 'Carla Dias', 'Fábio Reis']);
    expect(aba('Precisa de resposta').getAttribute('aria-selected')).toBe('true');
    aba('Aguardando resposta').click();
    expect(nomesVisiveis()).toEqual(['Bruno Lima', 'Eva Prado']);
    aba('Todas').click();
    expect(nomesVisiveis()).toHaveLength(6);
  });

  it('aba de funil filtra pelo contato na fase', async () => {
    await iniciar();
    aba('Negociando').click();
    expect(nomesVisiveis()).toEqual(['Fábio Reis']);
  });

  it('esconder uma aba pelos ajustes tira da barra; o ícone de ajustes também oculta grupos', async () => {
    const c = await iniciar();
    botaoTopo('Ajustes de filtro').click();
    const ajustes = [...popover().querySelectorAll('label.check')];
    const perdido = ajustes.find((l) => l.textContent === 'Perdido')?.querySelector('input') as HTMLInputElement;
    perdido.click();
    expect(rotulos()).not.toContain('Perdido');
    expect(c.estado.dados.config.abasOcultas).toEqual(['fase:perdido']);
    const grupos = [...popover().querySelectorAll('label.check')].find((l) => l.textContent?.includes('Ocultar grupos'))?.querySelector('input') as HTMLInputElement;
    grupos.click();
    expect(Number(aba('Todas').querySelector('.n')?.textContent)).toBe(5);
    expect(nomesVisiveis()).not.toContain('Clientes Sal');
    // dias sem resposta, pela mesma janela
    botao(popover(), '3 dias').click();
    expect(c.estado.dados.config.diasSemResposta).toBe(3);
  });

  it('o "+" cria uma aba por etiqueta, que filtra a lista e sobrevive no storage', async () => {
    const c = await iniciar();
    botaoTopo('Nova aba').click();
    const nome = popover().querySelector('input') as HTMLInputElement;
    nome.value = 'Padarias';
    botao(popover(), 'Criar aba').click();
    expect(popover().querySelector('.msg')?.textContent).toContain('etiqueta ou fase'); // sem etiqueta nem fase não cria
    botao(popover(), 'Padaria').click(); // chip da etiqueta
    (popover().querySelector('input') as HTMLInputElement).value = 'Padarias';
    botao(popover(), 'Criar aba').click();
    expect(rotulos()).toContain('Padarias');
    expect(aba('Padarias').getAttribute('aria-selected')).toBe('true');
    expect(Number(aba('Padarias').querySelector('.n')?.textContent)).toBe(2);
    expect(nomesVisiveis()).toEqual(['Ana Souza', 'Eva Prado']);
    expect(popover().querySelector('.pop')).toBeNull(); // o painel fechou
    await vi.waitFor(() => expect((chrome.dados.get('vz.config') as { abasPersonalizadas: Array<{ nome: string; etiquetas: string[] }> }).abasPersonalizadas).toMatchObject([{ nome: 'Padarias', etiquetas: ['e1'] }]));
    expect(c.estado.dados.config.aba).toMatch(/^p:/);
    // excluir devolve para "Todas"
    botaoTopo('Nova aba').click();
    botao(popover(), 'Excluir').click();
    expect(rotulos()).not.toContain('Padarias');
    expect(nomesVisiveis()).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Clientes Sal', 'Eva Prado', 'Fábio Reis']);
  });

  it('ponto verde: aparece quando a aba cresce depois do último clique e some ao clicar de novo', async () => {
    const c = await iniciar();
    aba('Não lidas').click(); // guarda a base (1)
    expect(aba('Não lidas').querySelector('.ponto')).toBeNull();
    expect(aba('Precisa de resposta').querySelector('.ponto')).toBeNull(); // nunca clicada: sem base, sem ponto
    aba('Precisa de resposta').click();
    montarWhatsApp([...LINHAS, { nome: 'Gil Neto', data: '12:00', previa: 'oi?', naoLidas: 1 }], 'Ana Souza');
    c.ciclo();
    expect(aba('Não lidas').querySelector('.ponto')).not.toBeNull();
    expect(aba('Precisa de resposta').querySelector('.ponto')).not.toBeNull();
    expect(aba('Todas').querySelector('.ponto')).toBeNull();
    aba('Não lidas').click();
    expect(aba('Não lidas').querySelector('.ponto')).toBeNull();
    await vi.waitFor(() => expect((chrome.dados.get('vz.config') as { abasVistas: Record<string, number> }).abasVistas?.naoLidas).toBe(2));
  });
});

describe('barra superior: ícones da direita', () => {
  it('cada ícone tem tooltip e o sino mostra os lembretes vencidos', async () => {
    const vencido = { id: 'l1', contatoId: 'id-ana-souza', nome: 'Ana Souza', venceEm: AGORA.getTime() - 3_600_000, criadoEm: 1, status: 'pendente' };
    chrome = instalarChromeFalso({ ...INICIAL, 'vz.lembretes': [vencido] });
    montarWhatsApp(LINHAS, 'Ana Souza');
    await iniciar();
    const dicas = [...topo().querySelectorAll('[data-tip]')].map((b) => b.getAttribute('data-tip'));
    expect(dicas).toEqual(expect.arrayContaining(['Respostas rápidas', 'Lembretes (1 vencido)', 'Clientes', 'Ajuda', 'Nova aba', 'Ajustes de filtro']));
    expect(botaoTopo('Lembretes').querySelector('.selo')?.textContent).toBe('1');
    botaoTopo('Lembretes').click();
    expect(popover().textContent).toContain('Vencidos (1)');
    expect(popover().textContent).toContain('Hoje');
    expect(popover().textContent).toContain('Próximos');
  });

  it('"Respostas rápidas" abre o gerenciador e "?" abre o guia', async () => {
    await iniciar();
    botaoTopo('Respostas rápidas').click();
    expect(popover().textContent).toContain('Novo modelo');
    botaoTopo('Ajuda').click();
    expect(popover().textContent).toContain('Como usar o Vita Zap');
  });

  it('"Clientes" pede ao service worker para abrir o painel na aba Clientes', async () => {
    const c = await iniciar();
    botaoTopo('Clientes').click();
    expect(mensagens).toContainEqual({ vz: 'painel', aba: 'clientes' });
    expect(c.estado.dados.config.pedidoPainel).toMatchObject({ aba: 'clientes' });
  });

  it('sem o repositório do CRM não há botão de conta; com ele: "Conectar ao CRM" e, logado, avatar e "CRM ✓"', async () => {
    await iniciar();
    expect(topo().querySelector('.cta, .conta')).toBeNull();
    ctrl?.parar();
    ctrl = null;

    vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
    chrome = instalarChromeFalso(INICIAL);
    const agoraMs = (): number => AGORA.getTime();
    const crm = criarCrmFalso([], agoraMs);
    const local = new RepositorioLocal(agoraMs);
    const servico = new ServicoCrm(local, crm.transporte, agoraMs);
    const repo = criarRepositorioCRM(local, servico, agoraMs);
    (chrome.chrome as { runtime: { sendMessage: (m: unknown) => Promise<void> } }).runtime.sendMessage = (m) => {
      mensagens.push(m);
      return Promise.resolve();
    };
    montarWhatsApp(LINHAS, null);
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });
    await vi.waitFor(() => expect(topo().querySelector('.cta')?.textContent).toBe('Conectar ao CRM'));
    topo().querySelector<HTMLButtonElement>('.cta')?.click();
    expect(mensagens).toContainEqual({ vz: 'painel', aba: 'dados' }); // o login mora na aba Dados do painel

    await servico.definirUrl(BASE);
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
    vi.setSystemTime(Date.now() + 10_000);
    window.dispatchEvent(new Event('focus')); // voltou para a aba do WhatsApp (a conta só é relida a cada 5 s, no máximo)
    await vi.waitFor(() => expect(topo().querySelector('.conta .ok-crm')?.textContent).toBe('CRM ✓'));
    expect(topo().querySelector('.cta')).toBeNull();
    expect(topo().querySelector('.avatar')?.textContent).toMatch(/^[A-Z]{1,2}$/);
    topo().querySelector<HTMLButtonElement>('.conta')?.click();
    expect(popover().textContent).toContain(EMAIL);
    botao(popover(), 'Sair').click();
    await vi.waitFor(() => expect(topo().querySelector('.cta')?.textContent).toBe('Conectar ao CRM'));
  });
});

describe('ícones na caixa de digitação', () => {
  it('o relógio abre o mesmo popover de lembrete do cabeçalho e o raio abre as respostas, sem enviar nada', async () => {
    await iniciar();
    const caixa = sombra('vita-zap-respostas');
    (caixa.querySelector('[data-acao="lembrete"]') as HTMLButtonElement).click();
    expect(popover().textContent).toContain('Lembrete de follow-up');
    (caixa.querySelector('[data-acao="respostas"]') as HTMLButtonElement).click();
    expect(popover().textContent).toContain('Respostas rápidas');
    expect(teclas).toBe(0);
  });

  it('o lembrete da caixa agenda para a conversa aberta', async () => {
    await iniciar();
    (sombra('vita-zap-respostas').querySelector('[data-acao="lembrete"]') as HTMLButtonElement).click();
    botao(popover(), 'Amanhã 9h').click();
    botao(popover(), 'Salvar lembrete').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.lembretes') as Array<{ nome: string }> | undefined)?.[0]?.nome).toBe('Ana Souza'));
  });
});
