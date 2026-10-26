// Agenda de lembretes (lógica pura) e o service worker (alarmes, notificação, selo) com chrome falso.

import { beforeEach, describe, expect, it } from 'vitest';
import { aoAlarme, aoClicarNotificacao, atualizarSelo, sincronizar } from '../src/background/lembretes';
import {
  adiarLembrete,
  agendaDeAlarmes,
  agruparLembretes,
  contarVencidos,
  criarLembrete,
  formatarVencimento,
  idDoAlarme,
  instanteNoFuso,
  lembretesParaAvisar,
  lerDataHoraLocal,
  paraInputDataHora,
  prazoRapido,
  situacaoDoLembrete,
} from '../src/shared/crm-lembretes';
import { CHAVE_ACAO_PENDENTE } from '../src/shared/crm-store';
import type { Lembrete } from '../src/shared/crm-tipos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';

// 2026-10-21 12:00 em Fortaleza (UTC-3), quarta-feira.
const AGORA = new Date('2026-10-21T15:00:00Z');
const hora = (iso: string, h: number, m = 0) => instanteNoFuso(iso, h, m);

function lembrete(p: Partial<Lembrete> & { id: string }): Lembrete {
  return { contatoId: 'id-ana', nome: 'Ana Souza', venceEm: hora('2026-10-22', 9), criadoEm: AGORA.getTime(), status: 'pendente', ...p };
}

describe('prazos rápidos e data personalizada', () => {
  it('amanhã 9h, 3 dias, 1 semana, 30 dias, 45 dias e 60 dias (sempre às 9h de Fortaleza)', () => {
    expect(prazoRapido('amanha9h', AGORA)).toBe(Date.parse('2026-10-22T12:00:00Z'));
    expect(prazoRapido('3dias', AGORA)).toBe(Date.parse('2026-10-24T12:00:00Z'));
    expect(prazoRapido('1semana', AGORA)).toBe(Date.parse('2026-10-28T12:00:00Z'));
    // AGORA = 2026-10-21 (Fortaleza). +30d = 2026-11-20T12:00:00Z
    expect(prazoRapido('30dias', AGORA)).toBe(Date.parse('2026-11-20T12:00:00Z'));
    // +45d = 2026-12-05T12:00:00Z
    expect(prazoRapido('45dias', AGORA)).toBe(Date.parse('2026-12-05T12:00:00Z'));
    // +60d = 2026-12-20T12:00:00Z
    expect(prazoRapido('60dias', AGORA)).toBe(Date.parse('2026-12-20T12:00:00Z'));
  });

  it('"amanhã" vale pelo dia de Fortaleza, mesmo perto da meia-noite UTC', () => {
    const tarde = new Date('2026-10-21T23:30:00Z'); // 20:30 em Fortaleza, ainda dia 21
    expect(prazoRapido('amanha9h', tarde)).toBe(Date.parse('2026-10-22T12:00:00Z'));
    const madrugadaUtc = new Date('2026-10-22T01:00:00Z'); // 22:00 de 21/10 em Fortaleza
    expect(prazoRapido('amanha9h', madrugadaUtc)).toBe(Date.parse('2026-10-22T12:00:00Z'));
  });

  it('lê o valor do campo datetime-local no fuso de Fortaleza e devolve o mesmo valor', () => {
    const t = lerDataHoraLocal('2026-10-23T14:30');
    expect(t).toBe(Date.parse('2026-10-23T17:30:00Z'));
    expect(paraInputDataHora(t as number)).toBe('2026-10-23T14:30');
    expect(lerDataHoraLocal('')).toBeNull();
    expect(lerDataHoraLocal('2026-02-30T10:00')).toBeNull();
    expect(lerDataHoraLocal('2026-10-23T25:00')).toBeNull();
  });
});

describe('criar lembrete', () => {
  it('recusa horário que já passou e data não escolhida', () => {
    expect(criarLembrete({ contatoId: 'id-ana', nome: 'Ana', venceEm: AGORA.getTime() - 1000 }, AGORA, 'x')).toEqual({ ok: false, erro: 'Esse horário já passou. Escolha uma data futura.' });
    expect(criarLembrete({ contatoId: 'id-ana', nome: 'Ana', venceEm: null }, AGORA, 'x')).toMatchObject({ ok: false });
  });

  it('cria pendente, com rascunho aparado (ou sem rascunho)', () => {
    const r = criarLembrete({ contatoId: 'id-ana', nome: 'Ana', venceEm: AGORA.getTime() + 3_600_000, rascunho: '  Oi, Ana!  ' }, AGORA, 'id1');
    expect(r.ok && r.lembrete).toMatchObject({ id: 'id1', status: 'pendente', rascunho: 'Oi, Ana!' });
    const vazio = criarLembrete({ contatoId: 'id-ana', nome: 'Ana', venceEm: AGORA.getTime() + 3_600_000, rascunho: '   ' }, AGORA, 'id2');
    expect(vazio.ok && 'rascunho' in vazio.lembrete).toBe(false);
  });
});

describe('central: Vencidos / Hoje / Próximos', () => {
  const lista = [
    lembrete({ id: 'prox', venceEm: hora('2026-10-25', 9) }),
    lembrete({ id: 'hoje', venceEm: hora('2026-10-21', 17) }),
    lembrete({ id: 'venc', venceEm: hora('2026-10-20', 9), status: 'disparado' }),
    lembrete({ id: 'feito', venceEm: hora('2026-10-19', 9), status: 'concluido' }),
    lembrete({ id: 'venc2', venceEm: hora('2026-10-21', 8) }),
  ];

  it('agrupa e ordena por vencimento, sem os concluídos', () => {
    const g = agruparLembretes(lista, AGORA);
    expect(g.vencidos.map((l) => l.id)).toEqual(['venc', 'venc2']);
    expect(g.hoje.map((l) => l.id)).toEqual(['hoje']);
    expect(g.proximos.map((l) => l.id)).toEqual(['prox']);
  });

  it('situação: vencido, hoje, próximo', () => {
    expect(situacaoDoLembrete(lista[0], AGORA)).toBe('proximo');
    expect(situacaoDoLembrete(lista[1], AGORA)).toBe('hoje');
    expect(situacaoDoLembrete(lista[2], AGORA)).toBe('vencido');
  });

  it('conta vencidos (o selo do ícone)', () => {
    expect(contarVencidos(lista, AGORA)).toBe(2);
    expect(contarVencidos([], AGORA)).toBe(0);
  });

  it('adiar volta a pendente no novo horário e nunca para o passado', () => {
    const l = lembrete({ id: 'a', status: 'disparado', disparadoEm: 1, venceEm: hora('2026-10-20', 9) });
    const adiado = adiarLembrete(l, hora('2026-10-22', 9), AGORA);
    expect(adiado).toMatchObject({ status: 'pendente', venceEm: hora('2026-10-22', 9) });
    expect('disparadoEm' in adiado).toBe(false);
    expect(adiarLembrete(l, 0, AGORA).venceEm).toBeGreaterThan(AGORA.getTime());
  });

  it('formata o vencimento', () => {
    expect(formatarVencimento(hora('2026-10-21', 17, 5), AGORA)).toBe('hoje 17:05');
    expect(formatarVencimento(hora('2026-10-22', 9), AGORA)).toBe('amanhã 09:00');
    expect(formatarVencimento(hora('2026-10-20', 9), AGORA)).toBe('ontem 09:00');
    expect(formatarVencimento(hora('2026-10-24', 9), AGORA)).toBe('sáb 24/10 09:00');
  });
});

describe('agenda de alarmes', () => {
  it('um alarme por lembrete pendente; atrasado dispara já; disparado/concluído não têm alarme', () => {
    const lista = [
      lembrete({ id: 'futuro', venceEm: hora('2026-10-22', 9) }),
      lembrete({ id: 'atrasado', venceEm: hora('2026-10-20', 9) }),
      lembrete({ id: 'disparado', status: 'disparado' }),
      lembrete({ id: 'feito', status: 'concluido' }),
    ];
    expect(agendaDeAlarmes(lista, AGORA)).toEqual([
      { nome: 'vz:futuro', quando: hora('2026-10-22', 9) },
      { nome: 'vz:atrasado', quando: AGORA.getTime() + 2000 },
    ]);
    expect(lembretesParaAvisar(lista, AGORA).map((l) => l.id)).toEqual(['atrasado']);
    expect(idDoAlarme('vz:abc')).toBe('abc');
    expect(idDoAlarme('outro')).toBeNull();
  });
});

describe('service worker: alarmes, notificação e selo (chrome falso)', () => {
  let c: ChromeFalso;
  const guardar = (lista: Lembrete[]) => c.dados.set('vz.lembretes', lista);

  beforeEach(() => {
    c = instalarChromeFalso();
  });

  it('sincronizar cria os alarmes que faltam e remove os que sobram', async () => {
    guardar([lembrete({ id: 'a' }), lembrete({ id: 'b', status: 'concluido' })]);
    c.alarmes.set('vz:velho', { name: 'vz:velho', scheduledTime: 1 });
    c.alarmes.set('outro-alarme', { name: 'outro-alarme', scheduledTime: 1 });
    await sincronizar(AGORA);
    expect([...c.alarmes.keys()].sort()).toEqual(['outro-alarme', 'vz:a']);
    expect(c.alarmes.get('vz:a')?.scheduledTime).toBe(hora('2026-10-22', 9));
    // chamar de novo não muda nada
    await sincronizar(AGORA);
    expect(c.alarmes.size).toBe(2);
  });

  it('selo no ícone: número de vencidos, vazio quando não há', async () => {
    guardar([lembrete({ id: 'a', venceEm: hora('2026-10-20', 9) }), lembrete({ id: 'b', venceEm: hora('2026-10-21', 8), status: 'disparado' }), lembrete({ id: 'c' })]);
    await atualizarSelo(AGORA);
    expect(c.selo).toEqual({ texto: '2', cor: '#d93025' });
    guardar([lembrete({ id: 'c' })]);
    await atualizarSelo(AGORA);
    expect(c.selo.texto).toBe('');
  });

  it('alarme dispara: marca como disparado, mostra notificação com o rascunho e atualiza o selo', async () => {
    guardar([lembrete({ id: 'a', venceEm: hora('2026-10-21', 11, 59), rascunho: 'Oi Ana, conseguiu ver o orçamento?' })]);
    await aoAlarme('vz:a', AGORA);
    const lista = c.dados.get('vz.lembretes') as Lembrete[];
    expect(lista[0]).toMatchObject({ status: 'disparado', disparadoEm: AGORA.getTime() });
    const n = c.notificacoes.get('vz-a');
    expect(n).toMatchObject({ title: 'Lembrete: Ana Souza', requireInteraction: true });
    expect(String(n?.message)).toContain('conseguiu ver o orçamento');
    expect(c.selo.texto).toBe('1');
    // um segundo disparo do mesmo alarme não repete a notificação
    c.notificacoes.clear();
    await aoAlarme('vz:a', AGORA);
    expect(c.notificacoes.size).toBe(0);
  });

  it('alarme de lembrete que não existe mais é ignorado', async () => {
    guardar([]);
    await aoAlarme('vz:fantasma', AGORA);
    await aoAlarme('nao-e-nosso', AGORA);
    expect(c.notificacoes.size).toBe(0);
  });

  it('clique na notificação: grava o pedido (abrir + colar rascunho) e leva ao WhatsApp Web', async () => {
    guardar([lembrete({ id: 'a', rascunho: 'Oi Ana!' })]);
    c.abas.push({ id: 7, windowId: 1, active: false, url: 'https://web.whatsapp.com/' });
    c.notificacoes.set('vz-a', {});
    await aoClicarNotificacao('vz-a');
    expect(c.dados.get(CHAVE_ACAO_PENDENTE)).toMatchObject({ tipo: 'abrirConversa', nome: 'Ana Souza', rascunho: 'Oi Ana!', lembreteId: 'a' });
    expect(c.abasAtivadas).toEqual([7]);
    expect(c.notificacoes.has('vz-a')).toBe(false);
  });

  it('clique na notificação sem WhatsApp Web aberto: abre uma aba nova', async () => {
    guardar([lembrete({ id: 'a' })]);
    await aoClicarNotificacao('vz-a');
    expect(c.abasCriadas).toEqual(['https://web.whatsapp.com/']);
  });
});
