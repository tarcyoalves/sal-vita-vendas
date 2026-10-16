import { describe, expect, it } from 'vitest';
import {
  dataHoraBR, estadoSemaforo, mostrarAvisoCreditoReprovado, motivoConsultaValido, pedidoLiberado, permissoesCredito,
  podeMostrarLiberar, prazoEhAVista, rotuloOrigemVinculo, textoCustoConsulta, textoLiberacao, vaiReaproveitar,
} from '../client/src/lib/credito/regras';
import { base64ParaBytes, nomeArquivoPdf, pareceUmPdf } from '../client/src/lib/credito/arquivo';
import {
  documentosParaSemaforos, formatarDocumento, mascararDocumentoDigitando, mascararDocumentoSocio, validarDocumentoLocal,
} from '../client/src/lib/credito/documento';
import { FILTROS_VAZIOS, dataDoFiltro, entradaListar, filtrosAtivos, periodoInvertido, totalPaginas } from '../client/src/lib/credito/filtros';
import { semCamposEmpresa } from '../client/src/lib/faturamento/smbiEmpresaUi';

describe('permissões por papel', () => {
  it('atendente: só leitura do card', () => {
    expect(permissoesCredito('user')).toEqual({ verCard: true, verRelatorio: false, baixarPdf: false, verPagina: false, consultar: false, administrar: false });
  });
  it('gerente: página, relatório e PDF, mas não consulta', () => {
    expect(permissoesCredito('manager')).toMatchObject({ verPagina: true, verRelatorio: true, baixarPdf: true, consultar: false, administrar: false });
  });
  it('admin: tudo', () => {
    expect(permissoesCredito('admin')).toMatchObject({ verPagina: true, baixarPdf: true, consultar: true, administrar: true });
  });
  it('sem papel: nada', () => {
    expect(permissoesCredito(undefined).verCard).toBe(false);
  });
});

describe('semáforo', () => {
  it('cores por veredito, cinza sem análise ou vencida', () => {
    expect(estadoSemaforo({ veredito: 'APROVADO', valido: true }).cor).toBe('VERDE');
    expect(estadoSemaforo({ veredito: 'COM_RESTRICAO', valido: true }).cor).toBe('AMARELO');
    expect(estadoSemaforo({ veredito: 'REPROVADO_A_PRAZO', valido: true }).cor).toBe('VERMELHO');
    expect(estadoSemaforo(null).cor).toBe('CINZA');
    const v = estadoSemaforo({ veredito: 'APROVADO', valido: false });
    expect(v.cor).toBe('CINZA');
    expect(v.rotulo).toContain('vencida');
  });
  it('simulado aparece no texto', () => {
    expect(estadoSemaforo({ veredito: 'APROVADO', valido: true, simulado: true }).rotulo).toContain('SIMULAÇÃO');
  });
});

describe('origem do vínculo', () => {
  it('rótulos traduzidos', () => {
    expect(rotuloOrigemVinculo('CONSULTA_NO_PEDIDO')).toBe('Consulta feita no pedido');
    expect(rotuloOrigemVinculo('ENVIO_SMBI')).toBe('Vigente no envio ao SMBI');
    expect(rotuloOrigemVinculo('MANUAL')).toBe('Vinculado manualmente');
    expect(rotuloOrigemVinculo(null)).toBe('Não vinculado');
    expect(rotuloOrigemVinculo('XYZ')).toBe('Origem não identificada');
  });
});

describe('aviso e liberação do pedido', () => {
  const base = { veredito: 'REPROVADO_A_PRAZO' as const, valido: true };
  it('avisa só com reprovado + válido + prazo diferente de à vista', () => {
    expect(mostrarAvisoCreditoReprovado({ ...base, prazoSal: '30 DIAS' })).toBe(true);
    expect(mostrarAvisoCreditoReprovado({ ...base, prazoSal: '' })).toBe(true); // igual ao servidor
    expect(mostrarAvisoCreditoReprovado({ ...base, prazoSal: 'À vista' })).toBe(false);
    expect(mostrarAvisoCreditoReprovado({ ...base, prazoSal: 'A VISTA' })).toBe(false);
    expect(mostrarAvisoCreditoReprovado({ ...base, valido: false, prazoSal: '30' })).toBe(false);
    expect(mostrarAvisoCreditoReprovado({ veredito: 'COM_RESTRICAO', valido: true, prazoSal: '30' })).toBe(false);
    expect(mostrarAvisoCreditoReprovado({ veredito: undefined, valido: undefined, prazoSal: '30' })).toBe(false);
  });
  it('prazoEhAVista', () => {
    expect(prazoEhAVista('à vista')).toBe(true);
    expect(prazoEhAVista('30/45')).toBe(false);
  });
  it('botão liberar: só admin, com aviso e sem liberação prévia', () => {
    expect(podeMostrarLiberar({ admin: true, avisoVisivel: true, liberado: false })).toBe(true);
    expect(podeMostrarLiberar({ admin: false, avisoVisivel: true, liberado: false })).toBe(false);
    expect(podeMostrarLiberar({ admin: true, avisoVisivel: false, liberado: false })).toBe(false);
    expect(podeMostrarLiberar({ admin: true, avisoVisivel: true, liberado: true })).toBe(false);
  });
  it('texto "Liberado por X em data — motivo"', () => {
    expect(textoLiberacao({})).toBeNull();
    expect(pedidoLiberado({ creditoLiberadoEm: null })).toBe(false);
    const t = textoLiberacao({ creditoLiberadoPor: 'Tarcyo', creditoLiberadoEm: '2026-10-15T14:32:00.000Z', creditoLiberadoMotivo: 'Cliente antigo, pagou tudo' });
    expect(t).toBe('Liberado por Tarcyo em 15/10/2026 11:32 — Cliente antigo, pagou tudo');
    expect(dataHoraBR('lixo')).toBe('--');
  });
  it('campos de liberação não são reenviados no upsert do pedido', () => {
    const p = semCamposEmpresa({ id: 'a', creditoLiberadoPor: 'x', creditoLiberadoEm: 'y', creditoLiberadoMotivo: 'z', cnpj: '1' });
    expect(p).toEqual({ id: 'a', cnpj: '1' });
  });
});

describe('consulta', () => {
  it('motivo precisa de 5 a 300 caracteres (sem espaços nas pontas)', () => {
    expect(motivoConsultaValido('  abc ')).toBe(false);
    expect(motivoConsultaValido('cliente novo')).toBe(true);
    expect(motivoConsultaValido('x'.repeat(301))).toBe(false);
  });
  it('reaproveitamento', () => {
    const ok = { valido: true, provedor: 'simulado' };
    expect(vaiReaproveitar(ok, { forcarNova: false, provedorAtual: 'simulado' })).toBe(true);
    expect(vaiReaproveitar(ok, { forcarNova: true, provedorAtual: 'simulado' })).toBe(false);
    expect(vaiReaproveitar(ok, { forcarNova: false, provedorAtual: 'boavista_apifull' })).toBe(false);
    expect(vaiReaproveitar({ ...ok, valido: false }, { forcarNova: false, provedorAtual: 'simulado' })).toBe(false);
    expect(vaiReaproveitar(null, { forcarNova: false, provedorAtual: 'simulado' })).toBe(false);
  });
  it('texto de custo', () => {
    expect(textoCustoConsulta(true)).toBe('Provedor simulado: sem custo, dados fictícios.');
    expect(textoCustoConsulta(false)).toContain('2,75');
    expect(textoCustoConsulta(false)).toContain('API Full');
  });
});

describe('arquivo PDF', () => {
  it('nome de arquivo seguro, sempre .pdf', () => {
    expect(nomeArquivoPdf('analise-credito-11222333000181-20261015.pdf')).toBe('analise-credito-11222333000181-20261015.pdf');
    expect(nomeArquivoPdf('../../etc/passwd')).toBe('-..-etc-passwd.pdf'); // sem barras: não sai da pasta de downloads
    expect(nomeArquivoPdf('a/b\\c:d.pdf')).toBe('a-b-c-d.pdf');
    expect(nomeArquivoPdf('')).toBe('analise-credito.pdf');
    expect(nomeArquivoPdf(null)).toBe('analise-credito.pdf');
  });
  it('base64 -> bytes de PDF', () => {
    const b64 = Buffer.from('%PDF-1.3\nconteudo').toString('base64');
    const bytes = base64ParaBytes(b64);
    expect(pareceUmPdf(bytes)).toBe(true);
    expect(Buffer.from(bytes).toString()).toBe('%PDF-1.3\nconteudo');
    expect(pareceUmPdf(base64ParaBytes(Buffer.from('<html>').toString('base64')))).toBe(false);
  });
});

describe('documento', () => {
  it('máscara progressiva', () => {
    expect(mascararDocumentoDigitando('111')).toBe('111');
    expect(mascararDocumentoDigitando('1114')).toBe('111.4');
    expect(mascararDocumentoDigitando('11146812612')).toBe('111.468.126-12');
    expect(mascararDocumentoDigitando('112223330001')).toBe('11.222.333/0001');
    expect(mascararDocumentoDigitando('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascararDocumentoDigitando('112223330001819999')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('validação de dígitos', () => {
    expect(validarDocumentoLocal('11.222.333/0001-81')).toEqual({ ok: true, documento: '11222333000181', tipo: 'CNPJ' });
    expect(validarDocumentoLocal('111.468.126-12')).toEqual({ ok: true, documento: '11146812612', tipo: 'CPF' });
    expect(validarDocumentoLocal('11.222.333/0001-82').ok).toBe(false);
    expect(validarDocumentoLocal('11111111111').ok).toBe(false);
    expect(validarDocumentoLocal('123').ok).toBe(false);
  });
  it('mascara CPF de sócio', () => {
    expect(mascararDocumentoSocio('11146812612')).toBe('***.468.126-**');
    expect(mascararDocumentoSocio(null)).toBe('—');
  });
  it('documentos da lista de semáforos: únicos, válidos em tamanho, ordenados, até 200', () => {
    expect(documentosParaSemaforos(['11.222.333/0001-81', '11222333000181', '', null, '123', '11146812612'])).toEqual(['11146812612', '11222333000181']);
    const muitos = Array.from({ length: 300 }, (_, i) => String(10_000_000_000_000 + i));
    expect(documentosParaSemaforos(muitos)).toHaveLength(200);
  });
});

describe('filtros do arquivo', () => {
  it('vazio vira entrada sem filtros', () => {
    expect(entradaListar(FILTROS_VAZIOS, 1)).toEqual({
      busca: undefined, uf: undefined, veredito: undefined, de: undefined, ate: undefined, pagina: 1, porPagina: 20,
    });
    expect(filtrosAtivos(FILTROS_VAZIOS)).toBe(0);
  });
  it('monta busca, UF, veredito e período (dia inteiro)', () => {
    const e = entradaListar({ busca: '  Mossoró ', uf: 'rn', veredito: 'APROVADO', de: '2026-10-01', ate: '2026-10-15' }, 3);
    expect(e).toMatchObject({ busca: 'Mossoró', uf: 'RN', veredito: 'APROVADO', pagina: 3 });
    expect(e.de).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
    expect(e.ate).toEqual(new Date(2026, 9, 15, 23, 59, 59, 999));
    expect(filtrosAtivos({ busca: 'a', uf: 'RN', veredito: '', de: '', ate: '' })).toBe(2);
  });
  it('data inválida é ignorada; período invertido é detectado', () => {
    expect(dataDoFiltro('2026-02-31', false)).toBeUndefined();
    expect(dataDoFiltro('lixo', true)).toBeUndefined();
    expect(periodoInvertido({ de: '2026-10-15', ate: '2026-10-01' })).toBe(true);
    expect(periodoInvertido({ de: '2026-10-01', ate: '2026-10-01' })).toBe(false);
    expect(periodoInvertido({ de: '', ate: '2026-10-01' })).toBe(false);
  });
  it('páginas', () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(20)).toBe(1);
    expect(totalPaginas(21)).toBe(2);
  });
});

import { dataBR as dataBRUi, mesAnoBR } from '../client/src/lib/credito/regras';
describe('datas puras não voltam um dia (fuso)', () => {
  it('2026-09-16 continua 16/09/2026 e meia-noite UTC também', () => {
    expect(dataBRUi('2026-09-16')).toBe('16/09/2026');
    expect(dataBRUi('2004-11-17T00:00:00.000Z')).toBe('17/11/2004');
  });
  it('mês/ano', () => {
    expect(mesAnoBR('2026-09-01')).toBe('Set/2026');
    expect(mesAnoBR(null)).toBe('--');
  });
});
