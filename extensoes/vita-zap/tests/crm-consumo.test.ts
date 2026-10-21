// Consumo do banco do CRM ("consulta só por uso, com teto"). O CRM roda num Neon grátis: o compute suspende
// depois de ~5 min sem consultas e as horas por mês são limitadas. Aqui o relógio é falso (vi.useFakeTimers),
// o `fetch` é o CRM falso (que registra toda requisição) e o chrome é falso: sem rede e sem conta reais.
//
// Regras testadas: nenhuma consulta periódica; lembretes só por uso e no máximo 1 por hora (exceto login e
// "Atualizar do CRM"); lead da conversa só ao abrir e com cache de 30 min; fila offline só reenvia por ação do
// usuário; as notificações saem por alarmes locais criados a partir do cache.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm } from '../src/background/crm-sync';
import { sincronizar, usarRepositorio } from '../src/background/lembretes';
import { PREFIXO_ALARME, textoAtualizadoHa } from '../src/shared/crm-lembretes';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

const AGORA = Date.UTC(2026, 9, 21, 17, 30); // 21/10/2026 14:30 em Fortaleza
const MIN = 60_000;
const HORA = 60 * MIN;
const ANA = { nome: 'Ana Souza', telefone: '5584999990000' };

let c: ChromeFalso;
let crm: CrmFalso;
let local: RepositorioLocal;
let servico: ServicoCrm;

const agora = (): number => Date.now();
const lembretes = (): number => crm.chamadas('tasks.reminders').length;
const leadsConsultados = (): number => crm.chamadas('tasks.findForWhatsapp').length + crm.chamadas('tasks.getById').length;

async function entrar(): Promise<void> {
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
}

/** O service worker acordou de novo (módulo recarregado): serviço novo, mesmo storage. */
function acordar(): ServicoCrm {
  return iniciarCrm(local, () => undefined);
}

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA });
  c = instalarChromeFalso();
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Pediu tabela.', reminderDate: new Date(AGORA + HORA) })], agora);
  vi.stubGlobal('fetch', crm.fetch);
  local = new RepositorioLocal(agora);
  servico = new ServicoCrm(local, crm.transporte, agora);
  usarRepositorio(criarRepositorioCRM(local, servico, agora));
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('nenhuma consulta periódica', () => {
  it('8 horas sem ação do usuário (com o service worker ligado): zero chamadas de rede e nenhum alarme de sincronização', async () => {
    await entrar();
    acordar();
    await sincronizar(new Date(agora())); // alarmes locais, a partir do cache
    const antes = crm.requisicoes.length;
    await vi.advanceTimersByTimeAsync(8 * HORA);
    expect(crm.requisicoes.length).toBe(antes);
    expect([...c.alarmes.keys()].filter((n) => !n.startsWith(PREFIXO_ALARME))).toEqual([]);
  });

  it('o service worker acordando 50 vezes em 10 minutos faz no máximo 1 busca de lembretes', async () => {
    await entrar();
    await vi.advanceTimersByTimeAsync(2 * HORA); // o mínimo de 60 min já passou: a 1ª abertura pode buscar
    const antes = lembretes();
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(12_000);
      const sw = acordar();
      await sw.sincronizarLembretes('aba-whatsapp'); // o WhatsApp Web recarregado/aberto
      await sw.sincronizarLembretes('painel'); // painel lateral aberto
    }
    expect(lembretes() - antes).toBe(1);
  });

  it('acordar sozinho (sem pedido do usuário) não faz nenhuma busca, mesmo depois de horas', async () => {
    await entrar();
    await vi.advanceTimersByTimeAsync(5 * HORA);
    const antes = crm.requisicoes.length;
    for (let i = 0; i < 20; i++) acordar();
    expect(crm.requisicoes.length).toBe(antes);
  });
});

describe('lembretes: só por uso, com teto', () => {
  it('painel e aba do WhatsApp respeitam o mínimo de 60 min; o botão Atualizar do CRM e o login ignoram', async () => {
    await entrar(); // login: busca (ignora o mínimo)
    expect(lembretes()).toBe(1);
    await servico.sincronizarLembretes('painel');
    await servico.sincronizarLembretes('aba-whatsapp');
    expect(lembretes()).toBe(1);
    await servico.sincronizarLembretes('botao'); // ignora o mínimo
    expect(lembretes()).toBe(2);
    await vi.advanceTimersByTimeAsync(59 * MIN);
    await servico.sincronizarLembretes('painel');
    expect(lembretes()).toBe(2);
    await vi.advanceTimersByTimeAsync(2 * MIN); // 61 min desde a última busca bem-sucedida
    await servico.sincronizarLembretes('aba-whatsapp');
    expect(lembretes()).toBe(3);
    await servico.sincronizarLembretes('painel');
    expect(lembretes()).toBe(3);
  });

  it('busca que falhou (sem rede) não conta: a próxima abertura tenta de novo', async () => {
    await entrar();
    await vi.advanceTimersByTimeAsync(2 * HORA);
    crm.semRede = true;
    expect(await servico.sincronizarLembretes('painel')).toMatchObject({ ok: false });
    crm.semRede = false;
    const antes = lembretes();
    await servico.sincronizarLembretes('painel');
    expect(lembretes() - antes).toBe(1);
  });

  it('sem login não consulta nada, em nenhum motivo', async () => {
    for (const m of ['painel', 'aba-whatsapp', 'botao', 'login'] as const) expect(await servico.sincronizarLembretes(m)).toEqual({ ok: true, quantidade: 0 });
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('as notificações continuam saindo por alarmes locais criados a partir do cache, sem ir ao servidor', async () => {
    await entrar();
    const antes = crm.requisicoes.length;
    await vi.advanceTimersByTimeAsync(10 * MIN);
    await sincronizar(new Date(agora())); // o que o service worker faz ao acordar e a cada mudança do cache
    const alarmes = [...c.alarmes.values()].filter((a) => a.name.startsWith(PREFIXO_ALARME));
    expect(alarmes).toHaveLength(1);
    expect(alarmes[0].scheduledTime).toBe(AGORA + HORA);
    // o service worker dorme e acorda: os alarmes continuam, e nada vai ao CRM
    acordar();
    await sincronizar(new Date(agora()));
    expect([...c.alarmes.values()].filter((a) => a.name.startsWith(PREFIXO_ALARME))).toHaveLength(1);
    expect(crm.requisicoes.length).toBe(antes);
  });

  it('"atualizado há X min" vem da última busca bem-sucedida', async () => {
    await entrar();
    await vi.advanceTimersByTimeAsync(7 * MIN);
    expect(textoAtualizadoHa((await servico.conta()).sincronizadoEm, agora())).toBe('atualizado há 7 min');
    expect(textoAtualizadoHa(null, agora())).toBe('ainda não atualizado');
    expect(textoAtualizadoHa(agora() - 30_000, agora())).toBe('atualizado agora há pouco');
    expect(textoAtualizadoHa(agora() - 3 * HORA, agora())).toBe('atualizado há 3 h');
  });
});

describe('lead da conversa: só ao abrir, com cache de 30 min', () => {
  it('abrir a mesma conversa 10 vezes em 20 minutos faz 1 busca; depois de 31 minutos, mais 1', async () => {
    await entrar();
    for (let i = 0; i < 10; i++) {
      expect(await servico.leadDoContato(ANA)).toMatchObject({ tipo: 'lead', lead: { id: 1 } });
      if (i < 9) await vi.advanceTimersByTimeAsync(2 * MIN);
    }
    expect(leadsConsultados()).toBe(1); // 10 aberturas (0 a 18 min), 1 consulta
    await vi.advanceTimersByTimeAsync(13 * MIN); // 31 min desde a primeira
    await servico.leadDoContato(ANA);
    expect(leadsConsultados()).toBe(2);
    await servico.leadDoContato(ANA);
    expect(leadsConsultados()).toBe(2);
  });

  it('contato sem lead no CRM também não é consultado de novo dentro de 30 min', async () => {
    await entrar();
    const sem = { nome: 'Fulano', telefone: '5584911112222' };
    for (let i = 0; i < 5; i++) {
      expect(await servico.leadDoContato(sem)).toEqual({ tipo: 'nao-encontrado', semTelefone: false });
      await vi.advanceTimersByTimeAsync(3 * MIN);
    }
    expect(crm.chamadas('tasks.findForWhatsapp')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    await servico.leadDoContato(sem);
    expect(crm.chamadas('tasks.findForWhatsapp')).toHaveLength(2);
  });

  it('ação do usuário atualiza o cache com a resposta da própria mutation: sem nova leitura ao reabrir', async () => {
    await entrar();
    await servico.leadDoContato(ANA);
    const r = await servico.registrarContatoNoLead(ANA, 'Fechou 20 sacos');
    expect(r).toMatchObject({ ok: true, pendente: false });
    const antes = crm.requisicoes.length;
    const aberta = await servico.leadDoContato(ANA);
    expect(aberta).toMatchObject({ tipo: 'lead', lead: { contatos: 1 } });
    if (aberta.tipo === 'lead') expect(aberta.lead.notas).toContain('Fechou 20 sacos');
    expect(crm.requisicoes.length).toBe(antes);
  });
});

describe('fila offline: só reenvia por ação do usuário', () => {
  it('sem timer: 8 horas depois a fila continua esperando; o botão Atualizar do CRM a reenvia', async () => {
    await entrar();
    await servico.leadDoContato(ANA);
    crm.semRede = true;
    expect(await servico.registrarContatoNoLead(ANA, 'Pediu desconto')).toMatchObject({ ok: true, pendente: true });
    crm.semRede = false; // a rede voltou, mas ninguém usou a extensão
    const antes = crm.requisicoes.length;
    await vi.advanceTimersByTimeAsync(8 * HORA);
    acordar();
    expect(crm.requisicoes.length).toBe(antes);
    expect((await servico.conta()).pendentes).toBe(1);
    await servico.sincronizarLembretes('botao');
    expect((await servico.conta()).pendentes).toBe(0);
    expect(crm.tasks[0].notes).toContain('Pediu desconto');
  });

  it('abrir o painel ou o WhatsApp Web (busca automática) não reenvia a fila', async () => {
    await entrar();
    await servico.leadDoContato(ANA);
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'Pediu desconto');
    crm.semRede = false;
    await vi.advanceTimersByTimeAsync(2 * HORA);
    await servico.sincronizarLembretes('painel');
    expect((await servico.conta()).pendentes).toBe(1);
  });
});

describe('auditoria', () => {
  it('cada chamada ao CRM é registrada em console.debug com o motivo', async () => {
    const debug = vi.mocked(console.debug);
    await entrar();
    await servico.leadDoContato(ANA);
    await servico.sincronizarLembretes('botao');
    const linhas = debug.mock.calls.map((a) => String(a[0]));
    expect(linhas.some((l) => l.includes('auth.login') && l.includes('motivo: login'))).toBe(true);
    expect(linhas.some((l) => l.includes('tasks.findForWhatsapp') && l.includes('motivo: abrir conversa'))).toBe(true);
    expect(linhas.some((l) => l.includes('tasks.reminders') && l.includes('Atualizar do CRM'))).toBe(true);
    // 1 linha de log por requisição feita (as sem consulta têm texto próprio)
    expect(linhas.filter((l) => /CRM (consulta|alteração) /.test(l))).toHaveLength(crm.requisicoes.length);
  });
});
