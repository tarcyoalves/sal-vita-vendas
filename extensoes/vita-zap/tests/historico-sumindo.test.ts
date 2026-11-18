// Aviso diário "histórico sumindo" no service worker (0.7.59): conta só com o que já está salvo localmente, no máximo UM aviso por
// dia, só se N > 0, sem abrir o WhatsApp e sem permissão nova no manifest.

import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALARME_HISTORICO, NOTIFICACAO_HISTORICO, aoAlarmeHistorico, aoClicarAvisoHistorico, garantirAlarmeHistorico, verificarHistorico, type DependenciasHistorico } from '../src/background/historico';
import { abrirBanco, lerAvisoHistorico, listarContatos, marcarNaoEnviar, salvarContatos, type Banco } from '../src/shared/banco';
import type { ContatoVarrido } from '../src/shared/contatos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';

let n = 0;
let nome = '';
let fake: ChromeFalso;
const HOJE = new Date('2026-11-17T13:00:00.000Z'); // terça 10h em Fortaleza
const contato = (nomeC: string, ultimaConversa: string): ContatoVarrido => ({ chave: nomeC.toLowerCase(), nome: nomeC, rotuloData: '', ultimaConversa, revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: HOJE.toISOString() });

function deps(extra: Partial<DependenciasHistorico> = {}): DependenciasHistorico & { avisos: string[]; selos: string[] } {
  const avisos: string[] = [];
  const selos: string[] = [];
  return {
    abrir: () => abrirBanco(nome),
    notificar: async (t) => void avisos.push(t),
    selo: async (t) => void selos.push(t),
    ...extra,
    avisos,
    selos,
  };
}
const banco = (): Promise<Banco> => abrirBanco(nome);

beforeEach(async () => {
  fake = instalarChromeFalso();
  nome = `historico-${Date.now()}-${(n += 1)}`;
  const db = await banco();
  await salvarContatos(db, [contato('CLIENTE Ana', '2026-10-23'), contato('CLIENTE Bia', '2026-10-20'), contato('CLIENTE Caio', '2026-11-10')]);
  db.close();
});

describe('aviso diário do histórico sumindo', () => {
  it('N > 0: UMA notificação com a contagem e a data-limite; não abre o WhatsApp (nenhuma aba é tocada)', async () => {
    const d = deps();
    const texto = await verificarHistorico(HOJE, d);
    // Ana: 25 dias (limite 22/11); Bia: 28 dias (limite 19/11); Caio: recente
    expect(texto).toBe('2 conversas precisam ser lidas até 19/11 senão o histórico some do WhatsApp Web.');
    expect(d.avisos).toEqual([texto]);
    expect(fake.abasCriadas).toEqual([]);
    expect(fake.abasAtivadas).toEqual([]);
  });

  it('no máximo uma por dia (fuso de Fortaleza); no dia seguinte avisa de novo se ainda houver', async () => {
    const d = deps();
    expect(await verificarHistorico(HOJE, d)).not.toBeNull();
    expect(await verificarHistorico(new Date(HOJE.getTime() + 3_600_000), d)).toBeNull(); // mesma data
    expect(d.avisos).toHaveLength(1);
    const db = await banco();
    expect(await lerAvisoHistorico(db)).toBe('2026-11-17');
    db.close();
    expect(await verificarHistorico(new Date(HOJE.getTime() + 86_400_000), d)).toMatch(/^2 conversas/);
    expect(d.avisos).toHaveLength(2);
  });

  it('N = 0: nenhuma notificação e o dia não é "gasto" (se aparecer gente depois, avisa)', async () => {
    const d = deps();
    const db = await banco();
    await marcarNaoEnviar(db, { chave: 'cliente ana', nome: 'CLIENTE Ana', desde: HOJE.toISOString(), motivo: 'x' });
    await marcarNaoEnviar(db, { chave: 'cliente bia', nome: 'CLIENTE Bia', desde: HOJE.toISOString(), motivo: 'x' });
    db.close();
    expect(await verificarHistorico(HOJE, d)).toBeNull();
    expect(d.avisos).toEqual([]);
    const db2 = await banco();
    expect(await lerAvisoHistorico(db2)).toBeNull();
    await salvarContatos(db2, [contato('CLIENTE Dani', '2026-10-22')]);
    db2.close();
    expect(await verificarHistorico(HOJE, d)).toMatch(/^1 conversa precisa ser lida até 21\/11/);
  });

  it('sem varredura salva: nada a avisar', async () => {
    nome = `historico-vazio-${Date.now()}-${(n += 1)}`;
    const d = deps();
    expect(await verificarHistorico(HOJE, d)).toBeNull();
    expect(d.avisos).toEqual([]);
  });

  it('se a notificação não puder ser mostrada, cai para o selo (badge) do ícone, e o dia conta', async () => {
    const d = deps({ notificar: async () => { throw new Error('bloqueada'); } });
    expect(await verificarHistorico(HOJE, d)).not.toBeNull();
    expect(d.selos).toEqual(['2']);
    expect(await verificarHistorico(HOJE, d)).toBeNull();
  });

  it('o comportamento padrão usa chrome.notifications (permissão que já existe) com id próprio', async () => {
    await verificarHistorico(HOJE, { abrir: () => abrirBanco(nome), notificar: async (t) => void (await chrome.notifications.create(NOTIFICACAO_HISTORICO, { type: 'basic', iconUrl: 'x', title: 't', message: t })), selo: async () => undefined });
    expect([...fake.notificacoes.keys()]).toEqual([NOTIFICACAO_HISTORICO]);
    expect(await aoClicarAvisoHistorico(NOTIFICACAO_HISTORICO)).toBe(true);
    expect(fake.notificacoes.size).toBe(0);
    expect(await aoClicarAvisoHistorico('vz-outro')).toBe(false);
  });

  it('conta com os contatos da varredura já salvos (nada lido do WhatsApp) e não altera a varredura', async () => {
    const db = await banco();
    const antes = await listarContatos(db);
    db.close();
    await verificarHistorico(HOJE, deps());
    const db2 = await banco();
    expect(await listarContatos(db2)).toEqual(antes);
    db2.close();
  });
});

describe('alarme diário (às 9h de Fortaleza)', () => {
  it('cria o alarme uma vez (idempotente), no próximo 9h', async () => {
    await garantirAlarmeHistorico(HOJE); // 10h local: o 9h de hoje já passou
    expect(fake.alarmes.get(ALARME_HISTORICO)?.scheduledTime).toBe(Date.UTC(2026, 10, 18, 12, 0)); // 18/11 09:00 BRT
    await garantirAlarmeHistorico(new Date('2026-11-18T01:00:00.000Z'));
    expect(fake.alarmes.size).toBe(1);
    expect(fake.alarmes.get(ALARME_HISTORICO)?.scheduledTime).toBe(Date.UTC(2026, 10, 18, 12, 0)); // não recriou
    fake.alarmes.clear();
    await garantirAlarmeHistorico(new Date('2026-11-17T08:00:00.000Z')); // 05h local: 9h de hoje ainda vem
    expect(fake.alarmes.get(ALARME_HISTORICO)?.scheduledTime).toBe(Date.UTC(2026, 10, 17, 12, 0));
  });

  it('só trata o alarme do histórico; os de lembrete seguem para o outro tratador', async () => {
    expect(await aoAlarmeHistorico('vz:abc', HOJE)).toBe(false);
    expect(await aoAlarmeHistorico('outro', HOJE)).toBe(false);
  });
});

describe('sem permissão nova no manifest', () => {
  it('o manifest continua só com sidePanel, scripting, storage, alarms e notifications (o aviso usa as que já existem)', () => {
    const m = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'manifest.json'), 'utf8')) as { permissions: string[]; version: string };
    expect(m.permissions.sort()).toEqual(['alarms', 'notifications', 'scripting', 'sidePanel', 'storage']);
    expect(m.version).toBe('0.7.59');
  });

  it('o service worker liga o alarme e o clique do aviso', () => {
    const c = readFileSync(join(__dirname, '..', 'src', 'background', 'service-worker.ts'), 'utf8');
    expect(c).toMatch(/garantirAlarmeHistorico\(\)/);
    expect(c).toMatch(/aoAlarmeHistorico\(alarme\.name\)/);
    expect(c).toMatch(/aoClicarAvisoHistorico\(id\)/);
  });
});
