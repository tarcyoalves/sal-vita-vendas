// @vitest-environment jsdom
//
// "Criar lead" a partir do chat preenche o telefone (v0.7.21), mesmo no WhatsApp atual, onde o data-id das
// mensagens NÃO traz o jid e o contato salvo mostra só o nome. Fontes, em ordem: telefone memorizado (conversa aberta
// pelo telefone/lembrete), índice local, e por último o painel "Dados do contato" (abre, lê, fecha).
// ⚠️ HTML sintético: a validação no WhatsApp real é manual (README, seção 6).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirConversaPorTelefoneSemRecarregar } from '../src/content/abrir-por-telefone';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { telefoneDaConversaAberta } from '../src/content/crm/conversa-aberta';
import { TEMPOS_DADOS, lerTelefoneDosDadosDoContato } from '../src/content/crm/dados-do-contato';
import { esquecerTelefones, memorizarTelefone } from '../src/content/crm/telefone-conhecido';
import { limparAvisos } from '../src/content/crm/ui';
import { TEMPOS_BUSCA } from '../src/content/lista';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsAppComBusca, type BuscaFalsa, type OpcoesBuscaFalsa } from './ajuda/whatsapp-busca-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const ANA = { nome: 'Ana Souza Cliente', telefone: '5584999990000', conversa: true };

let ctrl: ControladorCrm | null = null;
let crm: CrmFalso;
let servico: ServicoCrm;
let repo: ReturnType<typeof criarRepositorioCRM>;
let wa: BuscaFalsa;

const faixa = (): ShadowRoot | null => document.getElementById('vita-zap-lead')?.shadowRoot ?? null;
const overlay = (): ShadowRoot => document.getElementById('vita-zap-overlay')!.shadowRoot!;
const botao = (raiz: ParentNode, texto: string): HTMLButtonElement => {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};

/** Abre a conversa da Ana pelo clique na linha (o WhatsApp falso não põe jid no data-id). */
function abrirConversaDaAna(op: OpcoesBuscaFalsa = {}): void {
  wa = montarWhatsAppComBusca([ANA], op);
  (document.querySelector('[data-nome="Ana Souza Cliente"]') as HTMLElement).click();
}

async function iniciar(): Promise<void> {
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });
}

beforeEach(() => {
  limparAvisos();
  esquecerTelefones();
  instalarChromeFalso();
  Object.assign(TEMPOS_DADOS, { abrir: 400, ler: 400 });
  Object.assign(TEMPOS_BUSCA, { minimo: 5, passo: 5, estaveis: 2, limite: 400 });
  crm = criarCrmFalso([]);
  const local = new RepositorioLocal();
  servico = new ServicoCrm(local, crm.transporte);
  repo = criarRepositorioCRM(local, servico);
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
  vi.unstubAllGlobals();
});

describe('telefone da conversa aberta (sem jid no data-id)', () => {
  it('sem nenhuma fonte, o telefone fica vazio', () => {
    abrirConversaDaAna();
    expect(telefoneDaConversaAberta('Ana Souza Cliente')).toBeNull();
  });

  it('(a) telefone memorizado quando a conversa foi aberta pelo telefone', async () => {
    wa = montarWhatsAppComBusca([ANA]);
    await abrirConversaPorTelefoneSemRecarregar('84 99999-0000');
    expect(wa.aberta()).toBe('Ana Souza Cliente');
    expect(telefoneDaConversaAberta('Ana Souza Cliente')).toBe('5584999990000');
  });

  it('(a) telefone memorizado ao abrir por lembrete/cliente do CRM (nome + telefone)', () => {
    abrirConversaDaAna();
    memorizarTelefone('Ana Souza Cliente', '(84) 99999-0000');
    expect(telefoneDaConversaAberta('Ana Souza Cliente')).toBe('5584999990000');
    expect(telefoneDaConversaAberta('Outra Pessoa')).toBeNull();
  });

  it('(b) índice local: contato da extensão que já tem telefone para esse nome', async () => {
    abrirConversaDaAna();
    await repo.adicionarNota({ nome: 'Ana Souza Cliente', telefone: '84999990000' }, 'Pediu tabela');
    await iniciar(); // lê o armazenamento para o estado do content script
    expect(telefoneDaConversaAberta('Ana Souza Cliente')).toBe('5584999990000');
  });
});

describe('Criar lead: lê o telefone dos Dados do contato', () => {
  it('abre o painel, lê o +55, fecha o painel e preenche o campo com o aviso "confira"', async () => {
    abrirConversaDaAna();
    await iniciar();
    await vi.waitFor(() => expect(faixa()?.textContent).toContain('Criar lead'));
    botao(faixa()!, 'Criar lead').click();
    const campos = (): NodeListOf<HTMLInputElement> => overlay().querySelectorAll<HTMLInputElement>('input');
    await vi.waitFor(() => expect(campos()[1].value).toBe('5584999990000'), { timeout: 2000 });
    expect(overlay().textContent).toContain('Telefone lido dos dados do contato — confira.');
    expect(wa.drawerAberto()).toBe(false); // fechou o painel
    expect(wa.eventos).toEqual(['abriu:Ana Souza Cliente', 'drawer:abriu', 'drawer:fechou']);
    expect(campos()[0].value).toBe('Ana Souza Cliente'); // o popover continuou aberto durante a leitura
    botao(overlay(), 'Criar lead').click();
    await vi.waitFor(() => expect(crm.tasks).toHaveLength(1));
    expect(crm.tasks[0]).toMatchObject({ title: 'Ana Souza Cliente', phone: '84999990000' });
  });

  it('painel em outro HTML (sem data-testid): acha pelo bloco ao lado da conversa que mostra "+55 ..."', async () => {
    abrirConversaDaAna({ painel: 'generico' });
    expect(await lerTelefoneDosDadosDoContato()).toBe('5584999990000');
    expect(wa.drawerAberto()).toBe(false);
  });

  it('o telefone lido fica memorizado para a próxima vez', async () => {
    abrirConversaDaAna();
    expect(await lerTelefoneDosDadosDoContato()).toBe('5584999990000');
    expect(telefoneDaConversaAberta('Ana Souza Cliente')).toBe('5584999990000');
  });

  it('painel já aberto pelo usuário: só lê e NÃO fecha', async () => {
    abrirConversaDaAna();
    (document.querySelector('#main header span[dir]') as HTMLElement).click(); // o usuário abriu
    expect(wa.drawerAberto()).toBe(true);
    expect(await lerTelefoneDosDadosDoContato()).toBe('5584999990000');
    expect(wa.drawerAberto()).toBe(true);
    expect(wa.eventos.filter((e) => e === 'drawer:abriu')).toHaveLength(1);
  });

  it('se não achar o número: campo vazio com dica, e o painel que abrimos é fechado', async () => {
    abrirConversaDaAna({ mostraTelefone: false });
    await iniciar();
    await vi.waitFor(() => expect(faixa()?.textContent).toContain('Criar lead'));
    botao(faixa()!, 'Criar lead').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Não consegui ler o telefone nos dados do contato. Digite com DDD.'), { timeout: 3000 });
    expect(overlay().querySelectorAll<HTMLInputElement>('input')[1].value).toBe('');
    expect(wa.drawerAberto()).toBe(false);
  });

  it('em grupo não abre nada', async () => {
    wa = montarWhatsAppComBusca([{ ...ANA, nome: 'Grupo Cliente', grupo: true }]);
    (document.querySelector('[data-nome="Grupo Cliente"]') as HTMLElement).click();
    expect(await lerTelefoneDosDadosDoContato()).toBeNull();
    expect(wa.eventos).toEqual(['abriu:Grupo Cliente']); // nem abriu o painel (ícone de grupo no cabeçalho)
  });

  it('grupo sem ícone no cabeçalho: se o painel for de grupo, o número de participante é descartado', async () => {
    wa = montarWhatsAppComBusca([{ ...ANA, nome: 'Compras Cliente', grupo: true }]);
    (document.querySelector('[data-nome="Compras Cliente"]') as HTMLElement).click();
    document.querySelector('#main header')!.querySelector('[data-icon]')?.remove();
    expect(await lerTelefoneDosDadosDoContato()).toBeNull();
    expect(wa.drawerAberto()).toBe(false);
    expect(telefoneDaConversaAberta('Compras Cliente')).toBeNull();
  });

  it('o usuário já digitou um telefone enquanto lia: não sobrescreve', async () => {
    abrirConversaDaAna();
    await iniciar();
    await vi.waitFor(() => expect(faixa()?.textContent).toContain('Criar lead'));
    botao(faixa()!, 'Criar lead').click();
    const tel = overlay().querySelectorAll<HTMLInputElement>('input')[1];
    tel.value = '84 91111-2222';
    await vi.waitFor(() => expect(wa.drawerAberto()).toBe(false), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(tel.value).toBe('84 91111-2222');
  });
});
