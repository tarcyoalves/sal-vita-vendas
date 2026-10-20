// Modo automático (0.3.0): regras puras (aceite, ritmo, token), persistência e garantias do
// executor (manual nunca pede envio; painel fechado no meio não envia). Sem DOM.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  aceiteValido,
  configAuto,
  desligarAutomatico,
  emitirToken,
  ESTADO_AUTOMATICO_PADRAO,
  ligarAutomatico,
  recusaDoToken,
  sortearEspera,
} from '../src/shared/automatico';
import { importarTudo, lerAutomatico, lerEmAndamento, salvarAutomatico } from '../src/shared/banco';
import { AUTO } from '../src/shared/constantes';
import type { Backup } from '../src/shared/exportar';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { montar } from './_executor-helpers';

const FOTO = ['false_ana@c.us_M1'];
const colaOk = (p: PedidoConteudo): RespostaConteudo => (p.tipo === 'abrirEColar' ? { ok: true, foto: FOTO, jid: 'ana@c.us' } : { ok: true });
const tipos = (pedidos: PedidoConteudo[]): string[] => pedidos.map((p) => p.tipo);
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
};

describe('aceite do risco', () => {
  it('só vale com a caixa marcada E a palavra AUTOMATICO exata', () => {
    expect(aceiteValido(true, 'AUTOMATICO')).toBe(true);
    expect(aceiteValido(true, '  AUTOMATICO ')).toBe(true);
    expect(aceiteValido(false, 'AUTOMATICO')).toBe(false);
    expect(aceiteValido(true, 'automatico')).toBe(false);
    expect(aceiteValido(true, 'AUTOMÁTICO')).toBe(false);
    expect(aceiteValido(true, '')).toBe(false);
  });

  it('ligar guarda a data do aceite; desligar mantém a data e registra o motivo', () => {
    const ligado = ligarAutomatico(ESTADO_AUTOMATICO_PADRAO, new Date('2026-10-20T12:00:00Z'));
    expect(ligado).toMatchObject({ ligado: true, aceitoEm: '2026-10-20T12:00:00.000Z', motivoDesligado: null });
    const off = desligarAutomatico(ligado, new Date('2026-10-20T13:00:00Z'), 'freio');
    expect(off).toMatchObject({ ligado: false, aceitoEm: '2026-10-20T12:00:00.000Z', motivoDesligado: 'freio', desligadoEm: '2026-10-20T13:00:00.000Z' });
  });

  it('o padrão é desligado, e importar backup (mesmo "substituir") nunca liga nem apaga o estado', async () => {
    const t = await montar(['Ana']);
    expect((await lerAutomatico(t.db)).ligado).toBe(false);
    await salvarAutomatico(t.db, ligarAutomatico(ESTADO_AUTOMATICO_PADRAO, new Date()));
    const backup: Backup = { formato: 'vita-zap-backup', versao: 1, exportadoEm: new Date().toISOString(), contatos: [], campanhas: [], envios: [], naoEnviar: [], config: null };
    await importarTudo(t.db, backup, 'substituir');
    expect((await lerAutomatico(t.db)).ligado).toBe(true);
  });
});

describe('limites e ritmo do automático', () => {
  it('teto 30 e intervalo mínimo 90 s, mesmo com a política manual mais frouxa', () => {
    const c = configAuto({ ...CONFIG_PADRAO, tetoDiario: 60, intervaloMinSeg: 60, intervaloMaxSeg: 120 });
    expect(c.tetoDiario).toBe(30);
    expect(c.intervaloMinSeg).toBe(90);
    expect(c.intervaloMaxSeg).toBe(180);
    // Mais conservador que o piso continua valendo.
    expect(configAuto({ ...CONFIG_PADRAO, tetoDiario: 10, intervaloMinSeg: 200, intervaloMaxSeg: 300 })).toMatchObject({ tetoDiario: 10, intervaloMinSeg: 200, intervaloMaxSeg: 300 });
  });

  it('intervalo aleatório entre 90 e 180 s nos extremos do sorteio', () => {
    expect(sortearEspera(0, () => 0).segundos).toBe(90);
    expect(sortearEspera(0, () => 0.9999).segundos).toBe(180);
  });

  it('a cada 10 envios seguidos: pausa longa de 10–20 min e a contagem recomeça', () => {
    let seguidos = 0;
    const longas: number[] = [];
    for (let i = 1; i <= 25; i += 1) {
      const e = sortearEspera(seguidos, () => 0.5);
      seguidos = e.enviosSeguidos;
      if (e.pausaLonga) {
        longas.push(i);
        expect(e.segundos).toBeGreaterThanOrEqual(600);
        expect(e.segundos).toBeLessThanOrEqual(1200);
      } else {
        expect(e.segundos).toBeLessThanOrEqual(180);
      }
    }
    expect(longas).toEqual([10, 20]);
    expect(sortearEspera(9, () => 0).segundos).toBe(600);
    expect(sortearEspera(9, () => 0.9999).segundos).toBe(1200);
  });
});

describe('token de autorização do envio', () => {
  const alvo = { campanhaId: 'c1', nome: 'Ana', texto: 'Oi Ana' };
  const t0 = 1_000_000;
  const token = emitirToken(alvo, t0, 'id1');

  it('vale para o mesmo nome+texto+campanha dentro de 30 s', () => {
    expect(recusaDoToken(token, alvo, t0 + 1000, new Set())).toBeNull();
    expect(recusaDoToken(token, alvo, t0 + AUTO.tokenValidadeMs, new Set())).toBeNull();
  });

  it('recusa: expirado, usado, outro nome/texto/campanha, ausente e validade forjada', () => {
    expect(recusaDoToken(token, alvo, t0 + AUTO.tokenValidadeMs + 1, new Set())).toMatch(/expirou/);
    expect(recusaDoToken(token, alvo, t0, new Set(['id1']))).toMatch(/já foi usado/);
    expect(recusaDoToken(token, { ...alvo, nome: 'Bia' }, t0, new Set())).toMatch(/não é deste/);
    expect(recusaDoToken(token, { ...alvo, texto: 'Oi Bia' }, t0, new Set())).toMatch(/não é deste/);
    expect(recusaDoToken(token, { ...alvo, campanhaId: 'c2' }, t0, new Set())).toMatch(/não é deste/);
    expect(recusaDoToken(undefined, alvo, t0, new Set())).toMatch(/sem token/);
    expect(recusaDoToken({ ...token, id: '' }, alvo, t0, new Set())).toMatch(/sem token/);
    expect(recusaDoToken({ ...token, expiraEm: t0 + 3_600_000 }, alvo, t0, new Set())).toMatch(/validade acima/);
  });
});

describe('o executor no modo manual nunca pede envio nem mexe no modo automático', () => {
  it('ciclo manual completo (colar → Enter → intervalo → Abrir próximo → Pular → concluir)', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai'], colaOk);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    t.avancarRelogio(200_000);
    t.agendados.at(-1)?.fn();
    await esperar(() => t.ex.atual.fase === 'proximo_pronto');
    await t.ex.abrirProximo();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    await t.ex.acao('pulado');
    await t.ex.pausar();
    expect(tipos(t.pedidos)).not.toContain('enviarAutomatico');
    expect(tipos(t.pedidos)).not.toContain('modoAutomatico');
  });

  it('automático ligado e depois DESLIGADO durante a contagem: o timer dispara e nada é pedido', async () => {
    const t = await montar(['Ana'], colaOk);
    await salvarAutomatico(t.db, ligarAutomatico(ESTADO_AUTOMATICO_PADRAO, new Date()));
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('contagem');
    expect(t.agendados.at(-1)?.ms).toBe(8000);
    await salvarAutomatico(t.db, desligarAutomatico(await lerAutomatico(t.db), new Date(), null));
    t.agendados.at(-1)?.fn();
    await esperar(() => t.ex.atual.fase === 'parada');
    expect(tipos(t.pedidos)).not.toContain('enviarAutomatico');
    expect(t.pedidos.some((p) => p.tipo === 'limparCaixa')).toBe(true);
  });
});

describe('painel fechado no meio do automático', () => {
  it('sem o timer da contagem (painel fechou) nada é enviado; ao reabrir, a conferência de ja_enviada vem antes de colar', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await salvarAutomatico(t.db, ligarAutomatico(ESTADO_AUTOMATICO_PADRAO, new Date()));
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('contagem');
    // "Fecha o painel": o timer de 8 s nunca dispara e o executor é descartado.
    expect(tipos(t.pedidos)).not.toContain('enviarAutomatico');
    expect(await lerEmAndamento(t.db, 'camp')).toMatchObject({ chave: 'ana', texto: 'Oi Ana', foto: FOTO });

    const novo = t.novoExecutor({ ...t.ex.atual.campanha, status: 'pausada' });
    await novo.preparar();
    expect(novo.atual.emAndamento).toEqual({ chave: 'ana', nome: 'Ana', texto: 'Oi Ana' });
    expect(tipos(t.pedidos)).not.toContain('enviarAutomatico');

    // Reabre e retoma: a conversa tem mensagem nossa nova → ja_enviada, sem colar nem enviar de novo.
    t.trocarRespostas((p) =>
      p.tipo === 'abrirEColar' && p.fotoAntes ? { ok: false, codigo: 'ja_enviada', erro: 'já existe', texto: 'Oi Ana', jid: 'ana@c.us' } : colaOk(p),
    );
    await novo.iniciar();
    const abrirAna = t.pedidos.filter((p) => p.tipo === 'abrirEColar' && p.nome === 'Ana');
    expect(abrirAna.at(-1)).toMatchObject({ fotoAntes: FOTO });
    expect(novo.atual.campanha.itens[0].status).toBe('enviado');
    expect(tipos(t.pedidos)).not.toContain('enviarAutomatico');
  });
});
