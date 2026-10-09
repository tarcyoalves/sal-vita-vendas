import { describe, expect, it } from 'vitest';
import {
  CAMPOS_EMPRESA_SOMENTE_LEITURA, andamentoEmpresa, abreDialogoDeEmpresa, bloqueioDeEnvio, cadastroExigeEscolha, empresaDoEnvio,
  empresaParaCsv, escritaIniciadaSemMovsai, opcoesEmpresa, rotuloEmpresa, semCamposEmpresa, textoBotaoEnvio, textoBotaoFinal,
  tituloCadastroEmpresa, vinculoExigeEscolha, AVISO_ESCRITA_INICIADA, TEXTO_NAO_HABILITADA, TEXTO_SEM_EMPRESA,
} from '../client/src/lib/faturamento/smbiEmpresaUi';
import { SMBI_EMPRESAS } from '../shared/smbiEmpresas';
import { SMBI_MOTIVO_CODIGOS, SMBI_MOTIVO_ROTULO } from '../shared/smbiEstados';
import { SMBI_MOTIVO_CURTO } from '../client/src/lib/faturamento/smbiPendencia';

const AS = '51422900000168';
const CA = '49748258000160';

describe('rótulo e andamento por empresa', () => {
  it('rotula pelo catálogo e nunca inventa empresa no legado', () => {
    expect(rotuloEmpresa({ smbiEmpresaCnpj: AS })).toBe('A S Comércio');
    expect(rotuloEmpresa({ smbiEmpresaCnpj: CA })).toBe('C Alves');
    expect(rotuloEmpresa({})).toBe(TEXTO_SEM_EMPRESA);
    expect(rotuloEmpresa({ smbiEmpresaCnpj: '12345678000195' })).toBe('Empresa fora do catálogo');
  });
  it('aguardando, criado e pendência real', () => {
    expect(andamentoEmpresa({ smbiEmpresaCnpj: CA, smbiSolicitadoEm: 'x' })).toBe('Aguardando envio — C Alves');
    expect(andamentoEmpresa({ smbiEmpresaCnpj: CA, smbiMovsaiId: '1071' })).toBe('Criado na C Alves — Pedido 1071');
    expect(andamentoEmpresa({ smbiEmpresaCnpj: AS, smbiVinculoEstado: 'CONFERIDO', smbiMovsaiId: '1', smbiVinculoMovsais: ['1', '2'] }))
      .toBe('Criado na A S Comércio — Pedido 1, 2');
    expect(andamentoEmpresa({ smbiEmpresaCnpj: CA, smbiSolicitadoEm: 'x', smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'PRAZO_SEM_CODIGO' }))
      .toBe('C Alves: Prazo sem código');
    expect(andamentoEmpresa({ smbiEmpresaCnpj: CA, smbiSolicitadoEm: 'x', smbiEstado: 'ERRO' })).toBe('C Alves: Erro ao criar no SMBI');
  });
  it('sem empresa ou sem envio: nada', () => {
    expect(andamentoEmpresa({ smbiSolicitadoEm: 'x' })).toBeNull();
    expect(andamentoEmpresa({ smbiEmpresaCnpj: AS })).toBeNull();
  });
  it('CSV', () => {
    expect(empresaParaCsv({ smbiEmpresaCnpj: AS })).toBe('A S Comércio');
    expect(empresaParaCsv({})).toBe('');
    expect(empresaParaCsv({ smbiMovsaiId: '9' })).toBe(TEXTO_SEM_EMPRESA);
  });
});

describe('escolha da empresa', () => {
  it('duas opções, C Alves desabilitada, sem pré-seleção possível', () => {
    const o = opcoesEmpresa({});
    expect(o.map((x) => x.empresa.cnpj)).toEqual(SMBI_EMPRESAS.map((e) => e.cnpj));
    expect(o[0].desabilitada).toBe(false);
    expect(o[1].desabilitada).toBe(true);
    expect(o[1].motivo).toBe(TEXTO_NAO_HABILITADA);
    expect(o[0].cnpjFormatado).toBe('51.422.900/0001-68');
    expect(empresaDoEnvio({}, null)).toBeNull();
  });
  it('vínculo/cadastro não exigem homologação', () => {
    expect(opcoesEmpresa({}, { exigeHomologada: false }).every((x) => !x.desabilitada)).toBe(true);
  });
  it('envio só para empresa habilitada; texto do botão final', () => {
    expect(empresaDoEnvio({}, CA)).toBeNull();
    expect(empresaDoEnvio({}, '12345678000195')).toBeNull();
    const e = empresaDoEnvio({}, AS);
    expect(textoBotaoFinal(e)).toBe('Enviar para A S Comércio');
    expect(textoBotaoFinal(null)).toBe('Escolha a empresa');
  });
  it('empresa travada é definitiva: ignora a escolha e bloqueia a outra', () => {
    const p = { smbiEmpresaCnpj: AS, smbiEmpresaTravadaEm: '2026-01-01T00:00:00Z' };
    expect(empresaDoEnvio(p, CA)?.cnpj).toBe(AS);
    expect(empresaDoEnvio(p, null)?.cnpj).toBe(AS);
    expect(opcoesEmpresa(p, { exigeHomologada: false }).find((x) => x.empresa.cnpj === CA)?.desabilitada).toBe(true);
  });
});

describe('interruptor e bloqueios', () => {
  it('só abre o diálogo com o interruptor ligado', () => {
    expect(abreDialogoDeEmpresa(true)).toBe(true);
    expect(abreDialogoDeEmpresa(false)).toBe(false);
    expect(abreDialogoDeEmpresa(undefined)).toBe(false);
  });
  it('escrita iniciada sem movsai: aviso e sem botão', () => {
    const p = { smbiEscritaIniciadaEm: 'x' };
    expect(escritaIniciadaSemMovsai(p)).toBe(true);
    expect(escritaIniciadaSemMovsai({ ...p, smbiMovsaiId: '1' })).toBe(false);
    expect(bloqueioDeEnvio(p, true)).toBe(AVISO_ESCRITA_INICIADA);
  });
  it('interruptor desligado e pedido com empresa: sem botão; legado segue normal', () => {
    expect(bloqueioDeEnvio({ smbiEmpresaCnpj: AS }, false)).not.toBeNull();
    expect(bloqueioDeEnvio({ smbiEmpresaCnpj: AS }, true)).toBeNull();
    expect(bloqueioDeEnvio({}, false)).toBeNull();
  });
  it('vínculo e cadastro exigem empresa só sem empresa e com interruptor ligado', () => {
    expect(vinculoExigeEscolha({}, true)).toBe(true);
    expect(vinculoExigeEscolha({ smbiEmpresaCnpj: AS }, true)).toBe(false);
    expect(vinculoExigeEscolha({}, false)).toBe(false);
    expect(cadastroExigeEscolha({}, true)).toBe(true);
  });
  it('textos do botão de envio e do cadastro', () => {
    expect(textoBotaoEnvio({})).toBe('Enviar pedido para SMBI');
    expect(textoBotaoEnvio({ smbiSolicitadoEm: 'x' })).toBe('Reenviar ao SMBI');
    expect(tituloCadastroEmpresa(CA)).toBe('Cadastro na C Alves');
    expect(tituloCadastroEmpresa(undefined)).toBeNull();
  });
});

describe('campos somente leitura', () => {
  it('semCamposEmpresa remove só os campos de empresa', () => {
    const p = {
      id: 'a', clienteNome: 'X', smbiEstado: 'PENDENTE',
      smbiEmpresaCnpj: AS, smbiSolicitacaoId: 's', smbiEmpresaTravadaEm: 't', smbiEscritaIniciadaEm: 'e', smbiEmpresaOrigem: 'ESCOLHA_ENVIO',
    };
    const r = semCamposEmpresa(p);
    for (const c of CAMPOS_EMPRESA_SOMENTE_LEITURA) expect(c in r).toBe(false);
    expect(r).toEqual({ id: 'a', clienteNome: 'X', smbiEstado: 'PENDENTE' });
    expect(p.smbiEmpresaCnpj).toBe(AS); // não muta o original
  });
});

describe('motivos novos', () => {
  it('têm rótulo curto e longo', () => {
    for (const c of ['EMPRESA_NAO_HOMOLOGADA', 'EMPRESA_DIVERGENTE', 'SOLICITACAO_OBSOLETA'] as const) {
      expect(SMBI_MOTIVO_CODIGOS).toContain(c);
      expect(SMBI_MOTIVO_CURTO[c]).toBeTruthy();
      expect(SMBI_MOTIVO_ROTULO[c]).toBeTruthy();
    }
  });
});
