// RepositorioCRM (modo misto) + service worker: lembretes do CRM na central e nos alarmes, notificação
// sem duplicar (mesmo id e horário), clique que abre a conversa pelo telefone, e a ponte por mensagem.
// `fetch` falso (tests/ajuda/crm-falso.ts) e chrome falso: sem rede, sem conta real.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALARME_SYNC_ANTIGO, iniciarCrm, limparAlarmeSyncAntigo } from '../src/background/crm-sync';
import { aoAlarme, aoClicarNotificacao, sincronizar, usarRepositorio } from '../src/background/lembretes';
import { urlDaConversaPorTelefone } from '../src/shared/crm-acoes';
import { agruparLembretes, contarVencidos } from '../src/shared/crm-lembretes';
import { ehLembreteCrm, idLembreteCrm } from '../src/shared/crm-remoto';
import { atenderMensagensCrm, criarProxyLeads, type RespostaMensagemCrm } from '../src/shared/crm-transporte';
import { METODOS_LEADS } from '../src/shared/leads';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { criarRepositorioCRM, type RepositorioComCrm } from '../src/shared/repositorio-crm';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

const AGORA = Date.UTC(2026, 9, 21, 17, 30); // 21/10/2026 14:30 em Fortaleza
const HORA = 3_600_000;

let c: ChromeFalso;
let crm: CrmFalso;
let local: RepositorioLocal;
let servico: ServicoCrm;
let repo: RepositorioComCrm;
let agora = AGORA;
const data = () => new Date(agora);

async function entrar(): Promise<void> {
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
}

beforeEach(() => {
  agora = AGORA;
  c = instalarChromeFalso();
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', reminderDate: new Date(AGORA + HORA) })], () => agora);
  local = new RepositorioLocal(() => agora);
  servico = new ServicoCrm(local, crm.transporte, () => agora);
  repo = criarRepositorioCRM(local, servico, () => agora);
  usarRepositorio(repo);
});

describe('modo misto', () => {
  it('sem login tudo continua local: nenhuma requisição e os lembretes são só os locais', async () => {
    await repo.criarLembrete({ ref: { nome: 'Ana Souza' }, venceEm: AGORA + 2 * HORA }, data());
    const lista = await repo.listarLembretes();
    expect(lista).toHaveLength(1);
    expect(ehLembreteCrm(lista[0].id)).toBe(false);
    expect((await repo.carregar()).lembretes).toHaveLength(1);
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('com login a central e o selo juntam os lembretes locais e os do CRM', async () => {
    await repo.criarLembrete({ ref: { nome: 'Ana Souza' }, venceEm: AGORA + 2 * HORA }, data());
    await entrar();
    const lista = await repo.listarLembretes();
    expect(lista.map((l) => l.nome).sort()).toEqual(['Ana Souza', 'Padaria da Ana']);
    const doCrm = lista.find((l) => ehLembreteCrm(l.id))!;
    expect(doCrm).toMatchObject({ id: idLembreteCrm(1, AGORA + HORA), telefone: '5584999990000', status: 'pendente', venceEm: AGORA + HORA });
    expect(agruparLembretes((await repo.carregar()).lembretes, data()).hoje).toHaveLength(2);
    // sair: voltam só os locais
    await servico.sair();
    expect((await repo.listarLembretes()).map((l) => l.nome)).toEqual(['Ana Souza']);
  });

  it('os métodos que o RepositorioCRM não define caem no RepositorioLocal; os de lead vão ao serviço', async () => {
    const contato = await repo.registrarContato({ nome: 'Beto', telefone: '84 98888-7777' });
    expect(contato.telefone).toBe('5584988887777');
    expect((await local.listarContatos()).map((x) => x.nome)).toEqual(['Beto']);
    expect(await repo.leadDoContato({ nome: 'Beto' })).toEqual({ tipo: 'sem-login' });
    for (const m of METODOS_LEADS) expect(typeof repo[m]).toBe('function');
  });

  it('mudança nas chaves do CRM acorda quem lista lembretes (aoMudar)', async () => {
    const eventos: string[][] = [];
    const parar = repo.aoMudar((e) => eventos.push(e.colecoes));
    await entrar();
    parar();
    expect(eventos.some((cols) => cols.includes('lembretes'))).toBe(true);
  });
});

describe('alarmes e notificações dos lembretes do CRM', () => {
  it('agenda um alarme por lembrete do CRM e notifica UMA vez (mesmo id e horário), mesmo sincronizando de novo', async () => {
    await entrar();
    await sincronizar(data());
    const id = idLembreteCrm(1, AGORA + HORA);
    expect(c.alarmes.has(`vz:${id}`)).toBe(true);

    agora = AGORA + HORA;
    await aoAlarme(`vz:${id}`, data());
    expect(c.notificacoes.size).toBe(1);
    expect(c.notificacoes.get(`vz-${id}`)).toMatchObject({ title: 'Lembrete: Padaria da Ana' });
    expect((await repo.listarLembretes()).find((l) => l.id === id)?.status).toBe('disparado');

    // o alarme dispara de novo e o CRM é consultado de novo (5 min): nada de segunda notificação
    c.notificacoes.clear();
    await aoAlarme(`vz:${id}`, data());
    await servico.sincronizarLembretes();
    await aoAlarme(`vz:${id}`, data());
    expect(c.notificacoes.size).toBe(0);
    await sincronizar(data());
    expect(c.alarmes.has(`vz:${id}`)).toBe(false); // já avisado: sem alarme pendente
  });

  it('se o horário muda no CRM, é outro lembrete e avisa de novo', async () => {
    await entrar();
    const antigo = idLembreteCrm(1, AGORA + HORA);
    agora = AGORA + HORA;
    await aoAlarme(`vz:${antigo}`, data());
    expect(c.notificacoes.size).toBe(1);

    crm.tasks[0].reminderDate = new Date(AGORA + 3 * HORA);
    await servico.sincronizarLembretes();
    await sincronizar(data());
    const novo = idLembreteCrm(1, AGORA + 3 * HORA);
    expect(c.alarmes.has(`vz:${novo}`)).toBe(true);
    expect(c.alarmes.has(`vz:${antigo}`)).toBe(false);
    agora = AGORA + 3 * HORA;
    await aoAlarme(`vz:${novo}`, data());
    expect(c.notificacoes.size).toBe(2);
  });

  it('lembrete que JÁ estava vencido há tempo ao entrar aparece como vencido, sem notificação em massa', async () => {
    crm.tasks.push(task({ id: 5, title: 'Velho', phone: '84911112222', reminderDate: new Date(AGORA - 5 * HORA) }), task({ id: 6, title: 'Recém vencido', phone: '84933334444', reminderDate: new Date(AGORA - 5 * 60_000) }));
    await entrar();
    await sincronizar(data());
    const lista = await repo.listarLembretes();
    expect(lista.find((l) => l.nome === 'Velho')?.status).toBe('disparado'); // visto, sem avisar
    expect(lista.find((l) => l.nome === 'Recém vencido')?.status).toBe('pendente'); // dentro da tolerância: avisa
    expect(c.alarmes.has(`vz:${idLembreteCrm(5, AGORA - 5 * HORA)}`)).toBe(false);
    expect(c.alarmes.has(`vz:${idLembreteCrm(6, AGORA - 5 * 60_000)}`)).toBe(true);
    expect(contarVencidos(lista, data())).toBe(2); // o selo conta os dois
    expect(c.selo.texto).toBe('2');
  });

  it('concluir/excluir um lembrete do CRM só o esconde aqui: o CRM não é alterado', async () => {
    await entrar();
    const id = idLembreteCrm(1, AGORA + HORA);
    const antes = crm.requisicoes.length;
    await repo.atualizarLembrete(id, { status: 'concluido' });
    expect((await repo.listarLembretes()).find((l) => l.id === id)?.status).toBe('concluido');
    expect(agruparLembretes(await repo.listarLembretes(), data()).hoje).toHaveLength(0);
    await servico.sincronizarLembretes(); // o próximo ciclo de 5 min não o traz de volta
    expect((await repo.listarLembretes()).find((l) => l.id === id)?.status).toBe('concluido');
    expect(crm.requisicoes.slice(antes).some((r) => r.url.pathname.endsWith('tasks.update'))).toBe(false);
    await repo.excluirLembrete(id);
    expect((await repo.listarLembretes()).find((l) => l.id === id)?.status).toBe('concluido');
  });

  it('adiar um lembrete do CRM (central) muda a data no CRM', async () => {
    await entrar();
    const id = idLembreteCrm(1, AGORA + HORA);
    await repo.adiarLembrete(id, AGORA + 20 * HORA, data());
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(AGORA + 20 * HORA);
    const lista = await repo.listarLembretes();
    expect(lista.find((l) => l.id === idLembreteCrm(1, AGORA + 20 * HORA))?.status).toBe('pendente');
    expect(lista.find((l) => l.id === id)).toBeUndefined(); // o horário antigo sai da central
  });
});

describe('clique na notificação: abre a conversa pelo telefone, não envia nada', () => {
  it('a URL é /send?phone=<dígitos> sem texto e só para número plausível', () => {
    expect(urlDaConversaPorTelefone('+55 (84) 99999-0000')).toBe('https://web.whatsapp.com/send?phone=5584999990000');
    expect(urlDaConversaPorTelefone('123')).toBeNull();
    expect(urlDaConversaPorTelefone('5584999990000')).not.toContain('text=');
  });

  it('lembrete do CRM com telefone: leva a aba do WhatsApp Web ao endereço do número', async () => {
    await entrar();
    const id = idLembreteCrm(1, AGORA + HORA);
    const atualizacoes: Array<{ id: number; props: Record<string, unknown> }> = [];
    (c.chrome as { tabs: { update: unknown } }).tabs.update = async (tabId: number, props: Record<string, unknown>) => {
      atualizacoes.push({ id: tabId, props });
    };
    c.abas.push({ id: 7, windowId: 1, active: true, url: 'https://web.whatsapp.com/' });
    c.notificacoes.set(`vz-${id}`, {});
    await aoClicarNotificacao(`vz-${id}`);
    expect(atualizacoes).toEqual([{ id: 7, props: { url: 'https://web.whatsapp.com/send?phone=5584999990000', active: true } }]);
    expect(c.notificacoes.has(`vz-${id}`)).toBe(false);
  });

  it('sem aba do WhatsApp aberta, abre uma nova no endereço do número', async () => {
    await entrar();
    const id = idLembreteCrm(1, AGORA + HORA);
    await aoClicarNotificacao(`vz-${id}`);
    expect(c.abasCriadas).toEqual(['https://web.whatsapp.com/send?phone=5584999990000']);
  });
});

describe('sem alarme de sincronização e mensagens do service worker', () => {
  it('limpa o alarme periódico antigo (vzcrm-sync) e o service worker não consulta o CRM ao iniciar', async () => {
    const limpos: string[] = [];
    (c.chrome as { alarms: Record<string, unknown> }).alarms = {
      async clear(n: string) {
        limpos.push(n);
        return true;
      },
    };
    await limparAlarmeSyncAntigo();
    expect(limpos).toEqual([ALARME_SYNC_ANTIGO]);
    expect(ALARME_SYNC_ANTIGO).toBe('vzcrm-sync');

    await entrar();
    const antes = crm.requisicoes.length;
    vi.stubGlobal('fetch', crm.fetch);
    iniciarCrm(local, () => undefined); // o service worker acordou: nenhuma chamada ao CRM
    vi.unstubAllGlobals();
    expect(crm.requisicoes.length).toBe(antes);
  });

  it('o content script/painel falam com o serviço por mensagem; mensagem de fora ou desconhecida é ignorada', async () => {
    const atender = atenderMensagensCrm(servico);
    const enviar = (m: unknown) =>
      new Promise<RespostaMensagemCrm | undefined>((resolve) => {
        const respondeu = atender(m, 'teste', 'teste', resolve);
        if (!respondeu) resolve(undefined);
      });
    const proxy = criarProxyLeads(enviar);
    expect((await proxy.entrar(EMAIL, 'errada')).ok).toBe(false);
    expect((await proxy.entrar(EMAIL, SENHA)).ok).toBe(true);
    expect(await proxy.leadDoContato({ nome: 'Ana', telefone: '5584999990000' })).toMatchObject({ tipo: 'lead', lead: { id: 1 } });

    expect(atender({ vz: 'crm', metodo: 'leadDoContato', args: [{ nome: 'x' }] }, 'outra-extensao', 'teste', () => undefined)).toBe(false);
    expect(atender({ vz: 'crm', metodo: 'constructor', args: [] }, 'teste', 'teste', () => undefined)).toBe(false);
    expect(atender({ vz: 'outro' }, 'teste', 'teste', () => undefined)).toBe(false);
  });

  it('se o service worker não responde, o proxy falha com mensagem clara (a UI mostra o aviso)', async () => {
    const proxy = criarProxyLeads(async () => undefined);
    await expect(proxy.conta()).rejects.toThrow(/não respondeu/);
    const proxy2 = criarProxyLeads(async () => {
      throw new Error('Receiving end does not exist');
    });
    await expect(proxy2.conta()).rejects.toThrow(/não respondeu/);
  });
});
