// Lógica pura do CRM: classificação das abas, "há X dias", dispensa e filtros.

import { describe, expect, it } from 'vitest';
import {
  atualizarConversa,
  chaveDaConversa,
  classificar,
  contar,
  diagnosticoDaLeitura,
  formatarDecorrido,
  horaDoRotulo,
  idadeDaUltima,
  passaNoFiltro,
  type LeituraConversa,
} from '../src/shared/crm-regras';
import type { Contato, Conversa } from '../src/shared/crm-tipos';

// 2026-10-21 12:00 em Fortaleza (UTC-3), quarta-feira.
const AGORA = new Date('2026-10-21T15:00:00Z');

function leitura(p: Partial<LeituraConversa> = {}): LeituraConversa {
  return { nome: 'Ana Cliente', rotuloData: '10:30', previa: 'Bom dia', ultimaDeMim: false, naoLidas: 0, naoLida: false, grupo: false, ...p };
}

function conversa(p: Partial<LeituraConversa> = {}, arquivada = false, anterior?: Conversa, agora = AGORA): Conversa {
  return atualizarConversa(anterior, leitura(p), agora, arquivada);
}

function contato(c: Conversa, p: Partial<Contato> = {}): Contato {
  return { chave: c.chave, nome: c.nome, etiquetas: [], notas: [], criadoEm: 0, atualizadoEm: 0, ...p };
}

describe('chave da conversa', () => {
  it('nome normalizado; contato não salvo vira só dígitos', () => {
    expect(chaveDaConversa('JOÃO  Silva')).toBe('joao silva');
    expect(chaveDaConversa('+55 84 99999-0000')).toBe('5584999990000');
  });
});

describe('classificação das abas', () => {
  it('"Precisa de resposta": a última mensagem NÃO foi minha, individual, não arquivada', () => {
    const c = conversa({ ultimaDeMim: false });
    expect(classificar(c, undefined)).toEqual({ naoLida: false, precisa: true, aguardando: false });
  });

  it('"Aguardando resposta": a última mensagem foi minha', () => {
    const c = conversa({ ultimaDeMim: true });
    expect(classificar(c, undefined)).toEqual({ naoLida: false, precisa: false, aguardando: true });
  });

  it('grupo fica fora das duas abas', () => {
    expect(classificar(conversa({ grupo: true, ultimaDeMim: false }), undefined)).toMatchObject({ precisa: false, aguardando: false });
    expect(classificar(conversa({ grupo: true, ultimaDeMim: true }), undefined)).toMatchObject({ precisa: false, aguardando: false });
  });

  it('arquivada fica fora de tudo', () => {
    expect(classificar(conversa({ ultimaDeMim: false, naoLidas: 2, naoLida: true }, true), undefined)).toEqual({ naoLida: false, precisa: false, aguardando: false });
  });

  it('mensagem não lida é sempre do cliente, mesmo que a leitura do ícone diga "minha"', () => {
    const c = conversa({ ultimaDeMim: true, naoLidas: 3, naoLida: true });
    expect(c.ultimaDeMim).toBe(false);
    expect(classificar(c, undefined)).toMatchObject({ naoLida: true, precisa: true, aguardando: false });
  });

  it('sem como saber (prévia vazia) não entra em nenhuma das duas', () => {
    expect(classificar(conversa({ ultimaDeMim: null, previa: '' }), undefined)).toMatchObject({ precisa: false, aguardando: false });
  });

  it('dispensar tira de "Precisa de resposta" até chegar mensagem nova', () => {
    const c = conversa({ previa: 'ok, obrigado' });
    const dispensado = contato(c, { dispensadaAss: c.ass });
    expect(classificar(c, dispensado).precisa).toBe(false);
    // chega mensagem nova: a assinatura muda e a conversa volta
    const nova = conversa({ previa: 'e o prazo de entrega?' }, false, c);
    expect(classificar(nova, dispensado).precisa).toBe(true);
    // uma nova não lida com a mesma prévia também reativa
    const igualMasNaoLida = conversa({ previa: 'ok, obrigado', naoLidas: 1, naoLida: true }, false, c);
    expect(classificar(igualMasNaoLida, dispensado).precisa).toBe(true);
  });

  it('contadores: Todas, Não lidas, Precisa, Aguardando', () => {
    const lista = [
      conversa({ nome: 'A', ultimaDeMim: false }),
      conversa({ nome: 'B', ultimaDeMim: true }),
      conversa({ nome: 'C', ultimaDeMim: false, naoLidas: 2, naoLida: true }),
      conversa({ nome: 'D', ultimaDeMim: false, grupo: true }),
      conversa({ nome: 'E', ultimaDeMim: true }, true),
    ];
    const dispensada = contato(lista[0], { dispensadaAss: lista[0].ass });
    expect(contar(lista, {})).toEqual({ todas: 4, naoLidas: 1, precisa: 2, aguardando: 1 });
    expect(contar(lista, { [dispensada.chave]: dispensada })).toEqual({ todas: 4, naoLidas: 1, precisa: 1, aguardando: 1 });
  });
});

describe('estado da conversa ao longo do tempo', () => {
  it('desdeEm só muda quando o estado muda', () => {
    const t1 = new Date('2026-10-21T15:00:00Z');
    const t2 = new Date('2026-10-21T18:00:00Z');
    const t3 = new Date('2026-10-22T10:00:00Z');
    const a = atualizarConversa(undefined, leitura({ ultimaDeMim: true, rotuloData: null }), t1, false);
    const b = atualizarConversa(a, leitura({ ultimaDeMim: true, rotuloData: null }), t2, false);
    expect(b.desdeEm).toBe(t1.getTime());
    expect(b.vistaEm).toBe(t2.getTime());
    const c = atualizarConversa(b, leitura({ ultimaDeMim: false, previa: 'resposta', rotuloData: null }), t3, false);
    expect(c.desdeEm).toBe(t3.getTime());
  });

  it('data da última mensagem vem do rótulo da linha e fica guardada', () => {
    expect(conversa({ rotuloData: 'Ontem' }).dataMsg).toBe('2026-10-20');
    expect(conversa({ rotuloData: '14/10/2026' }).dataMsg).toBe('2026-10-14');
    expect(conversa({ rotuloData: '14:30' })).toMatchObject({ dataMsg: '2026-10-21', hora: '14:30' });
    // dia da semana ambíguo ("quarta-feira" numa quarta) → sem data nova; mantém a anterior se o estado é o mesmo
    const a = conversa({ rotuloData: '14/10/2026' });
    const b = atualizarConversa(a, leitura({ rotuloData: 'quarta-feira' }), AGORA, false);
    expect(b.dataMsg).toBe('2026-10-14');
  });

  it('hora com AM/PM', () => {
    expect(horaDoRotulo('2:05 PM')).toBe('14:05');
    expect(horaDoRotulo('12:10 AM')).toBe('00:10');
    expect(horaDoRotulo('9:05')).toBe('09:05');
    expect(horaDoRotulo('Ontem')).toBeNull();
    expect(horaDoRotulo('25:00')).toBeNull();
  });
});

describe('"há X dias"', () => {
  it('dias de calendário a partir da data do rótulo', () => {
    expect(idadeDaUltima(conversa({ rotuloData: '14/10/2026' }), AGORA)).toMatchObject({ dias: 7, texto: 'há 7 dias' });
    expect(idadeDaUltima(conversa({ rotuloData: 'Ontem' }), AGORA)).toMatchObject({ dias: 1, texto: 'há 1 dia' });
    expect(idadeDaUltima(conversa({ rotuloData: '01/10/2026' }), AGORA)).toMatchObject({ dias: 20 });
  });

  it('hoje, com hora: minutos e horas', () => {
    expect(idadeDaUltima(conversa({ rotuloData: '11:30' }), AGORA)).toMatchObject({ dias: 0, texto: 'há 30 min' });
    expect(idadeDaUltima(conversa({ rotuloData: '09:00' }), AGORA)).toMatchObject({ dias: 0, texto: 'há 3 h' });
    expect(idadeDaUltima(conversa({ rotuloData: '12:00' }), AGORA).texto).toBe('agora há pouco');
  });

  it('sem rótulo reconhecido, usa o instante em que a extensão viu a conversa nesse estado', () => {
    const vista = conversa({ rotuloData: null, ultimaDeMim: true }, false, undefined, new Date('2026-10-18T12:00:00Z'));
    expect(idadeDaUltima(vista, AGORA)).toMatchObject({ dias: 3, texto: 'há 3 dias' });
  });

  it('formatarDecorrido', () => {
    expect(formatarDecorrido(30_000)).toBe('agora há pouco');
    expect(formatarDecorrido(5 * 60_000)).toBe('há 5 min');
    expect(formatarDecorrido(26 * 3_600_000)).toBe('há 1 dia');
  });
});

describe('filtro "sem resposta há X dias" (aba Aguardando)', () => {
  const filtro = (dias: number | null) => ({ aba: 'aguardando' as const, diasSemResposta: dias, etiquetas: [] });
  const recente = conversa({ nome: 'Recente', ultimaDeMim: true, rotuloData: 'Ontem' });
  const meio = conversa({ nome: 'Meio', ultimaDeMim: true, rotuloData: '17/10/2026' }); // 4 dias
  const velha = conversa({ nome: 'Velha', ultimaDeMim: true, rotuloData: '01/10/2026' }); // 20 dias
  const dela = conversa({ nome: 'Dela', ultimaDeMim: false, rotuloData: '01/10/2026' });
  const nomes = (dias: number | null) => [recente, meio, velha, dela].filter((c) => passaNoFiltro(c, undefined, filtro(dias), AGORA)).map((c) => c.nome);

  it('1, 3, 7 e 15 dias', () => {
    expect(nomes(null)).toEqual(['Recente', 'Meio', 'Velha']);
    expect(nomes(1)).toEqual(['Recente', 'Meio', 'Velha']);
    expect(nomes(3)).toEqual(['Meio', 'Velha']);
    expect(nomes(7)).toEqual(['Velha']);
    expect(nomes(15)).toEqual(['Velha']);
  });

  it('o prazo só vale na aba Aguardando', () => {
    expect(passaNoFiltro(dela, undefined, { aba: 'precisa', diasSemResposta: 15, etiquetas: [] }, AGORA)).toBe(true);
  });
});

describe('filtro por etiqueta/fase junto com a aba', () => {
  const c = conversa({ ultimaDeMim: false });
  it('exige que o contato tenha a etiqueta ou a fase', () => {
    const f = (etiquetas: string[]) => ({ aba: 'todas' as const, diasSemResposta: null, etiquetas });
    expect(passaNoFiltro(c, undefined, f(['e1']), AGORA)).toBe(false);
    expect(passaNoFiltro(c, contato(c, { etiquetas: ['e1'] }), f(['e1']), AGORA)).toBe(true);
    expect(passaNoFiltro(c, contato(c, { fase: 'negociando' }), f(['fase:negociando']), AGORA)).toBe(true);
    expect(passaNoFiltro(c, contato(c, { fase: 'novo' }), f(['fase:negociando']), AGORA)).toBe(false);
    expect(passaNoFiltro(c, contato(c, { etiquetas: ['e2'] }), f(['e1', 'e2']), AGORA)).toBe(true);
  });
});

describe('diagnóstico da leitura', () => {
  it('avisa quando nenhuma mensagem minha foi reconhecida em muitas conversas', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => conversa({ nome: `C${i}`, ultimaDeMim: false }));
    expect(diagnosticoDaLeitura(muitas).join(' ')).toMatch(/nenhuma mensagem sua/);
    expect(diagnosticoDaLeitura([...muitas.slice(1), conversa({ nome: 'Eu', ultimaDeMim: true })])).toEqual([]);
    expect(diagnosticoDaLeitura(muitas.slice(0, 5))).toEqual([]);
  });
});
