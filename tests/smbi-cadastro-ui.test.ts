import { describe, expect, it } from 'vitest';
import { CADASTRO_ESTADOS, type CadastroSnapshotV1 } from '../shared/smbiCadastro';
import {
  ESTADO_UI, estadoUi, proximaAcao, podeAprovar, formatarFaltantes, rotuloCampo, linhasPrevia, listarDivergencias,
  mensagemErroCadastro, montarContatos, origensPermitidas, podeRevisarContatos, ehEstadoReconciliar, type CondicoesAprovacao,
} from '../client/src/lib/faturamento/smbiCadastroUi';

const ok: CondicoesAprovacao = {
  isAdmin: true, estado: 'AGUARDANDO_APROVACAO', camposFaltantes: [], bloqueios: [], pedidoAlterado: false, temSnapshotEHashes: true, revisaoVelha: false,
};

describe('estados', () => {
  it('todo estado tem rótulo, significado e próxima ação', () => {
    for (const e of CADASTRO_ESTADOS) {
      expect(ESTADO_UI[e].rotulo).toBeTruthy();
      expect(proximaAcao(e, true)).toBeTruthy();
      expect(proximaAcao(e, false)).toBeTruthy();
    }
  });
  it('estado desconhecido não quebra', () => expect(estadoUi('XYZ').rotulo).toBe('XYZ'));
  it('reconciliação e revisão', () => {
    expect(ehEstadoReconciliar('INCERTO')).toBe(true);
    expect(ehEstadoReconciliar('DIVERGENTE')).toBe(true);
    expect(ehEstadoReconciliar('CONFERIDO')).toBe(false);
    expect(podeRevisarContatos('APROVADO')).toBe(true);
    expect(podeRevisarContatos('CADASTRANDO')).toBe(false);
    expect(podeRevisarContatos('CONFERIDO')).toBe(false);
  });
});

describe('podeAprovar', () => {
  it('aprova só nas condições perfeitas', () => expect(podeAprovar(ok)).toEqual({ ok: true }));
  it.each<[string, Partial<CondicoesAprovacao>]>([
    ['não admin', { isAdmin: false }],
    ['estado errado', { estado: 'APROVADO' }],
    ['sem prévia', { temSnapshotEHashes: false }],
    ['tela velha', { revisaoVelha: true }],
    ['pedido alterado', { pedidoAlterado: true }],
    ['campos faltantes', { camposFaltantes: ['ie'] }],
    ['bloqueio', { bloqueios: ['REGIME_SEM_FONTE'] }],
  ])('recusa: %s', (_n, o) => {
    const r = podeAprovar({ ...ok, ...o });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.length).toBeGreaterThan(0);
  });
});

describe('campos', () => {
  it('formata faltantes', () => {
    expect(formatarFaltantes([])).toBe('');
    expect(formatarFaltantes(['endereco.numero', 'email', 'origens.telefone'])).toBe(
      'Faltam: Endereço: número, E-mail, Origem de "Telefone (ou celular)" não informada',
    );
    expect(rotuloCampo('campoNovo')).toBe('campoNovo');
  });
  const snap = {
    versao: 1, cnpj: '11222333000181', razaoSocial: 'ACME', fantasia: '', ie: null, situacaoCadastral: 'ATIVA', ieAtiva: null,
    endereco: { logradouro: 'Rua A', numero: null, complemento: '', bairro: 'Centro', municipio: 'Mossoró', uf: 'RN', cep: '59600000', municipioIbge: '2408003' },
    tipoTributacao: null, contato: null, telefone: '84999990000', celular: null, email: null, emailFinanceiro: null,
    representanteDoc: null, comissaoClientePct: null,
    origens: { telefone: 'CRM_CONFIRMADO', ie: 'FISCAL_SMBI' },
  } satisfies CadastroSnapshotV1;
  it('linhas da prévia não preenchem default e marcam faltantes/origem', () => {
    const l = linhasPrevia(snap, ['ie', 'endereco.numero']);
    const por = Object.fromEntries(l.map((x) => [x.chave, x]));
    expect(por.ie).toMatchObject({ valor: 'não informado', faltante: true, origem: 'FISCAL_SMBI' });
    expect(por.endereco.faltante).toBe(true);
    expect(por.endereco.valor).toContain('Rua A');
    expect(por.tipoTributacao.valor).toBe('não informado');
    expect(por.telefone).toMatchObject({ origem: 'CRM_CONFIRMADO', faltante: false });
  });
  it('divergências: só lista vira linhas', () => {
    expect(listarDivergencias({ camposFaltantes: [] })).toEqual([]);
    expect(listarDivergencias([{ campo: 'ie', esperado: '1', lido: null }])).toEqual([{ campo: 'Inscrição estadual', esperado: '1', lido: '—' }]);
  });
});

describe('erros do servidor', () => {
  it('traduz códigos e pede recarga quando preciso', () => {
    expect(mensagemErroCadastro(new Error('telefone: sem vínculo [CONTATO_AMBIGUO]')).mensagem).toContain('mesmo CNPJ');
    const r = mensagemErroCadastro(new Error('O pedido mudou desde que você o viu. Recarregue. [PEDIDO_ALTERADO]'));
    expect(r.recarregar).toBe(true);
    expect(r.mensagem).toContain('Recarregue');
  });
  it('mantém a mensagem do servidor quando não há tradução e esconde JSON de validação', () => {
    expect(mensagemErroCadastro(new Error('telefone: informe DDD + número [VALOR_INVALIDO]')).mensagem).toBe('telefone: informe DDD + número');
    expect(mensagemErroCadastro(new Error('[{"code":"invalid_type","path":["x"]}]')).mensagem).toMatch(/inválidos/);
    expect(mensagemErroCadastro(null).mensagem).toMatch(/inválidos/);
  });
});

describe('contatos', () => {
  it('origens: staff comum só CRM_CONFIRMADO', () => {
    expect(origensPermitidas(false)).toEqual(['CRM_CONFIRMADO']);
    expect(origensPermitidas(true)).toContain('TARCYO_CONFIRMADO');
  });
  it('envia só campos mexidos e preenchidos; rebaixa origem de não admin', () => {
    const r = montarContatos(
      { telefone: ' 84999990000 ', email: '', contato: 'Ana' },
      { telefone: 'TARCYO_CONFIRMADO', contato: 'TARCYO_CONFIRMADO' },
      false,
    );
    expect(r).toEqual({
      telefone: { valor: '84999990000', origem: 'CRM_CONFIRMADO' },
      contato: { valor: 'Ana', origem: 'CRM_CONFIRMADO' },
    });
    expect(montarContatos({ contato: 'Ana' }, { contato: 'TARCYO_CONFIRMADO' }, true).contato?.origem).toBe('TARCYO_CONFIRMADO');
  });
});
