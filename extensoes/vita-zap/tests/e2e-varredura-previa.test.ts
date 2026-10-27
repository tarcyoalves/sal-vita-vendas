// @vitest-environment jsdom
//
// E2E (jsdom) fiel ao DOM REAL do WhatsApp Web de out/2026: varredura com rolagem virtualizada → prévia com os filtros do
// dono (componente Previa renderizado de verdade) → campanha → abrir e colar (manual) no 1º contato.
// O WhatsApp aqui é sintético (tests/ajuda/whatsapp-web-2026.ts), mas cada estrutura vem do que foi coletado em campo.
// NÃO substitui o checklist no WhatsApp real (README, seção 7).

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { abrirEColar, classificarConversa, limparCaixa, pararObservacao } from '../src/content/execucao';
import { previaTemAutor } from '../src/content/extrair';
import { varrerLista } from '../src/content/varredura';
import type { Campanha } from '../src/shared/campanha';
import { abrirBanco, listarCampanhas, listarContatos, listarEnvios, listarNaoEnviar, registrarEnvio, salvarConfig, salvarContatos, type Banco } from '../src/shared/banco';
import { deduplicarLinhas, linhasParaContatos, type ContatoVarrido } from '../src/shared/contatos';
import { CONFIG_PADRAO } from '../src/shared/politica';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { Executor } from '../src/sidepanel/executor';
import { Previa } from '../src/sidepanel/Previa';
import { Varredura } from '../src/sidepanel/Varredura';
import type { DadosLocais } from '../src/sidepanel/App';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsAppWeb2026, rodar, type ChatFalso, type WhatsAppWeb2026 } from './ajuda/whatsapp-web-2026';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Terça-feira, 27/10/2026, 15:00 em Fortaleza.
const AGORA = new Date('2026-10-27T18:00:00Z');

const CHATS: ChatFalso[] = [
  // ── Conversas com "CLIENTE" no nome ──
  { nome: 'Ana CLIENTE Souza', data: '14:32', icone: 'msg-dblcheck', previa: 'Bom dia, tudo bem?' },
  { nome: 'Bruno CLIENTE Lima', data: 'Ontem', previa: 'Obrigado!' },
  { nome: 'Carla CLIENTE Dias', data: 'sexta-feira', icone: 'msg-check', previa: 'Segue a tabela' },
  { nome: 'Diego CLIENTE Rocha', data: '17/09/2026', icone: 'msg-dblcheck', previa: 'Combinado' },
  { nome: 'Elisa CLIENTE Matos', data: '16/09/2026', icone: 'msg-dblcheck', previa: 'Fechado então' },
  { nome: 'Fabio CLIENTE Nunes', data: '15/09/2026', previa: 'Você: Segue o preço do sal' },
  { nome: 'Gil CLIENTE Prado', data: '02/09/2026', previa: 'Pode mandar o preço' },
  { nome: 'Helena CLIENTE Braga', data: '20/08/2026', previa: 'Vou ver com o sócio' },
  { nome: 'Igor CLIENTE Pires', data: '10/08/2026', icone: 'msg-time', previa: 'Bom dia' },
  { nome: 'Júlia CLIENTE Tavares', data: '03/07/2026', icone: 'msg-dblcheck', previa: 'Qualquer coisa me chama' },
  // dois nomes repetidos (dois chats com o mesmo nome salvo)
  { nome: 'Marcos CLIENTE Alves', data: '12/06/2026', icone: 'msg-dblcheck', previa: 'Ok' },
  { nome: 'Marcos CLIENTE Alves', data: '01/06/2026', previa: 'Valeu' },
  { nome: 'Paula CLIENTE Reis', data: '10/05/2026', icone: 'msg-dblcheck', previa: 'Ok' },
  { nome: 'Paula CLIENTE Reis', data: '22/04/2026', icone: 'msg-check', previa: 'Ok' },
  // grupos: um com ícone padrão, outro com foto (só a prévia "Ana: oi" denuncia)
  { nome: 'Grupo CLIENTES Mossoró', data: 'sábado', grupo: 'icone', previa: 'Pedro: tabela nova' },
  { nome: 'Atacado CLIENTE VIP', data: '09/09/2026', grupo: 'foto', previa: 'Ana: oi' },
  // ── Contatos da agenda sem conversa (seção "Contatos") ──
  { nome: 'Rafael CLIENTE Mendes', secao: 'contatos' },
  { nome: 'Sandra CLIENTE Ferraz', secao: 'contatos' },
  // ── Achados dentro de mensagens (seção "Mensagens"): nomes SEM "CLIENTE", números e eco de um chat já listado ──
  { nome: 'Padaria Santo Antônio', data: '14/10/2026', icone: 'msg-dblcheck', previa: 'o cliente pediu 10 sacos', secao: 'mensagens' },
  { nome: 'Mercadinho Boa Vista', data: '11/10/2026', previa: 'novo cliente da região', secao: 'mensagens' },
  { nome: '+55 84 99111-2222', data: '09:10', previa: 'sou cliente de vocês', secao: 'mensagens' },
  { nome: '+55 84 99333-4444', data: 'Ontem', previa: 'cliente antigo', secao: 'mensagens' },
  { nome: '+55 84 99555-6666', data: '08/10/2026', previa: 'cliente novo', secao: 'mensagens' },
  { nome: 'Ana CLIENTE Souza', data: '10/10/2026', previa: 'esse cliente pediu 10 sacos', secao: 'mensagens' },
];

let wa: WhatsAppWeb2026;
let db: Banco;
let n = 0;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: AGORA });
  vi.spyOn(Math, 'random').mockReturnValue(0); // sorteio de variação e ritmo previsíveis
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


// ── utilidades de tela ────────────────────────────────────────────────────────

let raiz: Root;
let el: HTMLElement;

async function renderizar(componente: ReturnType<typeof createElement>) {
  await act(async () => {
    raiz.render(componente);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

function digitar(input: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, valor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function rotulo(texto: string): HTMLLabelElement {
  const l = [...el.querySelectorAll('label')].find((x) => (x.textContent ?? '').includes(texto));
  if (!l) throw new Error(`rótulo não encontrado: ${texto}`);
  return l;
}
const campo = (texto: string) => rotulo(texto).querySelector('input, textarea') as HTMLInputElement & HTMLTextAreaElement;
const botao = (texto: string) => {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes(texto));
  if (!b) throw new Error(`botão não encontrado: ${texto}`);
  return b;
};

async function agir(fn: () => void) {
  await act(async () => {
    fn();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}

function placar() {
  const m = /(\d+) entram · (\d+) para revisar · (\d+) fora/.exec(el.textContent ?? '');
  if (!m) throw new Error('placar "N entram · N para revisar · N fora" não encontrado');
  return { entram: Number(m[1]), revisar: Number(m[2]), fora: Number(m[3]) };
}

/** nome → motivo, da lista "Fora da campanha" ou "Revisar". */
function motivos(secao: 'Fora da campanha' | 'Revisar'): Map<string, string> {
  const det = [...el.querySelectorAll('details')].find((d) => (d.querySelector('summary')?.textContent ?? '').startsWith(secao));
  const r = new Map<string, string>();
  for (const li of det?.querySelectorAll('li') ?? []) {
    const nome = li.querySelector('b')?.textContent ?? '';
    const small = li.querySelector('small')?.textContent ?? '';
    r.set(nome, small.replace(/^—\s*/, '').split(' · lista mostrava')[0].split(' · ')[0]);
  }
  return r;
}

/** nomes dos itens da prévia (#N + nome), com o estado da caixa de marcar. */
function itensDaPrevia(): Array<{ nome: string; marcado: boolean; texto: string }> {
  const h = [...el.querySelectorAll('h3')].find((x) => (x.textContent ?? '').startsWith('Prévia'));
  const ul = h?.closest('.cartao')?.querySelector('ul.lista');
  return [...(ul?.querySelectorAll(':scope > li') ?? [])].map((li) => ({
    nome: li.querySelector('b')?.textContent ?? '',
    marcado: (li.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
    texto: li.querySelector('.balao')?.textContent ?? '',
  }));
}

let dados: DadosLocais;
async function carregarDados(): Promise<void> {
  dados = { contatos: await listarContatos(db), campanhas: await listarCampanhas(db), envios: await listarEnvios(db), naoEnviar: await listarNaoEnviar(db) };
}

/** Cada bloco `describe` monta a própria tela uma vez e a mantém entre os testes (a ordem importa, como na vida real). */
function usarTela() {
  beforeAll(() => {
    el = document.createElement('div');
    document.body.append(el);
    raiz = createRoot(el);
  });
  afterAll(async () => {
    await act(async () => raiz.unmount());
    el.remove();
  });
}

const NOMES_ENTRAM_COM_SO_MINHA = ['Elisa CLIENTE Matos', 'Fabio CLIENTE Nunes', 'Helena CLIENTE Braga', 'Júlia CLIENTE Tavares'];

describe('1. varredura com o termo CLIENTE (rolagem virtualizada)', () => {
  usarTela();
  let contatos: ContatoVarrido[];

  it('rola a lista virtualizada e lê tudo, sem abrir conversa nem enviar nada', async () => {
    wa = montarWhatsAppWeb2026(CHATS);
    db = await abrirBanco(`e2e-${(n += 1)}`);
    await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
    // a lista é virtualizada: só uma janela existe no DOM
    expect(wa.linhasNoDom()).toBeLessThan(CHATS.length);
    const r = await rodar(varrerLista('CLIENTE', () => undefined));
    expect(wa.redesenhos()).toBeGreaterThan(3); // rolou de verdade
    expect(wa.buscaTexto()).toBe('CLIENTE');
    expect(r.avisos).toEqual([]);
    expect(wa.eventos).toEqual([]); // não abriu conversa
    expect(wa.proibido).toEqual([]);
    contatos = linhasParaContatos(r.linhas, AGORA);
    await salvarContatos(db, contatos);
    await carregarDados();
  });

  it('data lida, "ultimaDeMim" e demais sinais de cada linha', () => {
    const por = new Map(contatos.map((c) => [c.nome, c]));
    const ok = (nome: string, data: string | null, minha: boolean | null) => {
      const c = por.get(nome);
      expect(c, nome).toBeDefined();
      expect([nome, c!.ultimaConversa, c!.ultimaDeMim ?? null]).toEqual([nome, data, minha]);
    };
    ok('Ana CLIENTE Souza', '2026-10-27', true); // "14:32" = hoje
    ok('Bruno CLIENTE Lima', '2026-10-26', false); // "Ontem"
    ok('Carla CLIENTE Dias', '2026-10-23', true); // "sexta-feira"
    ok('Diego CLIENTE Rocha', '2026-09-17', true);
    ok('Elisa CLIENTE Matos', '2026-09-16', true);
    ok('Fabio CLIENTE Nunes', '2026-09-15', true); // só o prefixo "Você:"
    ok('Gil CLIENTE Prado', '2026-09-02', false);
    ok('Helena CLIENTE Braga', '2026-08-20', false);
    ok('Igor CLIENTE Pires', '2026-08-10', true); // relógio (msg-time)
    ok('Júlia CLIENTE Tavares', '2026-07-03', true);
    expect(por.get('Rafael CLIENTE Mendes')).toMatchObject({ temConversa: false, ultimaConversa: null });
    expect(por.get('Sandra CLIENTE Ferraz')).toMatchObject({ temConversa: false });
  });

  it('nomes repetidos são duplicados; o eco do mesmo chat na seção "Mensagens" NÃO cria duplicata', () => {
    const dup = contatos.filter((c) => c.duplicado).map((c) => c.nome).sort();
    expect(dup).toEqual(['Marcos CLIENTE Alves', 'Paula CLIENTE Reis']);
    expect(contatos.find((c) => c.nome === 'Ana CLIENTE Souza')).toMatchObject({ duplicado: false, ultimaConversa: '2026-10-27' });
  });

  it('só número, grupos e contagens do painel Varredura', async () => {
    const soNumero = contatos.filter((c) => c.soNumero).map((c) => c.nome);
    expect(soNumero).toEqual(['+55 84 99111-2222', '+55 84 99333-4444', '+55 84 99555-6666']);
    expect(contatos.filter((c) => c.pareceGrupo).map((c) => c.nome)).toEqual(['Grupo CLIENTES Mossoró']);
    expect(contatos.find((c) => c.nome === 'Atacado CLIENTE VIP')).toMatchObject({ possivelGrupo: true });

    const chrome = instalarChromeFalso();
    (chrome.chrome as { runtime: { onMessage: Record<string, unknown> } }).runtime.onMessage.removeListener = () => undefined;
    await renderizar(createElement(Varredura, { db, dados, aoMudar: async () => undefined, aoContinuar: () => undefined }));
    const itens = [...el.querySelectorAll('ul.numeros li')].map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(itens).toEqual([
      `${contatos.length} salvos`,
      `${contatos.filter((c) => c.ultimaConversa).length} com conversa`,
      '2 contatos da agenda',
      '3 só número (fora)',
      '1 grupos (fora)',
    ]);
  });
});

// ── 2. Prévia com os filtros do dono ─────────────────────────────────────────

const FORA_COM_SO_MINHA: Record<string, string> = {
  'Ana CLIENTE Souza': 'última conversa 27/10/2026 é posterior a 16/09/2026',
  'Bruno CLIENTE Lima': 'última conversa 26/10/2026 é posterior a 16/09/2026',
  'Carla CLIENTE Dias': 'última conversa 23/10/2026 é posterior a 16/09/2026',
  'Diego CLIENTE Rocha': 'última conversa 17/09/2026 é posterior a 16/09/2026',
  'Gil CLIENTE Prado': 'sem mensagem sua (nenhum sinal de conversa feita por você)',
  'Igor CLIENTE Pires': 'recebeu campanha há 5 dia(s) (mínimo 14)',
  'Grupo CLIENTES Mossoró': 'grupo ou lista de transmissão',
  'Rafael CLIENTE Mendes': 'sem conversa anterior',
  'Sandra CLIENTE Ferraz': 'sem conversa anterior',
  'Padaria Santo Antônio': 'nome não contém "CLIENTE"',
  'Mercadinho Boa Vista': 'nome não contém "CLIENTE"',
  '+55 84 99111-2222': 'não salvo na agenda (aparece só o número)',
  '+55 84 99333-4444': 'não salvo na agenda (aparece só o número)',
  '+55 84 99555-6666': 'não salvo na agenda (aparece só o número)',
};

async function abrirPrevia() {
  // histórico de campanhas: Igor recebeu há 5 dias (fora); Helena há 20 dias (já pode receber de novo)
  await registrarEnvio(db, { campanhaId: 'antiga', chave: 'igor cliente pires', nome: 'Igor CLIENTE Pires', enviadoEm: '2026-10-22T14:00:00.000Z', textoConfere: true });
  await registrarEnvio(db, { campanhaId: 'antiga2', chave: 'helena cliente braga', nome: 'Helena CLIENTE Braga', enviadoEm: '2026-10-07T14:00:00.000Z', textoConfere: true });
  await carregarDados();
  instalarChromeFalso();
  try {
    localStorage.clear();
  } catch {
    /* sem localStorage */
  }
  await renderizar(createElement(Previa, { db, dados, aoAprovar: async () => undefined }));
}

describe('2. prévia com os filtros do dono', () => {
  usarTela();
  it('Nome contém CLIENTE + até 16/09/2026 + "só conversa minha" + 14 dias: entram exatamente os esperados', async () => {
    await abrirPrevia();
    expect(campo('Nome contém').value).toBe('CLIENTE');
    // o painel Varredura deixa "só conversa minha" ligado por padrão: a Prévia tem de abrir igual (e o dono ainda marca)
    const caixaMinha = rotulo('Só contatos com conversa já feita por mim').querySelector('input') as HTMLInputElement;
    expect(caixaMinha.checked).toBe(true);
    await agir(() => digitar(campo('Última conversa até o dia'), '2026-09-16'));
    expect(campo('Excluir quem recebeu campanha').value).toBe('14');

    expect(placar()).toEqual({ entram: 4, revisar: 3, fora: Object.keys(FORA_COM_SO_MINHA).length });
    const fora = motivos('Fora da campanha');
    for (const [nome, motivo] of Object.entries(FORA_COM_SO_MINHA)) expect([nome, fora.get(nome)]).toEqual([nome, motivo]);
    const rev = motivos('Revisar');
    expect([...rev.keys()].sort()).toEqual(['Atacado CLIENTE VIP', 'Marcos CLIENTE Alves', 'Paula CLIENTE Reis']);
    expect(rev.get('Marcos CLIENTE Alves')).toBe('mais de uma conversa com este nome');
    expect(rev.get('Atacado CLIENTE VIP')).toMatch(/pode ser grupo/);
    for (const nome of NOMES_ENTRAM_COM_SO_MINHA) expect(fora.has(nome) || rev.has(nome)).toBe(false);
  });

  it('botão Gerar prévia liberado, sem a dica falsa "Seus contatos não têm CLIENTE" nem o aviso de "nenhum entrou"', () => {
    expect(botao('Gerar prévia').disabled).toBe(false);
    const txt = el.textContent ?? '';
    expect(txt).not.toContain('não têm "CLIENTE" no nome');
    expect(txt).not.toContain('Por que nenhum contato entrou');
    expect(txt).not.toContain('Nenhum contato entrou direto');
    expect(txt).not.toContain('varridos antes da 0.7.21');
  });

  it('gerar a prévia: os 4 marcados em ordem de data (mais recente primeiro); o possível grupo entra DESMARCADO; nome repetido nunca entra', async () => {
    await agir(() => botao('Gerar prévia').click());
    const itens = itensDaPrevia();
    expect(itens.filter((i) => i.marcado).map((i) => i.nome)).toEqual(NOMES_ENTRAM_COM_SO_MINHA);
    expect(itens.filter((i) => !i.marcado).map((i) => i.nome)).toEqual(['Atacado CLIENTE VIP']);
    expect(itens.map((i) => i.nome)).not.toContain('Marcos CLIENTE Alves'); // sem como saber qual conversa abrir
    expect(itens.map((i) => i.nome)).not.toContain('Paula CLIENTE Reis');
    expect(itens.find((i) => i.nome === 'Elisa CLIENTE Matos')?.texto).toBe('Boa tarde, Elisa, tudo bem? Como estão de sal por aí?');
  });

  it('com "só conversa minha" DESMARCADO entra também quem respondeu por último (Gil), e só ele a mais', async () => {
    const caixaMinha = rotulo('Só contatos com conversa já feita por mim').querySelector('input') as HTMLInputElement;
    await agir(() => caixaMinha.click());
    expect(caixaMinha.checked).toBe(false);
    expect(placar()).toEqual({ entram: 5, revisar: 3, fora: Object.keys(FORA_COM_SO_MINHA).length - 1 });
    const fora = motivos('Fora da campanha');
    expect(fora.has('Gil CLIENTE Prado')).toBe(false);
    expect(botao('Gerar prévia').disabled).toBe(false);
    for (const nome of ['Grupo CLIENTES Mossoró', '+55 84 99111-2222', 'Igor CLIENTE Pires']) expect(fora.has(nome)).toBe(true);
  });

  it('rotina "Reativação 30d+" (sem conversa há 30 dias): mesmos bloqueios, prévia já gerada', async () => {
    await agir(() => botao('Reativação 30d+').click());
    const itens = itensDaPrevia();
    // corte = hoje - 30 dias = 27/09/2026: Diego (17/09) agora entra; Ana/Bruno/Carla (outubro) não
    expect(itens.filter((i) => i.marcado).map((i) => i.nome)).toEqual([
      'Diego CLIENTE Rocha',
      'Elisa CLIENTE Matos',
      'Fabio CLIENTE Nunes',
      'Gil CLIENTE Prado',
      'Helena CLIENTE Braga',
      'Júlia CLIENTE Tavares',
    ]);
    const marcados = itens.filter((i) => i.marcado).map((i) => i.nome);
    for (const proibido of ['Grupo CLIENTES Mossoró', 'Atacado CLIENTE VIP', 'Igor CLIENTE Pires', 'Marcos CLIENTE Alves', 'Paula CLIENTE Reis', 'Rafael CLIENTE Mendes', 'Padaria Santo Antônio']) {
      expect(marcados).not.toContain(proibido);
    }
    expect(itens.find((i) => i.nome === 'Diego CLIENTE Rocha')?.texto).toBe('Boa tarde, Diego, tudo bem? Como estão de sal por aí para este mês?');
  });

  it('dica coerente: nome que ninguém tem → botão travado e motivos verdadeiros; só nomes → "Seus contatos não têm …"; só revisar → pode gerar', async () => {
    await agir(() => botao('Limpar rotina').click());
    await agir(() => digitar(campo('Nome contém'), 'ZZZ'));
    expect(placar()).toMatchObject({ entram: 0, revisar: 0 });
    expect(botao('Gerar prévia').disabled).toBe(true);
    expect(el.textContent).toContain('O botão Gerar prévia só libera quando pelo menos 1 contato entra');
    // há outros motivos (só número, grupo, agenda): a dica "Seus contatos não têm ZZZ" seria mentira, e os motivos reais aparecem
    expect(el.textContent).not.toContain('Seus contatos não têm');
    expect(el.textContent).toContain('15 contatos: nome não contém "ZZZ"');
    expect(el.textContent).toContain('3 contatos: não salvo na agenda');

    // só contatos comuns: tudo caiu pelo nome → aí sim a dica
    const comuns = dados.contatos.filter((c) => ['Bruno CLIENTE Lima', 'Carla CLIENTE Dias'].includes(c.nome));
    await renderizar(createElement(Previa, { db, dados: { ...dados, contatos: comuns }, aoAprovar: async () => undefined }));
    expect(el.textContent).toContain('Seus contatos não têm "ZZZ" no nome.');
    await renderizar(createElement(Previa, { db, dados, aoAprovar: async () => undefined }));

    // nada entra direto (só nomes repetidos e possível grupo), mas dá para gerar a prévia para revisar
    await agir(() => digitar(campo('Nome contém'), 'CLIENTE'));
    await agir(() => digitar(campo('Última conversa até o dia'), '2026-09-10'));
    await agir(() => digitar(campo('Nome NÃO contém'), 'Elisa, Fabio, Gil, Helena, Júlia, Diego'));
    const p = placar();
    expect(p.entram).toBe(0);
    expect(p.revisar).toBe(3);
    expect(botao('Gerar prévia').disabled).toBe(false);
    expect(el.textContent).toContain('Nenhum contato entrou direto, mas há 3 para revisar');
    expect(el.textContent).not.toContain('Seus contatos não têm');
  });
});

// ── 3. Campanha → abrir e colar no 1º contato (envio manual) ─────────────────

/** O "content script" falso: encaminha os pedidos do painel para o código real, como o index.ts faz. */
function montarExecutor(campanha: Campanha) {
  let ex!: Executor;
  const pedir = async (p: PedidoConteudo): Promise<RespostaConteudo> => {
    switch (p.tipo) {
      case 'abrirEColar':
        return abrirEColar(
          p.nome,
          p.texto,
          (texto, textoConfere) => void ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: p.nome, texto, textoConfere }),
          p.envioAutomatico,
          (ev) => void ex.aoReceberEvento(ev),
        );
      case 'limparCaixa':
        return limparCaixa(p.texto);
      case 'pararObservacao':
        pararObservacao();
        return { ok: true };
      default:
        return { ok: true };
    }
  };
  ex = new Executor(
    {
      db,
      pedir,
      agora: () => new Date(),
      aleatorio: () => 0.5,
      agendar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    },
    campanha,
  );
  return ex;
}

/** Previa com os filtros do dono → Gerar prévia → (des)marca → Aprovar. Devolve a campanha gravada. */
async function aprovarCampanha(marcado: (nome: string) => boolean): Promise<Campanha> {
  try {
    localStorage.clear();
  } catch {
    /* sem localStorage */
  }
  await carregarDados();
  let aprovada: string | null = null;
  await renderizar(createElement(Previa, { db, dados, aoAprovar: async (id) => void (aprovada = id) }));
  await agir(() => digitar(campo('Última conversa até o dia'), '2026-09-16'));
  await agir(() => digitar(campo('Texto base'), 'Boa tarde, {primeiro_nome}, tudo bem?'));
  await agir(() => botao('Gerar prévia').click());
  for (const cx of el.querySelectorAll<HTMLInputElement>('ul.lista > li input[type="checkbox"]')) {
    const nome = cx.closest('li')?.querySelector('b')?.textContent ?? '';
    if (cx.checked !== marcado(nome)) await agir(() => cx.click());
  }
  await agir(() => botao('Aprovar campanha').click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(aprovada).not.toBeNull();
  const c = (await listarCampanhas(db)).find((x) => x.id === aprovada);
  expect(c).toBeDefined();
  return c!;
}

const idsDoChat = (): string[] => [...document.querySelectorAll('#main [data-id]')].map((e) => e.getAttribute('data-id') ?? '');

describe('3. campanha aprovada → abrir e colar no 1º contato (envio manual)', () => {
  usarTela();
  let campanha: Campanha;
  let ex: Executor;

  it('aprova a campanha com os 4 contatos do filtro e o texto de {primeiro_nome}', async () => {
    campanha = await aprovarCampanha((nome) => NOMES_ENTRAM_COM_SO_MINHA.includes(nome));
    expect(campanha.itens.map((i) => i.nome)).toEqual(NOMES_ENTRAM_COM_SO_MINHA);
    expect(campanha.itens.map((i) => i.primeiroNome)).toEqual(['Elisa', 'Fabio', 'Helena', 'Júlia']);
    expect(campanha.modelos).toEqual(['Boa tarde, {primeiro_nome}, tudo bem?']);
    expect(campanha.status).toBe('pausada'); // nada acontece até o dono clicar em Iniciar
  });

  it('Iniciar: abre a conversa certa, cola o texto e PARA (nada é enviado, nenhum botão clicado)', async () => {
    // o WhatsApp da varredura continua aberto, com "CLIENTE" ainda escrito na busca (aria-label vazio)
    expect(wa.buscaTexto()).toBe('CLIENTE');
    expect(document.querySelector('#side input[role="textbox"]')?.getAttribute('aria-label')).toBe('');
    ex = montarExecutor(campanha);
    await rodar(ex.iniciar());
    expect(ex.atual.mensagem).toBeNull();
    expect(ex.atual.fase).toBe('aguardando_envio');
    expect(ex.atual.itemAtual?.nome).toBe('Elisa CLIENTE Matos');
    expect(wa.aberta()).toBe('Elisa CLIENTE Matos');
    expect(document.querySelector('#main header span[dir="auto"]')?.textContent).toBe('Elisa CLIENTE Matos');
    expect(wa.textoDaCaixa()).toBe('Boa tarde, Elisa, tudo bem?');
    expect(wa.textosNoChat().some((t) => t.includes('Boa tarde, Elisa'))).toBe(false); // continua só na caixa
    expect(wa.proibido).toEqual([]); // sem teclado, sem recarregar, sem clique no rodapé
    expect(wa.eventos).toEqual(['abriu:Elisa CLIENTE Matos']);
    // com texto na caixa o WhatsApp troca o microfone por "Enviar": ele existe, e ninguém clicou
    expect(document.querySelector('#main footer button[aria-label="Enviar"]')).not.toBeNull();
  });

  it('classificação individual SEM JID: hashes puros, mensagens de sistema e ícones de status do DOM real', () => {
    const ids = idsDoChat();
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => !/^(true|false)_/.test(id) && !id.includes('@'))).toBe(true);
    expect(wa.mensagensNoDom()).toBe(3);
    expect(classificarConversa(ids, document)).toBe('individual');
    expect(classificarConversa(ids, document, 'Elisa CLIENTE Matos', true)).toBe('individual'); // critério do envio automático
    expect(ex.atual.campanha.emVoo?.idsAntes).toEqual(ids); // "foto" para detectar o envio
  });

  it('quando o atendente aperta Enter, a extensão reconhece a mensagem (ícone de relógio) e registra o envio', async () => {
    wa.enviarComoUsuario();
    // o detector espera ~400 ms; o resto é gravação no IndexedDB (assíncrona de verdade)
    for (let i = 0; i < 40 && ex.atual.fase === 'aguardando_envio'; i += 1) await vi.advanceTimersByTimeAsync(100);
    const envios = await listarEnvios(db);
    expect(envios.filter((e) => e.campanhaId === campanha.id).map((e) => e.nome)).toEqual(['Elisa CLIENTE Matos']);
    expect(ex.atual.campanha.itens.map((i) => i.status)).toEqual(['enviado', 'pendente', 'pendente', 'pendente']);
    expect(ex.atual.fase).toBe('intervalo'); // espera 60 a 120 s antes de abrir o próximo
    expect(wa.eventos).toEqual(['abriu:Elisa CLIENTE Matos']);
    await ex.pausar();
    expect(wa.proibido).toEqual([]);
  });

  it('nome repetido: a extensão não adivinha a conversa e não cola nada', async () => {
    const r = await rodar(abrirEColar('Marcos CLIENTE Alves', 'Oi, tudo bem?', () => undefined, false));
    expect(r).toMatchObject({ ok: false, codigo: 'ambiguo' });
    expect(wa.textoDaCaixa()).toBe('');
    expect(wa.aberta()).toBe('Elisa CLIENTE Matos');
  });
});

// ── 4. Grupo com foto ────────────────────────────────────────────────────────

describe('4. grupo com foto (só a prévia "Ana: oi" denuncia): não entra e não recebe colagem', () => {
  usarTela();

  it('não entra sozinho: fica em "revisar" (nunca marcado) e fora do "Incluir todos"', async () => {
    await carregarDados();
    await renderizar(createElement(Previa, { db, dados, aoAprovar: async () => undefined }));
    await agir(() => digitar(campo('Última conversa até o dia'), '2026-09-16'));
    expect(motivos('Revisar').get('Atacado CLIENTE VIP')).toMatch(/pode ser grupo/);
    await agir(() => botao('Gerar prévia').click());
    expect(itensDaPrevia().find((i) => i.nome === 'Atacado CLIENTE VIP')?.marcado).toBe(false);
    await agir(() => botao('+ Incluir todos os para revisar').click());
    expect(itensDaPrevia().find((i) => i.nome === 'Atacado CLIENTE VIP')?.marcado).toBe(false);
  });

  it('mesmo se o dono incluir à mão, a conversa é reconhecida como grupo ao abrir: nada é colado', async () => {
    const campanha = await aprovarCampanha((nome) => nome === 'Atacado CLIENTE VIP');
    expect(campanha.itens.map((i) => i.nome)).toEqual(['Atacado CLIENTE VIP']);
    const ex = montarExecutor(campanha);
    await rodar(ex.iniciar());
    expect(wa.aberta()).toBe('Atacado CLIENTE VIP'); // abriu só para conferir
    expect(wa.textoDaCaixa()).toBe('');
    const item = ex.atual.campanha.itens[0];
    expect(item.status).toBe('problema');
    expect(item.motivo).toMatch(/grupo/);
    expect(wa.proibido).toEqual([]);
    expect(ex.atual.campanha.emVoo ?? null).toBeNull();
  });

  it('grupo com foto sem lista de participantes no cabeçalho: autores diferentes do título ainda barram', async () => {
    montarWhatsAppWeb2026(
      CHATS.map((c) =>
        c.nome === 'Atacado CLIENTE VIP'
          ? { ...c, subtitulo: 'online', mensagens: [{ id: '3EB0AAAA1111BBBB2222CC', texto: 'oi', autor: 'Ana' }] }
          : c,
      ),
    );
    const r = await rodar(abrirEColar('Atacado CLIENTE VIP', 'Boa tarde, Atacado, tudo bem?', () => undefined, false));
    expect(r).toMatchObject({ ok: false, codigo: 'grupo' });
    expect(document.querySelector<HTMLElement>('#main footer div[contenteditable="true"]')?.textContent).toBe('');
  });

  it('o mesmo vale no envio automático (critério estrito): nada colado, nenhum clique', async () => {
    const r = await rodar(abrirEColar('Atacado CLIENTE VIP', 'Boa tarde, Atacado, tudo bem?', () => undefined, true));
    expect(r).toMatchObject({ ok: false, codigo: 'grupo' });
    expect(document.querySelector<HTMLElement>('#main footer div[contenteditable="true"]')?.textContent).toBe('');
    pararObservacao();
  });
});

// ── Peças novas da 0.7.29, em pequeno ────────────────────────────────────────

describe('indícios lidos da linha da lista', () => {
  const tem = (html: string): boolean => {
    const el = document.createElement('div');
    el.innerHTML = `<span dir="auto" title="Nome">Nome</span>${html}`;
    return previaTemAutor(el, el.querySelector('span[dir="auto"][title]') as HTMLElement);
  };

  it('prévia com autor ("Ana: oi", "Ana:" + texto separado) é indício de grupo; "Você:", hora e texto comum não', () => {
    expect(tem('<div>Ana: oi</div>')).toBe(true);
    expect(tem('<div><span>Pedro Souza:</span> <span>tabela nova</span></div>')).toBe(true);
    expect(tem('<div><span>Você:</span> <span>Segue o preço</span></div>')).toBe(false);
    expect(tem('<div>You: ok</div>')).toBe(false);
    expect(tem('<div>14:32</div>')).toBe(false);
    expect(tem('<div>Bom dia, tudo bem?</div>')).toBe(false);
    expect(tem('<div>Pedido 10: sacos</div>')).toBe(false);
  });

  it('achado na seção "Mensagens" não vira duplicata nem empresta data; sozinho, fica sem data de verdade', () => {
    const base = { pareceGrupo: false } as const;
    const r = deduplicarLinhas([
      { ...base, nome: 'Ana', rotuloData: '14:32', ultimaDeMim: true, posicao: 0 },
      { ...base, nome: 'Ana', rotuloData: '10/10/2026', ultimaDeMim: false, posicao: 900, deMensagem: true },
      { ...base, nome: 'Zé', rotuloData: '09/10/2026', ultimaDeMim: true, posicao: 1000, deMensagem: true },
      { ...base, nome: 'Zé', rotuloData: '08/10/2026', ultimaDeMim: true, posicao: 1100, deMensagem: true },
    ]);
    expect(r.find((x) => x.nome === 'Ana')).toMatchObject({ duplicado: false, rotuloData: '14:32', ultimaDeMim: true });
    expect(r.filter((x) => x.nome === 'Zé')).toHaveLength(1);
    const [ze] = linhasParaContatos(r.filter((x) => x.nome === 'Zé'), AGORA);
    expect(ze).toMatchObject({ ultimaConversa: null, ultimaDeMim: null, duplicado: false });
    expect(ze.revisarData).toMatch(/achado dentro de uma mensagem/);
  });
});
