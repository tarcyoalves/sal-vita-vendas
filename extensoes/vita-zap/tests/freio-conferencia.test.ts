// 0.3.1 — o freio ("N problemas seguidos") conta só falhas de DEPOIS de colar/enviar.
// Conferências que falham ANTES de colar (nao_confirmado, ambiguo, grupo, caixa_ocupada) não
// colaram nem enviaram nada: o contato vira "pulado (revisar)" com o motivo e o freio não anda.

import { describe, expect, it } from 'vitest';
import type { CodigoErro } from '../src/shared/mensagens';
import { motivosAgrupados, resumo, terminouComProblemas } from '../src/shared/campanha';
import { montar } from './_executor-helpers';

const falha = (codigo: CodigoErro) => () => ({ ok: false as const, codigo, erro: `falha ${codigo}` });

describe('freio: erros antes de colar não contam', () => {
  it.each(['nao_confirmado', 'ambiguo', 'grupo', 'caixa_ocupada'] as const)('%s ×4: todos pulados (revisar), nenhum problema, sem pausa', async (codigo) => {
    const t = await montar(['Ana', 'Bia', 'Cai', 'Dani'], (p) => (p.tipo === 'abrirEColar' ? falha(codigo)() : { ok: true }));
    await t.ex.iniciar();
    const c = t.ex.atual.campanha;
    expect(c.itens.map((i) => [i.status, i.codigo])).toEqual(Array(4).fill(['pulado', codigo]));
    expect(c.itens[0].motivo).toMatch(/pulado para revisar/);
    expect(c.problemasSeguidos).toBe(0);
    expect(c.status).toBe('concluida');
    expect(resumo(c)).toMatchObject({ pulado: 4, problema: 0 });
    expect(terminouComProblemas(c)).toBe(true);
    expect(motivosAgrupados(c)).toEqual([{ codigo, quantidade: 4, mensagem: expect.stringContaining('Nada foi colado nem enviado') }]);
  });

  it('falha de depois de colar (colar_falhou) continua contando: 3 seguidos pausam a campanha no manual', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai', 'Dani'], (p) => (p.tipo === 'abrirEColar' ? falha('colar_falhou')() : { ok: true }));
    await t.ex.iniciar();
    const c = t.ex.atual.campanha;
    expect(c.status).toBe('pausada');
    expect(c.problemasSeguidos).toBe(3);
    expect(c.itens.filter((i) => i.status === 'problema')).toHaveLength(3);
    expect(c.itens[3].status).toBe('pendente');
  });

  it('pulados no meio não zeram nem somam: 2 problemas, 1 pulado, depois mais 1 problema = 3 e pausa', async () => {
    const respostas: CodigoErro[] = ['colar_falhou', 'colar_falhou', 'nao_confirmado', 'colar_falhou'];
    let i = 0;
    const t = await montar(['Ana', 'Bia', 'Cai', 'Dani', 'Eva'], (p) => (p.tipo === 'abrirEColar' ? falha(respostas[i++] ?? 'colar_falhou')() : { ok: true }));
    await t.ex.iniciar();
    const c = t.ex.atual.campanha;
    expect(c.itens.map((x) => x.status)).toEqual(['problema', 'problema', 'pulado', 'problema', 'pendente']);
    expect(c.status).toBe('pausada');
  });
});
