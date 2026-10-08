import { describe, it, expect } from 'vitest';
import {
  APROVACAO_VALIDADE_MS, aprovacaoValida, avaliarSnapshot, camposFaltantes, canonico, cnpjValido, hashPedido, hashSnapshot,
  motivoAprovacaoInvalida, normalizarCnpj, podeTransitar, validarSnapshot, type CadastroAprovavel, type PedidoParaHash,
} from '../server/lib/smbiCadastro';
import { CADASTRO_ESTADOS, type CadastroSnapshotV1 } from '../shared/smbiCadastro';

const CNPJ_A = '11222333000181';
const CNPJ_B = '11444777000161';

export const snapshotBase = (over: Partial<CadastroSnapshotV1> = {}): CadastroSnapshotV1 => ({
  versao: 1, cnpj: CNPJ_A, razaoSocial: 'EMPRESA TESTE LTDA', fantasia: 'TESTE', ie: '123456789', situacaoCadastral: 'ATIVA', ieAtiva: true,
  endereco: { logradouro: 'RUA A', numero: '10', complemento: '', bairro: 'CENTRO', municipio: 'MOSSORO', uf: 'RN', cep: '59600000', municipioIbge: '2408003' },
  tipoTributacao: 'tipo_2', contato: 'Maria', telefone: '84999990000', celular: null, email: 'a@b.com', emailFinanceiro: null,
  representanteDoc: '52998224725', comissaoClientePct: null,
  origens: { tipoTributacao: 'FISCAL_SMBI', contato: 'CRM_CONFIRMADO', telefone: 'CRM_CONFIRMADO', email: 'CRM_CONFIRMADO', representanteDoc: 'TARCYO_CONFIRMADO' },
  ...over,
});

const T0 = new Date('2026-10-08T12:00:00.000Z');
const aprovado = (over: Partial<CadastroAprovavel> = {}): CadastroAprovavel => {
  const snapshot = snapshotBase();
  return {
    cnpj: CNPJ_A, estado: 'APROVADO', revisao: 3, snapshot, snapshotHash: hashSnapshot(snapshot), pedidoHash: 'p'.repeat(64),
    aprovadoPorId: 1, aprovadoEm: T0, aprovacaoExpiraEm: new Date(T0.getTime() + APROVACAO_VALIDADE_MS), ...over,
  };
};
const depois = (ms: number) => new Date(T0.getTime() + ms);

describe('CNPJ', () => {
  it('valida dígitos verificadores e nunca corrige token inválido', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false); // 13 dígitos: não completa com zero
    expect(normalizarCnpj('1122233300018x')).toBeNull();
    expect(normalizarCnpj('11.222.333/0001-81')).toBe(CNPJ_A);
  });
  it('snapshot com CNPJ inválido é rejeitado', () => {
    expect(validarSnapshot(snapshotBase({ cnpj: '11222333000182' })).ok).toBe(false);
    expect(validarSnapshot(snapshotBase()).ok).toBe(true);
  });
  it('snapshot strict: campo extra é rejeitado', () => {
    expect(validarSnapshot({ ...snapshotBase(), extra: 1 }).ok).toBe(false);
  });
});

describe('serialização canônica e hashes', () => {
  it('é determinística independente da ordem das chaves', () => {
    expect(canonico({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe(canonico({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(() => canonico({ a: NaN })).toThrow();
  });
  it('hash do snapshot muda com qualquer campo e não com a ordem', () => {
    const s = snapshotBase();
    const reordenado = Object.fromEntries(Object.entries(s).reverse()) as unknown as CadastroSnapshotV1;
    expect(hashSnapshot(reordenado)).toBe(hashSnapshot(s));
    expect(hashSnapshot(snapshotBase({ razaoSocial: 'OUTRA' }))).not.toBe(hashSnapshot(s));
  });
  const pedido = (over: Partial<PedidoParaHash> = {}): PedidoParaHash => ({
    id: 'p1', taskId: 7, sellerId: 2, sellerName: 'Ana', cnpj: '11.222.333/0001-81', clienteNome: 'X', razaoSocial: 'X', cidade: 'M', uf: 'RN',
    comissaoPct: 3, itens: [{ produtoId: 'a', descricao: 'SAL', quantidade: 10, pesoKg: 25, valorUnitario: 5 }],
    prazoPagamentoSal: '30', prazoPagamentoFrete: '30', smbiCondpagSalCod: '1', smbiCondpagFreteCod: '1', valorFretePorUnidade: 1, ...over,
  });
  it('hash do pedido cobre itens, valores, cliente, representante e prazos', () => {
    const h = hashPedido(pedido());
    expect(hashPedido(pedido({ cnpj: CNPJ_A }))).toBe(h); // pontuação não conta
    for (const mud of [
      { itens: [{ produtoId: 'a', descricao: 'SAL', quantidade: 11, pesoKg: 25, valorUnitario: 5 }] },
      { valorFretePorUnidade: 2 }, { sellerId: 3 }, { prazoPagamentoSal: '60' }, { cnpj: CNPJ_B }, { smbiCondpagFreteCod: '2' },
    ]) expect(hashPedido(pedido(mud))).not.toBe(h);
  });
});

describe('máquina de estados', () => {
  it('INCERTO → CADASTRANDO é proibido (e INCERTO nunca volta a escrever)', () => {
    expect(podeTransitar('INCERTO', 'CADASTRANDO')).toBe(false);
    expect(podeTransitar('INCERTO', 'PREPARANDO')).toBe(false);
    expect(podeTransitar('INCERTO', 'CONFERIDO')).toBe(true);
  });
  it('só APROVADO chega a CADASTRANDO; CONFERIDO é terminal', () => {
    const origens = CADASTRO_ESTADOS.filter((e) => podeTransitar(e, 'CADASTRANDO'));
    expect(origens).toEqual(['APROVADO']);
    expect(CADASTRO_ESTADOS.some((e) => podeTransitar('CONFERIDO', e))).toBe(false);
    expect(podeTransitar('PREPARANDO', 'APROVADO')).toBe(false);
  });
});

describe('aprovacaoValida', () => {
  it('vale dentro de 24 h, com revisão/hashes/CNPJ iguais', () => {
    const c = aprovado();
    expect(aprovacaoValida(c, depois(60_000), { cnpj: CNPJ_A, revisao: 3, snapshotHash: c.snapshotHash!, pedidoHash: c.pedidoHash! })).toBe(true);
  });
  it('aprovação de revisão antiga é rejeitada', () => {
    expect(motivoAprovacaoInvalida(aprovado({ revisao: 4 }), depois(1000), { revisao: 3 })).toBe('REVISAO_DIFERENTE');
  });
  it('hash adulterado é rejeitado (esperado e gravado)', () => {
    const c = aprovado();
    expect(motivoAprovacaoInvalida(c, depois(1000), { snapshotHash: 'f'.repeat(64) })).toBe('SNAPSHOT_HASH_DIFERENTE');
    expect(motivoAprovacaoInvalida({ ...c, snapshotHash: 'f'.repeat(64) }, depois(1000))).toBe('SNAPSHOT_ALTERADO');
    expect(motivoAprovacaoInvalida(c, depois(1000), { pedidoHash: 'x'.repeat(64) })).toBe('PEDIDO_HASH_DIFERENTE');
  });
  it('snapshot alterado invalida a aprovação', () => {
    const c = aprovado();
    expect(aprovacaoValida({ ...c, snapshot: snapshotBase({ telefone: '84988887777' }) }, depois(1000))).toBe(false);
  });
  it('aprovação de um CNPJ não vale para outro (C24)', () => {
    const c = aprovado();
    expect(motivoAprovacaoInvalida(c, depois(1000), { cnpj: CNPJ_B })).toBe('CNPJ_DIFERENTE');
    expect(motivoAprovacaoInvalida({ ...c, cnpj: CNPJ_B }, depois(1000))).toBe('CNPJ_DIFERENTE'); // snapshot é do A
  });
  it('expira em 24 h', () => {
    const c = aprovado();
    expect(aprovacaoValida(c, depois(APROVACAO_VALIDADE_MS - 1))).toBe(true);
    expect(motivoAprovacaoInvalida(c, depois(APROVACAO_VALIDADE_MS))).toBe('APROVACAO_EXPIRADA');
  });
  it('validade gravada acima de 24 h é recusada; sem ator humano não vale', () => {
    expect(aprovacaoValida(aprovado({ aprovacaoExpiraEm: depois(APROVACAO_VALIDADE_MS + 1000) }), depois(1))).toBe(false);
    expect(motivoAprovacaoInvalida(aprovado({ aprovadoPorId: null }), depois(1))).toBe('SEM_APROVACAO');
    expect(motivoAprovacaoInvalida(aprovado({ estado: 'AGUARDANDO_APROVACAO' }), depois(1))).toBe('ESTADO_NAO_APROVADO');
  });
});

describe('campos faltantes e bloqueios (sem defaults fiscais)', () => {
  it('snapshot completo não tem faltantes nem bloqueios', () => {
    expect(avaliarSnapshot(snapshotBase())).toEqual({ camposFaltantes: [], bloqueios: [] });
  });
  it('número ausente é campo faltante; S/N só vale se confirmado', () => {
    const e = snapshotBase().endereco;
    expect(camposFaltantes(snapshotBase({ endereco: { ...e, numero: null } }))).toContain('endereco.numero');
    expect(camposFaltantes(snapshotBase({ endereco: { ...e, numero: '' } }))).toContain('endereco.numero');
    expect(camposFaltantes(snapshotBase({ endereco: { ...e, numero: 'S/N' } }))).toContain('endereco.numero');
    const conf = snapshotBase({ endereco: { ...e, numero: 'S/N' }, origens: { ...snapshotBase().origens, 'endereco.numero': 'TARCYO_CONFIRMADO' } });
    expect(camposFaltantes(conf)).not.toContain('endereco.numero');
  });
  it('regime sem fonte (ou sem origem) bloqueia; nunca assume tipo_1', () => {
    expect(avaliarSnapshot(snapshotBase({ tipoTributacao: null })).bloqueios).toContain('REGIME_SEM_FONTE');
    const sem = snapshotBase(); delete sem.origens.tipoTributacao;
    expect(avaliarSnapshot(sem).bloqueios).toContain('REGIME_SEM_FONTE');
  });
  it('contato sem origem é faltante; situação não ativa bloqueia', () => {
    const s = snapshotBase(); delete s.origens.telefone;
    expect(camposFaltantes(s)).toContain('origens.telefone');
    expect(avaliarSnapshot(snapshotBase({ situacaoCadastral: 'BAIXADA' })).bloqueios).toContain('SITUACAO_CADASTRAL_NAO_ATIVA');
  });
});
