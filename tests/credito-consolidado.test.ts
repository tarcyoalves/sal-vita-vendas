import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consolidarRelatorios, escolherParaConsolidar, relatorioValido } from '../shared/credito';
import { gerarPdfCreditoConsolidado } from '../server/lib/credito/pdf';
import { selecionarParaConsolidado } from '../server/lib/credito/produtos';
import { deveAbrirConsolidado, linhasDoResultado, produtosComFalha, produtosComRelatorio } from '../client/src/lib/credito/resultado';
import { boaVistaSintetico, itemBoaVista, itemSerasa, serasaSemScore, serasaSintetico } from './fixtures/credito/consolidado';

const AGORA = new Date('2026-10-16T19:00:00.000Z');

/** Texto de um PDF gerado SEM compressão (mesma técnica de tests/credito-pdf.test.ts). */
function extrairTexto(pdf: Buffer): string {
  const bruto = pdf.toString('latin1');
  const linhas: string[] = [];
  const re = /\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const trecho = m[1] ?? `<${m[2]}>`;
    let linha = '';
    for (const h of trecho.matchAll(/<([0-9a-fA-F]+)>/g)) {
      for (let i = 0; i < h[1].length; i += 2) {
        const c = parseInt(h[1].slice(i, i + 2), 16);
        linha += c === 0x97 ? '—' : c === 0x95 ? '•' : String.fromCharCode(c);
      }
    }
    linhas.push(linha);
  }
  return linhas.join('\n');
}

describe('consolidarRelatorios', () => {
  const c = consolidarRelatorios([itemBoaVista(), itemSerasa()], AGORA);

  it('scores lado a lado, um por fonte, nunca fundidos', () => {
    expect(c.scores.map((s) => [s.produtoNome, s.valor, s.faixa])).toEqual([['Consulta simples', 540, 'C'], ['Serasa Premium', 710, 'B']]);
    expect(c.scores[1].probabilidadeInadimplencia).toBe(4.5);
    expect(c.scores.every((s) => s.calculado)).toBe(true);
    // 170 pontos de diferença: abaixo do limite de divergência
    expect(c.divergenciaScore).toBeNull();
  });

  it('cadastro: primeiro valor não nulo na ordem Serasa > Boa Vista; sócios do Serasa; veículos/faturamento de quem tiver', () => {
    const cad = c.fundido.cadastro;
    expect(cad.razaoSocial).toBe('COMERCIAL EXEMPLO LTDA'); // Serasa vem primeiro
    expect(cad.nomeFantasia).toBe('Exemplo Atacado'); // Serasa null -> Boa Vista
    expect(cad.capitalSocial).toBe(100000);
    expect(cad.inscricaoEstadual).toBe('20.123.456-7');
    expect(cad.numeroFiliais).toBe(2);
    expect(c.fundido.socios.map((s) => s.nome)).toEqual(['Maria Exemplo da Silva', 'João Fictício Pereira']);
    expect(c.fundido.complementos?.faturamentoPresumidoFaixa).toBe('De R$ 1 a 5 milhões');
    expect(c.fundido.complementos?.veiculos).toHaveLength(1);
    expect(c.fundido.comportamento?.pagamentoPontualPct).toBe(91); // só o Boa Vista tem
    expect(c.fundido.comportamento?.ultimaCompraEm).toBe('2026-09-28');
  });

  it('pendências: Boa Vista 0 e Serasa 10 -> quantidade = a maior, divergência explícita, valor da fonte de maior quantidade', () => {
    const g = c.fundido.anotacoes.pendenciasFinanceiras;
    expect(g.consultado).toBe(true);
    expect(g.quantidade).toBe(10);
    expect(g.itens).toHaveLength(10);
    expect(g.valorTotal).toBe(serasaSintetico.anotacoes.pendenciasFinanceiras.valorTotal);
    expect(g.itens.every((i) => i.fonte === 'Serasa Premium')).toBe(true);
    expect(c.divergenciaPorGrupo.pendenciasFinanceiras).toBe('Consulta simples: 0 · Serasa Premium: 10');
    expect(c.divergencias.some((d) => d.includes('Pendências financeiras') && d.includes('Consulta simples: 0 · Serasa Premium: 10'))).toBe(true);
  });

  it('protestos: união deduplicada (data+valor+local) com a fonte de cada item; quantidade = maior (3), não a soma (5)', () => {
    const g = c.fundido.anotacoes.protestos;
    expect(g.quantidade).toBe(3);
    expect(g.itens).toHaveLength(3);
    const porData = Object.fromEntries(g.itens.map((i) => [i.data, i.fonte]));
    expect(porData['2026-03-05']).toBe('Consulta simples + Serasa Premium');
    expect(porData['2026-06-10']).toBe('Consulta simples + Serasa Premium');
    expect(porData['2026-08-20']).toBe('Serasa Premium');
    expect(g.valorTotal).toBe(5400.5);
    expect(c.divergenciaPorGrupo.protestos).toBe('Consulta simples: 2 · Serasa Premium: 3');
  });

  it('ocorrência que só uma fonte cobre (ações judiciais) vira divergência; cheques iguais não', () => {
    expect(c.fundido.anotacoes.acoesJudiciais.quantidade).toBe(1);
    expect(c.divergencias.some((d) => d.startsWith('Ações judiciais') && d.includes('só Serasa Premium') && d.includes('Consulta simples não consulta'))).toBe(true);
    expect(c.divergenciaPorGrupo.chequesSemFundo).toBeUndefined();
    expect(c.fundido.anotacoes.chequesSemFundo).toMatchObject({ consultado: true, quantidade: 0 });
    // nenhuma fonte consultou falência: segue "não consultado" (nunca "nada consta")
    expect(c.fundido.anotacoes.falenciaRecuperacao.consultado).toBe(false);
  });

  it('consultas: união por data+consultante (sem duplicar o mesmo evento), total em 12 meses = o maior', () => {
    expect(c.fundido.consultasRecentes.map((x) => `${x.data} ${x.consultante}`)).toEqual([
      '2026-10-10 DISTRIBUIDORA MODELO S.A.', // mesmo evento nas duas fontes: vale o texto da fonte preferida (Serasa)
      '2026-10-02 Banco Exemplo de Fomento', '2026-09-21 Transportadora Fictícia',
    ]);
    expect(c.fundido.complementos?.consultas12Meses).toBe(17);
  });

  it('veredito = o pior entre as fontes (pendências somam mais de R$ 5.000 só no Serasa); motivos e fontes', () => {
    expect(c.veredito).toBe('REPROVADO_A_PRAZO');
    expect(c.motivos.join(' | ')).toContain('Pendências financeiras somam');
    expect(c.motivos.join(' | ')).toContain('protesto');
    expect(c.fontes.map((f) => [f.produtoNome, f.custoReais])).toEqual([['Consulta simples', 2.75], ['Serasa Premium', 6.72]]);
    expect(c.fundido.fonte.custoReais).toBeCloseTo(9.47);
    expect(c.simulado).toBe(false);
    expect(c.valido).toBe(true);
    expect(c.consultadoEm).toBe(serasaSintetico.consultadoEm); // a mais recente
  });

  it('scores muito distantes entre fontes geram divergência', () => {
    const alto = { ...serasaSintetico, score: { ...serasaSintetico.score, valor: 820 } };
    const d = consolidarRelatorios([itemBoaVista(), itemSerasa(alto)], AGORA);
    expect(d.divergenciaScore).toContain('Consulta simples: 540');
    expect(d.divergenciaScore).toContain('Serasa Premium: 820');
    expect(d.divergencias[0]).toBe(d.divergenciaScore);
  });

  it('Serasa com score "não calculado": mostra isso, usa o que há e nunca inventa um score', () => {
    const d = consolidarRelatorios([itemBoaVista(), itemSerasa(serasaSemScore)], AGORA);
    expect(d.scores[1]).toMatchObject({ produtoNome: 'Serasa Premium', valor: null, calculado: false });
    expect(d.fundido.score.valor).toBe(540); // o único calculado
    expect(d.motivos).toContain('Serasa Premium: score não calculado');
    expect(d.motivos).not.toContain('Score não informado pela fonte');
    expect(d.fundido.socios).toHaveLength(2); // o resto da fonte continua útil
    // só uma fonte calculou: sem divergência de score
    expect(d.divergenciaScore).toBeNull();
    // coerente com `ultimo`/`semaforos`, que também rebaixam por "score não informado" naquele produto: nunca APROVADO
    expect(d.veredito).not.toBe('APROVADO');
  });

  it('nenhuma fonte com score: fundido sem score e uma linha por fonte', () => {
    const nulo = { ...boaVistaSintetico, score: { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null } };
    const d = consolidarRelatorios([itemBoaVista(nulo), itemSerasa(serasaSemScore)], AGORA);
    expect(d.fundido.score.valor).toBeNull();
    expect(d.motivos).toEqual(expect.arrayContaining(['Consulta simples: score não calculado', 'Serasa Premium: score não calculado']));
  });

  it('só valores das fontes: com uma única fonte o consolidado é o próprio relatório', () => {
    const d = consolidarRelatorios([itemBoaVista()], AGORA);
    expect(d.fundido.anotacoes.protestos.quantidade).toBe(2);
    expect(d.divergencias.some((x) => x.startsWith('Ações judiciais'))).toBe(false); // ninguém informa ações
    expect(d.divergenciaPorGrupo).toEqual({});
  });
});

describe('escolha dos relatórios que entram', () => {
  const velho = { ...serasaSintetico, consultadoEm: '2026-08-01T12:00:00.000Z' };
  const novoBV = { ...boaVistaSintetico, consultadoEm: '2026-10-16T18:30:00.000Z' };

  it('o mais recente de cada produto; relatório vencido (>30 dias) fica de fora se houver válido', () => {
    const e = escolherParaConsolidar([itemBoaVista(novoBV), itemBoaVista(), itemSerasa(velho)], AGORA);
    expect(e.valido).toBe(true);
    expect(e.itens.map((i) => i.produto)).toEqual(['boavista']);
    expect(e.itens[0].consultadoEm).toBe(novoBV.consultadoEm);
  });

  it('nenhum válido: usa o mais recente de cada produto e marca valido:false', () => {
    const futuro = new Date('2027-03-01T00:00:00Z');
    const e = escolherParaConsolidar([itemBoaVista(), itemSerasa()], futuro);
    expect(e.valido).toBe(false);
    expect(e.itens).toHaveLength(2);
    expect(relatorioValido(boaVistaSintetico.consultadoEm, futuro)).toBe(false);
  });

  it('simulados saem quando há relatório real', () => {
    const sim = { ...serasaSintetico, fonte: { ...serasaSintetico.fonte, provedor: 'simulado' } };
    const e = escolherParaConsolidar([itemBoaVista(), itemSerasa(sim)], AGORA);
    expect(e.itens.map((i) => i.produto)).toEqual(['boavista']);
    // só simulados: consolida e marca simulado
    const s = consolidarRelatorios([itemSerasa(sim)], AGORA);
    expect(s.simulado).toBe(true);
    expect(s.fundido.fonte.provedor).toBe('simulado');
  });

  it('lista vazia lança erro (a procedure responde NOT_FOUND antes)', () => {
    expect(() => consolidarRelatorios([], AGORA)).toThrow();
  });
});

describe('selecionarParaConsolidado (servidor, função pura)', () => {
  const L = (id: number, produto: string, consultadoEm: string, provedor = 'boavista_apifull') => ({ id, produto, consultadoEm: new Date(consultadoEm), provedor, veredito: 'APROVADO' });

  it('o mais recente válido por produto, na ordem do catálogo', () => {
    const linhas = [
      L(5, 'serasa_premium', '2026-10-16T18:03:00Z'), L(4, 'boavista', '2026-10-16T18:02:00Z'),
      L(3, 'serasa_premium', '2026-10-01T18:03:00Z'), L(2, 'boavista', '2026-09-20T18:02:00Z'),
    ];
    const s = selecionarParaConsolidado(linhas, { provedorReal: true, agora: AGORA });
    expect(s.valido).toBe(true);
    expect(s.linhas.map((l) => l.id)).toEqual([4, 5]); // Consulta simples antes do Serasa Premium
  });

  it('exclui simulados quando o provedor ligado é o real e os mantém quando é o simulado', () => {
    const linhas = [L(9, 'boavista', '2026-10-16T18:02:00Z', 'simulado'), L(8, 'boavista', '2026-10-10T18:02:00Z')];
    expect(selecionarParaConsolidado(linhas, { provedorReal: true, agora: AGORA }).linhas.map((l) => l.id)).toEqual([8]);
    expect(selecionarParaConsolidado(linhas, { provedorReal: false, agora: AGORA }).linhas.map((l) => l.id)).toEqual([9]);
  });

  it('só vencidos: devolve o mais recente de cada produto com valido:false; linha legada conta como boavista', () => {
    const linhas = [L(7, 'boavista_apifull', '2026-06-01T00:00:00Z'), L(6, 'serasa_premium', '2026-05-01T00:00:00Z')];
    const s = selecionarParaConsolidado(linhas, { provedorReal: true, agora: AGORA });
    expect(s.valido).toBe(false);
    expect(s.linhas.map((l) => l.id)).toEqual([7, 6]);
  });

  it('sem linhas (ou só simulados com provedor real): vazio', () => {
    expect(selecionarParaConsolidado([], { provedorReal: true }).linhas).toEqual([]);
    expect(selecionarParaConsolidado([L(1, 'boavista', '2026-10-16T18:02:00Z', 'simulado')], { provedorReal: true, agora: AGORA }).linhas).toEqual([]);
  });
});

describe('resultado por produto na tela (consulta com 2+ produtos)', () => {
  const ok = { produto: 'boavista', ok: true, reaproveitado: false, cobrado: true, custoReais: 2.75 };
  const reap = { produto: 'serasa_premium', ok: true, reaproveitado: true, cobrado: false, custoReais: 0 };
  const falha = { produto: 'serasa_premium', ok: false, reaproveitado: false, cobrado: false, custoReais: 0, erro: 'Provedor indisponível.' };

  it('sucesso, reaproveitado e erro (com mensagem e "Não foi cobrado")', () => {
    const l = linhasDoResultado([ok, falha]);
    expect(l[0]).toMatchObject({ tom: 'ok', titulo: 'Consulta simples: consultado com sucesso' });
    expect(l[0].detalhe).toContain('R$');
    expect(l[1]).toMatchObject({ tom: 'erro', titulo: 'Serasa Premium: NÃO foi possível puxar' });
    expect(l[1].detalhe).toContain('Provedor indisponível.');
    expect(l[1].detalhe).toContain('Não foi cobrado.');
    expect(linhasDoResultado([reap])[0]).toMatchObject({ tom: 'reaproveitado' });
  });

  it('falha COBRADA é destacada', () => {
    const l = linhasDoResultado([{ ...falha, cobrado: true, custoReais: 6.72 }]);
    expect(l[0].detalhe).toContain('FOI cobrada');
  });

  it('abre o consolidado só com 2+ relatórios e nenhuma falha', () => {
    expect(deveAbrirConsolidado([ok, reap])).toBe(true);
    expect(deveAbrirConsolidado([ok])).toBe(false);
    expect(deveAbrirConsolidado([ok, falha])).toBe(false);
    expect(produtosComRelatorio([ok, falha])).toBe(1);
    expect(produtosComFalha([ok, falha])).toBe(1);
  });
});

describe('gerarPdfCreditoConsolidado', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('um relatório só: as duas fontes, cartão de score por fonte, matriz com "Divergem", coluna Fonte; razão social e CNPJ uma vez', async () => {
    const c = consolidarRelatorios([itemBoaVista(), itemSerasa()], AGORA);
    const pdf = await gerarPdfCreditoConsolidado(c, { consultadoPor: 'Usuário de Teste' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const texto = extrairTexto(pdf);
    // topo: as duas fontes, com data e hora (15:02 e 15:03 no fuso de São Paulo)
    expect(texto).toContain('Fontes: Consulta simples (16/10 15:02) · Serasa Premium (16/10 15:03)');
    expect(texto).toContain('Reprovado a prazo');
    // score por fonte
    expect(texto).toContain('SCORES INFORMADOS PELAS FONTES');
    expect(texto).toContain('540');
    expect(texto).toContain('710');
    expect(texto).toContain('não são somados nem combinados');
    expect(texto).not.toContain('SCORE (0 A 1000)'); // não há um score único
    // divergência de quantidade (matriz de comparação, coluna "Leitura") e coluna Fonte no detalhamento
    expect(texto).toContain('COMPARAÇÃO ENTRE AS FONTES');
    expect(texto).toContain('Divergem');
    expect(texto).toContain('(0 × 10)');
    expect(texto).toContain('Fonte');
    expect(texto).toMatch(/Consulta\s+simples\s*\+\s*Serasa\s+Premium/); // item visto pelas duas fontes (a célula pode quebrar linha)
    // cadastro mesclado e sócios (CPF mascarado)
    expect(texto).toContain('Exemplo Atacado');
    expect(texto).toContain('Maria Exemplo da Silva');
    expect(texto).toContain('***.468.126-**');
    expect(texto).not.toContain('11146812612');
    // zero redundância
    expect(texto.match(/COMERCIAL EXEMPLO LTDA/g)).toHaveLength(1);
    expect(texto.match(/11\.222\.333\/0001-81/g)).toHaveLength(1);
    expect(texto.match(/Relatório de Análise de Crédito — Sal Vita/g)).toHaveLength(1);
    expect(texto).toContain('Consultado por Usuário de Teste');
    expect(texto).not.toContain('Outras informações da fonte'); // anexo bruto só no PDF individual
  });

  it('Serasa sem score: o PDF diz "não calculado" e não inventa número', async () => {
    const c = consolidarRelatorios([itemBoaVista(), itemSerasa(serasaSemScore)], AGORA);
    const texto = extrairTexto(await gerarPdfCreditoConsolidado(c, { consultadoPor: null }));
    expect(texto).toContain('não calculado');
    expect(texto).toContain('Serasa Premium: score não calculado');
    expect(texto).not.toContain('710');
  });
});
