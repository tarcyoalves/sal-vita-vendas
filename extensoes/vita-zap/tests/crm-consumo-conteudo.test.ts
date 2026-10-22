// @vitest-environment jsdom
//
// Consumo do banco do CRM no WhatsApp Web: o ciclo de 30 s e o MutationObserver NUNCA fazem rede; o lead da
// conversa é pedido uma vez ao abrir (e o serviço ainda respeita o cache de 30 min). Relógio falso, CRM falso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsApp } from './ajuda/whatsapp-falso';

const AGORA = Date.UTC(2026, 9, 21, 15, 0);
const HORA = 3_600_000;

let ctrl: ControladorCrm | null = null;
let crm: CrmFalso;
let servico: ServicoCrm;

const agora = (): number => Date.now();
const textoFaixa = (): string => document.getElementById('vita-zap-lead')?.shadowRoot?.textContent ?? '';
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10)); // setTimeout real (só o setInterval e a data são falsos)
  expect(cond()).toBe(true);
};

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA, toFake: ['setInterval', 'clearInterval', 'Date'] });
  limparAvisos();
  instalarChromeFalso();
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Pediu tabela.', reminderDate: new Date(AGORA + 24 * HORA) })], agora);
  const local = new RepositorioLocal(agora);
  servico = new ServicoCrm(local, crm.transporte, agora);
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const repo = criarRepositorioCRM(local, servico, agora);
  montarWhatsApp([{ nome: 'Ana Souza Cliente', data: '11:40', previa: 'Quanto fica?' }], 'Ana Souza Cliente');
  (globalThis as { __repo?: unknown }).__repo = repo;
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('conteúdo da página: sem rede por timer nem por mutação do DOM', () => {
  it('8 horas com o ciclo de 30 s ligado e a página mudando: nenhuma chamada ao CRM além da abertura', async () => {
    await servico.definirUrl(BASE);
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
    ctrl = await iniciarCrm({ agora: () => new Date(agora()), repositorio: (globalThis as unknown as { __repo: never }).__repo }); // periódico padrão: 30 s
    await esperar(() => textoFaixa().includes('Lead: Padaria da Ana'));
    const aposAbrir = crm.requisicoes.length;
    expect(crm.chamadas('tasks.findForWhatsapp')).toHaveLength(1);

    for (let h = 0; h < 8; h++) {
      document.body.appendChild(document.createElement('div')).textContent = `mudança ${h}`; // o MutationObserver dispara o ciclo
      await vi.advanceTimersByTimeAsync(HORA); // 120 ciclos de 30 s por hora
      ctrl.ciclo();
    }
    expect(crm.requisicoes.length).toBe(aposAbrir);
    expect(textoFaixa()).toContain('Lead: Padaria da Ana'); // a faixa segue desenhada com o que está em memória
  }, 60_000);
});
