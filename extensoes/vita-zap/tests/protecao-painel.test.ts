// @vitest-environment jsdom
//
// Proteções do painel (0.7.22): fechou/escondeu o painel → pausa a campanha; batimento para o content script;
// notas anexadas sem cortar linha no meio; "revisar" e o marcador sobrevivem ao backup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITE_NOTAS, anexarNota, linhaDeContato } from '../src/shared/crm-remoto';
import { csvDasCampanhas, lerBackup } from '../src/shared/exportar';
import type { Campanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { INTERVALO_BATIMENTO_MS, iniciarBatimento, MOTIVO_PAINEL_FECHADO, protegerContraFechamento } from '../src/sidepanel/protecao';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function executorFalso(fase: string) {
  const pausar = vi.fn(async () => undefined);
  return { pausar, atual: { fase } };
}

describe('painel fechado ou escondido → pausa a campanha', () => {
  it('pagehide pausa quando a campanha está rodando', () => {
    const ex = executorFalso('aguardando_envio');
    const desligar = protegerContraFechamento(ex);
    window.dispatchEvent(new Event('pagehide'));
    expect(ex.pausar).toHaveBeenCalledWith(MOTIVO_PAINEL_FECHADO);
    desligar();
  });

  it('visibilitychange só pausa quando o painel ficou "hidden"', () => {
    const ex = executorFalso('abrindo');
    const desligar = protegerContraFechamento(ex);
    const estado = vi.spyOn(document, 'visibilityState', 'get');
    estado.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ex.pausar).not.toHaveBeenCalled();
    estado.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ex.pausar).toHaveBeenCalledTimes(1);
    desligar();
  });

  it('campanha parada ou concluída não é pausada de novo; depois de desligar, nada acontece', () => {
    for (const fase of ['parada', 'concluida']) {
      const ex = executorFalso(fase);
      const desligar = protegerContraFechamento(ex);
      window.dispatchEvent(new Event('pagehide'));
      expect(ex.pausar, fase).not.toHaveBeenCalled();
      desligar();
    }
    const ex = executorFalso('intervalo');
    protegerContraFechamento(ex)();
    window.dispatchEvent(new Event('pagehide'));
    expect(ex.pausar).not.toHaveBeenCalled();
  });
});

describe('batimento do painel', () => {
  it('manda {tipo:"batimento"} a cada 10 s e para quando desligado', () => {
    vi.useFakeTimers();
    const pedidos: PedidoConteudo[] = [];
    const parar = iniciarBatimento(async (p): Promise<RespostaConteudo> => {
      pedidos.push(p);
      return { ok: true };
    });
    vi.advanceTimersByTime(INTERVALO_BATIMENTO_MS * 3);
    expect(pedidos).toEqual([{ tipo: 'batimento' }, { tipo: 'batimento' }, { tipo: 'batimento' }]);
    parar();
    vi.advanceTimersByTime(INTERVALO_BATIMENTO_MS * 3);
    expect(pedidos).toHaveLength(3);
    expect(INTERVALO_BATIMENTO_MS).toBeLessThan(45_000 / 2); // várias tentativas antes do prazo do content script
  });

  it('erro ao falar com a aba não derruba o painel', async () => {
    vi.useFakeTimers();
    const parar = iniciarBatimento(async () => {
      throw new Error('aba fechada');
    });
    await vi.advanceTimersByTimeAsync(INTERVALO_BATIMENTO_MS);
    parar();
  });
});

describe('anexarNota: nunca corta uma linha no meio', () => {
  const linhas = (n: number) => Array.from({ length: n }, (_, i) => `[01/01/2026 10:00] antiga ${String(i).padStart(3, '0')} ${'x'.repeat(40)}`);

  it('cabendo, só anexa ao fim', () => {
    expect(anexarNota('a\nb', 'c')).toBe('a\nb\nc');
    expect(anexarNota('', 'c')).toBe('c');
  });

  it('passando de 5000, saem do INÍCIO linhas inteiras; a linha nova fica; o resto está intacto', () => {
    const velhas = linhas(120);
    const nova = linhaDeContato('contato novo', new Date('2026-10-21T17:30:00Z'));
    const r = anexarNota(velhas.join('\n'), nova);
    expect(r.length).toBeLessThanOrEqual(LIMITE_NOTAS);
    const saida = r.split('\n');
    expect(saida.at(-1)).toBe(nova);
    // toda linha restante é uma linha ORIGINAL inteira, na mesma ordem, e é o final da lista antiga
    const restantes = saida.slice(0, -1);
    expect(restantes.length).toBeGreaterThan(0);
    expect(velhas.slice(velhas.length - restantes.length)).toEqual(restantes);
    expect(restantes.every((l) => l.startsWith('[01/01/2026 10:00] antiga ') && l.endsWith('x'.repeat(40)))).toBe(true);
  });

  it('notas antigas num bloco único gigante: o bloco inteiro sai (não é cortado ao meio)', () => {
    const r = anexarNota('y'.repeat(6000), 'nova linha');
    expect(r).toBe('nova linha');
  });

  it('linha nova maior que o limite: encurta o FIM dela (preserva o carimbo de data), nunca o começo', () => {
    const nova = `[21/10/2026 14:30] ${'z'.repeat(6000)}`;
    const r = anexarNota('antiga', nova);
    expect(r.length).toBeLessThanOrEqual(LIMITE_NOTAS);
    expect(r.startsWith('[21/10/2026 14:30] zzz')).toBe(true);
    expect(r.endsWith('…')).toBe(true);
  });
});

describe('backup e CSV conhecem "revisar" e o marcador em voo', () => {
  const camp: Campanha = {
    id: 'c1',
    nome: 'teste',
    criadaEm: '2026-10-19T12:00:00.000Z',
    aprovadaEm: '2026-10-19T12:00:00.000Z',
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi'],
    status: 'pausada',
    motivoPausa: null,
    itens: [{ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', modelo: 'Oi', status: 'revisar', motivo: 'conferir', atualizadoEm: null }],
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
    emVoo: { chave: 'ana', nome: 'Ana', texto: 'Oi', idsAntes: ['M1'], desde: '2026-10-19T13:00:00.000Z' },
  };

  it('exporta e importa sem perder o status nem o marcador', () => {
    const texto = JSON.stringify({ formato: 'vita-zap-backup', versao: 1, exportadoEm: '2026-10-19T12:00:00.000Z', contatos: [], campanhas: [camp], envios: [], naoEnviar: [], config: null });
    const lido = lerBackup(texto);
    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect(lido.backup.campanhas[0].itens[0].status).toBe('revisar');
      expect(lido.backup.campanhas[0].emVoo).toEqual(camp.emVoo);
    }
  });

  it('o CSV rotula o status "revisar"', () => {
    expect(csvDasCampanhas([camp], [])).toContain('revisar (conferir no WhatsApp)');
  });
});
