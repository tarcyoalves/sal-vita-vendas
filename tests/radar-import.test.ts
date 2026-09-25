import { describe, it, expect } from 'vitest';
import {
  parseReceitaLine,
  lineMightMatchCnaes,
  extractFirstQuotedField,
  buildPhone,
  normalizeEmail,
  normalizeDate,
  buildEndereco,
  computeCnaesAlvo,
  parseEstabelecimento,
  parseEmpresa,
  createPass1Accumulator,
  createPass2Accumulator,
  mergeEstabelecimentosComEmpresas,
} from '../server/lib/radar/receitaParse';
import { RADAR_ALL_CNAES } from '../shared/radar';

// ── Helpers de fixture: montam uma linha no formato quotado da Receita a partir de
// campos nomeados, com valores padrão válidos (situação ativa, UF/CNAE/SIAFI batendo
// com um município real), para cada teste sobrescrever só o que importa.

function quoteLine(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(';');
}

interface EstabInput {
  cnpjBasico?: string;
  cnpjOrdem?: string;
  cnpjDv?: string;
  matrizFilial?: string;
  nomeFantasia?: string;
  situacao?: string;
  dataSituacao?: string;
  motivoSituacao?: string;
  cidadeExterior?: string;
  pais?: string;
  dataInicio?: string;
  cnaePrincipal?: string;
  cnaeSecundaria?: string;
  tipoLogradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  siafi?: string;
  ddd1?: string;
  telefone1?: string;
  ddd2?: string;
  telefone2?: string;
  dddFax?: string;
  fax?: string;
  email?: string;
  situacaoEspecial?: string;
  dataSituacaoEspecial?: string;
}

function estabLine(input: EstabInput = {}): string {
  const f: Required<EstabInput> = {
    cnpjBasico: '12345678',
    cnpjOrdem: '0001',
    cnpjDv: '88',
    matrizFilial: '1',
    nomeFantasia: 'LATICINIO TESTE',
    situacao: '02',
    dataSituacao: '20200101',
    motivoSituacao: '00',
    cidadeExterior: '',
    pais: '',
    dataInicio: '20200115',
    cnaePrincipal: '1052000', // laticínio — CNAE-alvo
    cnaeSecundaria: '',
    tipoLogradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '123',
    complemento: 'FUNDOS',
    bairro: 'CENTRO',
    cep: '85750-000',
    uf: 'PR',
    siafi: '7449', // Barracão/PR, IBGE 4102604
    ddd1: '46',
    telefone1: '35441234',
    ddd2: '',
    telefone2: '',
    dddFax: '',
    fax: '',
    email: 'contato@teste.com.br',
    situacaoEspecial: '',
    dataSituacaoEspecial: '',
    ...input,
  };
  return quoteLine([
    f.cnpjBasico, f.cnpjOrdem, f.cnpjDv, f.matrizFilial, f.nomeFantasia, f.situacao,
    f.dataSituacao, f.motivoSituacao, f.cidadeExterior, f.pais, f.dataInicio,
    f.cnaePrincipal, f.cnaeSecundaria, f.tipoLogradouro, f.logradouro, f.numero,
    f.complemento, f.bairro, f.cep, f.uf, f.siafi, f.ddd1, f.telefone1, f.ddd2,
    f.telefone2, f.dddFax, f.fax, f.email, f.situacaoEspecial, f.dataSituacaoEspecial,
  ]);
}

interface EmpresaInput {
  cnpjBasico?: string;
  razaoSocial?: string;
  naturezaJuridica?: string;
  qualificacao?: string;
  capitalSocial?: string;
  porte?: string;
  enteFederativo?: string;
}

function empresaLine(input: EmpresaInput = {}): string {
  const f: Required<EmpresaInput> = {
    cnpjBasico: '12345678',
    razaoSocial: 'LATICINIO TESTE LTDA',
    naturezaJuridica: '2062',
    qualificacao: '49',
    capitalSocial: '10000,00',
    porte: '03',
    enteFederativo: '',
    ...input,
  };
  return quoteLine([
    f.cnpjBasico, f.razaoSocial, f.naturezaJuridica, f.qualificacao, f.capitalSocial, f.porte, f.enteFederativo,
  ]);
}

describe('parseReceitaLine', () => {
  it('separa campos quotados por ; e remove as aspas', () => {
    expect(parseReceitaLine('"12345678";"0001";"88"')).toEqual(['12345678', '0001', '88']);
  });

  it('trata aspas dobradas como uma aspa literal dentro do campo', () => {
    const line = '"12345678";"NOME ""FANTASIA"" LTDA";"88"';
    expect(parseReceitaLine(line)).toEqual(['12345678', 'NOME "FANTASIA" LTDA', '88']);
  });

  it('aceita campo vazio entre aspas', () => {
    expect(parseReceitaLine('"12345678";"";"88"')).toEqual(['12345678', '', '88']);
  });

  it('ignora um \\r final (arquivo CRLF)', () => {
    expect(parseReceitaLine('"12345678";"88"\r')).toEqual(['12345678', '88']);
  });

  it('preserva acentuação ISO-8859-1 (latin1) decodificada como o importador faz', () => {
    // Simula o caminho real: bytes latin1 no arquivo → fs.createReadStream(..., {encoding:'latin1'})
    // entrega ao Node uma string cujos code points são os bytes originais.
    const nomeOriginal = 'LATICÍNIO SÃO JOÃO LTDA - FILIAL Nº 2';
    const bytesDoArquivo = Buffer.from(nomeOriginal, 'latin1');
    const comoOImportadorLe = bytesDoArquivo.toString('latin1');
    const line = `"12345678";"${comoOImportadorLe}";"88"`;
    expect(parseReceitaLine(line)[1]).toBe(nomeOriginal);
  });
});

describe('extractFirstQuotedField', () => {
  it('extrai o primeiro campo sem fazer o parsing completo da linha', () => {
    expect(extractFirstQuotedField(empresaLine({ cnpjBasico: '00000191' }))).toBe('00000191');
  });

  it('funciona também para uma linha sem aspas (defensivo)', () => {
    expect(extractFirstQuotedField('00000191;RAZAO SOCIAL')).toBe('00000191');
  });
});

describe('normalização de campos', () => {
  it('telefone: junta DDD + número, só dígitos, descarta se tiver menos de 10', () => {
    expect(buildPhone('46', '3544-1234')).toBe('4635441234');
    expect(buildPhone('46', '123')).toBeNull();
    expect(buildPhone('', '')).toBeNull();
    expect(buildPhone(undefined, undefined)).toBeNull();
  });

  it('e-mail: trim + minúsculas; null se não parecer um e-mail', () => {
    expect(normalizeEmail('  Contato@Teste.COM.BR ')).toBe('contato@teste.com.br');
    expect(normalizeEmail('não é email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it('data: YYYYMMDD vira YYYY-MM-DD; 0/00000000/vazio/mês ou dia zerado viram null', () => {
    expect(normalizeDate('20200115')).toBe('2020-01-15');
    expect(normalizeDate('0')).toBeNull();
    expect(normalizeDate('00000000')).toBeNull();
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('20200000')).toBeNull();
    expect(normalizeDate('20200100')).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });

  it('endereço: junta as partes existentes numa linha legível, pula as vazias', () => {
    expect(buildEndereco('RUA', 'DAS FLORES', '123', 'FUNDOS', 'CENTRO')).toBe('RUA DAS FLORES, 123, FUNDOS - CENTRO');
    expect(buildEndereco('AV', 'BRASIL', '', '', 'CENTRO')).toBe('AV BRASIL - CENTRO');
    expect(buildEndereco('', '', '', '', '')).toBeNull();
    expect(buildEndereco(null, null, '456', null, null)).toBe('456');
  });

  it('cnaesAlvo: principal primeiro, sem repetir, só os que estão na lista-alvo', () => {
    expect(computeCnaesAlvo('1052000', '1011201,1052000,9999999', RADAR_ALL_CNAES)).toEqual(['1052000', '1011201']);
    expect(computeCnaesAlvo('9999999', '', RADAR_ALL_CNAES)).toEqual([]);
    expect(computeCnaesAlvo('9999999', '1011201', RADAR_ALL_CNAES)).toEqual(['1011201']);
  });
});

describe('lineMightMatchCnaes (pré-filtro)', () => {
  it('aceita uma linha cujo CNAE principal é alvo', () => {
    expect(lineMightMatchCnaes(estabLine())).toBe(true);
  });

  it('rejeita uma linha sem nenhum CNAE-alvo em lugar nenhum', () => {
    const line = estabLine({ cnaePrincipal: '4711301', cnaeSecundaria: '9999999,8888888' });
    expect(lineMightMatchCnaes(line)).toBe(false);
  });

  it('nunca rejeita uma linha que o parser completo aceitaria', () => {
    const linhasValidas = [
      estabLine(),
      estabLine({ cnaePrincipal: '4711301', cnaeSecundaria: '1011201' }), // casa só pelo secundário
      estabLine({ cnaePrincipal: '4789004' }), // outro segmento-alvo
      estabLine({ cnaePrincipal: '4623109', cnaeSecundaria: '1052000,4639701' }),
    ];
    for (const line of linhasValidas) {
      const result = parseEstabelecimento(parseReceitaLine(line), { ufs: new Set(['PR']) });
      expect(result.ok).toBe(true);
      expect(lineMightMatchCnaes(line)).toBe(true);
    }
  });
});

describe('parseEstabelecimento', () => {
  const ufsPR = new Set(['PR']);

  it('aceita um estabelecimento ativo, na UF pedida, com CNAE principal alvo', () => {
    const result = parseEstabelecimento(parseReceitaLine(estabLine()), { ufs: ufsPR });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual({
      cnpjBasico: '12345678',
      cnpj: '12345678000188',
      cnaePrincipal: '1052000',
      cnaesAlvo: ['1052000'],
      municipioIbge: 4102604, // Barracão/PR
      uf: 'PR',
      endereco: 'RUA DAS FLORES, 123, FUNDOS - CENTRO',
      cep: '85750000',
      telefone1: '4635441234',
      telefone2: null,
      email: 'contato@teste.com.br',
      dataInicio: '2020-01-15',
      nomeFantasia: 'LATICINIO TESTE',
    });
  });

  it('descarta situação cadastral diferente de ativa (02)', () => {
    const result = parseEstabelecimento(parseReceitaLine(estabLine({ situacao: '08' })), { ufs: ufsPR });
    expect(result).toEqual({ ok: false, reason: 'situacao' });
  });

  it('descarta UF fora do conjunto pedido', () => {
    const result = parseEstabelecimento(parseReceitaLine(estabLine({ uf: 'SP' })), { ufs: ufsPR });
    expect(result).toEqual({ ok: false, reason: 'uf' });
  });

  it('descarta quando nenhum CNAE (principal ou secundário) é alvo', () => {
    const result = parseEstabelecimento(
      parseReceitaLine(estabLine({ cnaePrincipal: '4711301', cnaeSecundaria: '9999999' })),
      { ufs: ufsPR },
    );
    expect(result).toEqual({ ok: false, reason: 'cnae' });
  });

  it('casa por CNAE secundário quando o principal não é alvo, e cnaesAlvo reflete isso', () => {
    const result = parseEstabelecimento(
      parseReceitaLine(estabLine({ cnaePrincipal: '4711301', cnaeSecundaria: '9999999,1011201' })),
      { ufs: ufsPR },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.cnaePrincipal).toBe('4711301');
    expect(result.row.cnaesAlvo).toEqual(['1011201']);
  });

  it('mapeia o código SIAFI da Receita para o IBGE (Barracão/PR = SIAFI 7449 = IBGE 4102604)', () => {
    const result = parseEstabelecimento(parseReceitaLine(estabLine({ siafi: '7449', uf: 'PR' })), { ufs: ufsPR });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.municipioIbge).toBe(4102604);
  });

  it('descarta SIAFI sem município mapeado', () => {
    const result = parseEstabelecimento(parseReceitaLine(estabLine({ siafi: '0000' })), { ufs: ufsPR });
    expect(result).toEqual({ ok: false, reason: 'siafi_nao_mapeado' });
  });

  it('descarta linha com poucos campos', () => {
    const result = parseEstabelecimento(['12345678', '0001'], { ufs: ufsPR });
    expect(result).toEqual({ ok: false, reason: 'campos_insuficientes' });
  });
});

describe('parseEmpresa', () => {
  it('extrai CNPJ básico, razão social e porte', () => {
    expect(parseEmpresa(parseReceitaLine(empresaLine()))).toEqual({
      cnpjBasico: '12345678',
      razaoSocial: 'LATICINIO TESTE LTDA',
      porte: '03',
    });
  });

  it('porte "00" (não informado) é mantido, não vira null', () => {
    expect(parseEmpresa(parseReceitaLine(empresaLine({ porte: '00' })))?.porte).toBe('00');
  });

  it('retorna null sem razão social', () => {
    expect(parseEmpresa(parseReceitaLine(empresaLine({ razaoSocial: '' })))).toBeNull();
  });

  it('retorna null com poucos campos', () => {
    expect(parseEmpresa(['12345678'])).toBeNull();
  });
});

describe('passo 1 + passo 2, fim a fim (sem banco)', () => {
  it('agrega estabelecimentos, casa com empresas e monta as linhas finais para gravar', () => {
    const linhasEstab = [
      // Duas filiais do mesmo CNPJ básico, ambas válidas (PR, laticínio).
      estabLine({ cnpjBasico: '11111111', cnpjOrdem: '0001', nomeFantasia: 'LATICINIO A MATRIZ', uf: 'PR', siafi: '7449' }),
      estabLine({ cnpjBasico: '11111111', cnpjOrdem: '0002', matrizFilial: '2', nomeFantasia: 'LATICINIO A FILIAL', uf: 'PR', siafi: '7449' }),
      // Um frigorífico em SC, casado só pelo CNAE secundário, sem Empresas correspondente.
      estabLine({
        cnpjBasico: '22222222', nomeFantasia: 'FRIGORIFICO B', uf: 'SC', siafi: '8097', // Dionísio Cerqueira/SC
        cnaePrincipal: '4711301', cnaeSecundaria: '1011201',
      }),
      // Descartada: CNAE fora da lista-alvo. O nome fantasia carrega, de propósito, um
      // trecho igual a um CNAE-alvo (1052000) num campo que não é CNAE — isso faz a
      // linha passar no pré-filtro (generoso) mas ainda assim ser rejeitada pelo parser
      // completo, que olha só os campos de CNAE de verdade.
      estabLine({
        cnpjBasico: '33333333', nomeFantasia: 'FORA DO CNAE (ref. 1052000)', uf: 'PR',
        cnaePrincipal: '4711301', cnaeSecundaria: '',
      }),
      // Descartada: UF fora do conjunto pedido.
      estabLine({ cnpjBasico: '44444444', nomeFantasia: 'FORA DA UF', uf: 'SP' }),
      // Descartada: situação inativa (baixada).
      estabLine({ cnpjBasico: '55555555', nomeFantasia: 'BAIXADA', uf: 'PR', situacao: '08' }),
    ];
    const linhasEmpresa = [
      empresaLine({ cnpjBasico: '11111111', razaoSocial: 'LATICINIO A LTDA', porte: '03' }),
      // 22222222 de propósito não tem linha em Empresas.
      empresaLine({ cnpjBasico: '99999999', razaoSocial: 'EMPRESA IRRELEVANTE' }), // não foi pedida pelo passo 1
    ];

    const pass1 = createPass1Accumulator({ ufs: new Set(['PR', 'SC']) });
    for (const line of linhasEstab) pass1.addLine(line);

    expect(pass1.stats.linesScanned).toBe(linhasEstab.length);
    expect(pass1.stats.kept).toBe(3); // 2 filiais de 11111111 + 22222222
    expect(pass1.stats.skipped.cnae).toBe(1);
    expect(pass1.stats.skipped.uf).toBe(1);
    expect(pass1.stats.skipped.situacao).toBe(1);
    expect(pass1.cnpjBasicos).toEqual(new Set(['11111111', '22222222']));

    const pass2 = createPass2Accumulator(pass1.cnpjBasicos);
    for (const line of linhasEmpresa) pass2.addLine(line);

    expect(pass2.stats.linesScanned).toBe(linhasEmpresa.length);
    expect(pass2.stats.matched).toBe(1); // só 11111111 tinha correspondência pedida
    expect(pass2.empresasByBasico.has('99999999')).toBe(false); // não pedido pelo passo 1 → ignorado

    const { rows, semEmpresa } = mergeEstabelecimentosComEmpresas(pass1.rows, pass2.empresasByBasico);
    expect(rows).toHaveLength(3);
    expect(semEmpresa).toBe(1);

    const filiaisA = rows.filter((r) => r.cnpjBasico === '11111111');
    expect(filiaisA).toHaveLength(2);
    for (const r of filiaisA) {
      expect(r.razaoSocial).toBe('LATICINIO A LTDA');
      expect(r.porte).toBe('03');
    }

    const frigorifico = rows.find((r) => r.cnpjBasico === '22222222');
    expect(frigorifico?.razaoSocial).toBe('FRIGORIFICO B'); // sem Empresas → usa o nome fantasia
    expect(frigorifico?.porte).toBeNull();
    expect(frigorifico?.municipioIbge).toBe(4205001); // Dionísio Cerqueira/SC
    expect(frigorifico?.cnaesAlvo).toEqual(['1011201']);
  });

  it('sem nome fantasia e sem Empresas, a razão social vira "NÃO INFORMADO"', () => {
    const pass1 = createPass1Accumulator({ ufs: new Set(['PR']) });
    pass1.addLine(estabLine({ cnpjBasico: '66666666', nomeFantasia: '', uf: 'PR' }));
    const pass2 = createPass2Accumulator(pass1.cnpjBasicos);
    // nenhuma linha de Empresas processada de propósito

    const { rows, semEmpresa } = mergeEstabelecimentosComEmpresas(pass1.rows, pass2.empresasByBasico);
    expect(semEmpresa).toBe(1);
    expect(rows[0].razaoSocial).toBe('NÃO INFORMADO');
  });
});
