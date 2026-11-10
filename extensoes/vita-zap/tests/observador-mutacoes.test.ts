// @vitest-environment jsdom
//
// Mede o trabalho do MutationObserver do CRM no WhatsApp Web: o ruído da página (relógio e status das
// mensagens, mudanças dentro da própria UI da extensão) não pode mais disparar ciclos de leitura/desenho,
// e as mudanças que importam (lista, troca de conversa, cabeçalho, WhatsApp apagando nossa UI) continuam
// disparando.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { mutacaoRelevante } from '../src/content/mutacoes';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { htmlDaLinha, montarWhatsApp } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const LINHAS = [
  { nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica o saco?' },
  { nome: 'Bruno Lima', data: 'Ontem', previa: 'ok', minha: true },
];

let ctrl: ControladorCrm | null = null;

/** Espera o MutationObserver (microtarefa) e o debounce do ciclo. */
const esperar = (ms = 400) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  limparAvisos();
  instalarChromeFalso({ 'vz.config': { barraSuperior: false } });
  montarWhatsApp(LINHAS, 'Ana Souza');
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

function areaDeMensagens(): HTMLElement {
  const m = document.querySelector<HTMLElement>('#main [data-id]');
  if (!m) throw new Error('sem mensagem no #main');
  return m;
}

describe('observador de DOM do CRM', () => {
  it('ruído na área de mensagens e na nossa UI não gera ciclo (medição)', async () => {
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
    await esperar();

    const msg = areaDeMensagens();
    const relogio = document.createTextNode('12:00');
    msg.appendChild(relogio);
    await esperar();
    const antes = { ...ctrl.metricas };
    const nossa = document.querySelector<HTMLElement>('[data-vita-zap]');
    expect(nossa).not.toBeNull();
    for (let i = 0; i < 50; i++) {
      msg.setAttribute('class', `status-${i}`); // ícone de status/hover
      relogio.data = `12:${String(i).padStart(2, '0')}`; // relógio
      nossa!.setAttribute('class', `vz-${i}`); // mudança dentro da nossa UI
      await esperar(0);
    }
    await esperar();

    const lotes = ctrl.metricas.lotes - antes.lotes;
    const ignorados = ctrl.metricas.ignorados - antes.ignorados;
    expect(lotes).toBeGreaterThan(0);
    expect(ignorados).toBe(lotes); // todos descartados
    expect(ctrl.metricas.ciclos - antes.ciclos).toBe(0);
  });

  it('mudanças que importam continuam disparando o ciclo', async () => {
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
    await esperar();

    let c = ctrl.metricas.ciclos;
    document.getElementById('lista')!.insertAdjacentHTML('beforeend', htmlDaLinha({ nome: 'Carla Dias', data: '10:05', previa: 'oi' }, 144));
    await esperar();
    expect(ctrl.metricas.ciclos).toBeGreaterThan(c);

    c = ctrl.metricas.ciclos;
    document.querySelector('#main header span')!.textContent = 'Bruno Lima'; // troca de conversa
    await esperar();
    expect(ctrl.metricas.ciclos).toBeGreaterThan(c);

    c = ctrl.metricas.ciclos;
    document.getElementById('main')!.insertAdjacentHTML('beforeend', '<div data-id="nova"></div>'); // mensagem nova
    await esperar();
    expect(ctrl.metricas.ciclos).toBeGreaterThan(c);

    c = ctrl.metricas.ciclos;
    document.querySelector('[data-vita-zap]')!.remove(); // o WhatsApp apagou a nossa barra
    await esperar();
    expect(ctrl.metricas.ciclos).toBeGreaterThan(c);
    expect(document.querySelector('[data-vita-zap]')).not.toBeNull(); // e ela volta
  });

  it('aba escondida (janela coberta) CONTINUA atualizando: o envio automático roda assim', async () => {
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
    await esperar();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      const c = ctrl.metricas.ciclos;
      document.getElementById('lista')!.insertAdjacentHTML('beforeend', htmlDaLinha({ nome: 'Dora', data: '10:05', previa: 'oi' }, 144));
      await esperar();
      expect(ctrl.metricas.ciclos).toBeGreaterThan(c);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it('regra pura: atributo no cabeçalho, rodapé e lista é relevante; na área de mensagens não', () => {
    const reg = (target: Node, type: MutationRecordType = 'attributes') =>
      ({ type, target, addedNodes: [] as unknown as NodeList, removedNodes: [] as unknown as NodeList }) as unknown as MutationRecord;
    expect(mutacaoRelevante(reg(document.querySelector('#main header span')!))).toBe(true);
    expect(mutacaoRelevante(reg(document.querySelector('#main footer [role="textbox"]')!))).toBe(true);
    expect(mutacaoRelevante(reg(document.getElementById('pane-side')!))).toBe(true);
    expect(mutacaoRelevante(reg(document.body))).toBe(true); // tema
    expect(mutacaoRelevante(reg(areaDeMensagens()))).toBe(false);
    expect(mutacaoRelevante(reg(areaDeMensagens(), 'childList'))).toBe(true);
  });
});
