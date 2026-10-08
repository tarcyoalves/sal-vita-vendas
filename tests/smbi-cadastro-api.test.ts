/**
 * Decisões PURAS das rotas /api/smbi/cadastros* e das procedures do cadastro assistido
 * (server/lib/smbiCadastroDecisoes.ts). Sem Express, sem banco, sem rede.
 */
import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../server/lib/smbi';
import { aprovacaoValida, avaliarSnapshot, hashSnapshot } from '../server/lib/smbiCadastro';
import {
  aprovarInputSchema, decidirAprovacao, decidirIniciar, decidirPrevia, decidirResultado, decidirRevisaoContatos, decidirSolicitacao,
  elegivelParaLease, leaseValido, montarTrabalho, podeLiberarPedido, podeSolicitarPrevia, reenvioBloqueadoPorCadastro,
  respostaSemTrabalho, resultadoBodySchema, validarRevisaoContatos, type Cadastro, type PedidoParaLiberar,
} from '../server/lib/smbiCadastroDecisoes';
import type { CadastroSnapshotV1 } from '../shared/smbiCadastro';

const CNPJ = '11222333000181';
const T0 = new Date('2026-10-08T12:00:00.000Z');
const em = (ms: number) => new Date(T0.getTime() + ms);
const H = (c: string) => c.repeat(64);

const snap = (over: Partial<CadastroSnapshotV1> = {}): CadastroSnapshotV1 => ({
  versao: 1, cnpj: CNPJ, razaoSocial: 'EMPRESA TESTE LTDA', fantasia: 'TESTE', ie: '123456789', situacaoCadastral: 'ATIVA', ieAtiva: true,
  endereco: { logradouro: 'RUA A', numero: '10', complemento: '', bairro: 'CENTRO', municipio: 'MOSSORO', uf: 'RN', cep: '59600000', municipioIbge: '2408003' },
  tipoTributacao: 'tipo_2', contato: 'Maria', telefone: '84999990000', celular: null, email: 'a@b.com', emailFinanceiro: null,
  representanteDoc: '52998224725', comissaoClientePct: null,
  origens: { tipoTributacao: 'FISCAL_SMBI', contato: 'CRM_CONFIRMADO', telefone: 'CRM_CONFIRMADO', email: 'CRM_CONFIRMADO', representanteDoc: 'TARCYO_CONFIRMADO' },
  ...over,
});

const linha = (over: Partial<Cadastro> = {}): Cadastro => ({
  id: '11111111-1111-4111-8111-111111111111', cnpj: CNPJ, pedidoId: 'ped1', estado: 'PREPARANDO', revisao: 1,
  snapshot: null, snapshotHash: null, pedidoHash: H('a'), contatos: null,
  aprovadoPorId: null, aprovadoPorNome: null, aprovadoEm: null, aprovacaoExpiraEm: null,
  reservaToken: 'tok-1', reservadoAte: em(10 * 60_000), tentativaIniciadaEm: null, erpClienteId: null, conferidoEm: null,
  motivoCodigo: null, divergencias: null, criadoEm: T0, atualizadoEm: T0, ...over,
});

const aprovadaLinha = (over: Partial<Cadastro> = {}): Cadastro => {
  const s = snap();
  return linha({
    estado: 'APROVADO', revisao: 2, snapshot: s, snapshotHash: hashSnapshot(s), pedidoHash: H('a'),
    aprovadoPorId: 1, aprovadoPorNome: 'Tarcyo', aprovadoEm: T0, aprovacaoExpiraEm: em(24 * 3600_000), ...over,
  });
};
const pedidoIni = { hashAtual: H('a') };

describe('autenticação e gate', () => {
  it('sem Bearer ou sem segredo configurado: recusa (falha fechado)', () => {
    expect(isAuthorized('segredo', undefined)).toBe(false);
    expect(isAuthorized('segredo', 'Bearer outro')).toBe(false);
    expect(isAuthorized(undefined, 'Bearer segredo')).toBe(false);
    expect(isAuthorized('segredo', 'Bearer segredo')).toBe(true);
  });
  it('gate desligado → 200 com trabalho null; iniciar recusa', () => {
    expect(respostaSemTrabalho(false)).toEqual({ ok: true, cadastroAtivo: false, trabalho: null });
    const d = decidirIniciar(aprovadaLinha(), { revisao: 2, snapshotHash: aprovadaLinha().snapshotHash!, pedidoHash: H('a') }, 'tok-1', H('a'), false, T0);
    expect(d).toMatchObject({ ok: false, codigo: 'GATE_DESLIGADO' });
  });
});

describe('lease', () => {
  it('lease de outro worker, vencido ou ausente não vale', () => {
    expect(leaseValido(linha(), 'tok-1', T0)).toBe(true);
    expect(leaseValido(linha(), 'tok-2', T0)).toBe(false);
    expect(leaseValido(linha(), undefined, T0)).toBe(false);
    expect(leaseValido(linha({ reservadoAte: em(-1) }), 'tok-1', T0)).toBe(false);
    expect(leaseValido(linha({ reservaToken: null }), 'tok-1', T0)).toBe(false);
  });
  it('dupla reserva: trabalho com reserva viva não é entregue de novo', () => {
    expect(elegivelParaLease(linha({ reservaToken: null, reservadoAte: null }), T0)).toBe(true);
    expect(elegivelParaLease(linha(), T0)).toBe(false);
    expect(elegivelParaLease(linha({ reservadoAte: em(-1) }), T0)).toBe(true); // vencida volta à fila
  });
  it('só PREPARANDO ou APROVADO com aprovação viva é elegível', () => {
    const livre = { reservaToken: null, reservadoAte: null };
    expect(elegivelParaLease(aprovadaLinha(livre), T0)).toBe(true);
    expect(elegivelParaLease(aprovadaLinha({ ...livre, aprovacaoExpiraEm: em(-1) }), T0)).toBe(false);
    for (const estado of ['BLOQUEADO', 'AGUARDANDO_APROVACAO', 'CADASTRANDO', 'INCERTO', 'CONFERIDO', 'DIVERGENTE', 'INVALIDADO'] as const) {
      expect(elegivelParaLease(linha({ ...livre, estado }), T0)).toBe(false);
    }
  });
  it('a releitura (GET /:id) e a simulação nunca expõem o token', () => {
    expect(montarTrabalho(linha(), false)).not.toHaveProperty('reservaToken');
    expect(montarTrabalho(linha(), true)).toHaveProperty('reservaToken', 'tok-1');
    expect(montarTrabalho(aprovadaLinha(), false).fase).toBe('CADASTRO');
    expect(montarTrabalho(linha(), false).fase).toBe('PREVIA');
  });
});

describe('POST previa', () => {
  const ok = () => decidirPrevia(linha(), { revisao: 1, snapshot: snap() }, 'tok-1', H('b'), T0);
  it('snapshot completo → AGUARDANDO_APROVACAO, hash e pedidoHash do servidor, lease liberado', () => {
    const d = ok();
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.patch.estado).toBe('AGUARDANDO_APROVACAO');
      expect(d.patch.snapshotHash).toBe(hashSnapshot(d.patch.snapshot!));
      expect(d.patch.pedidoHash).toBe(H('b'));
      expect(d.patch.reservaToken).toBeNull();
      expect(d.patch.revisao).toBe(1);
    }
  });
  it('regime sem fonte ou número ausente → BLOQUEADO (nunca assume)', () => {
    const d = decidirPrevia(linha(), { revisao: 1, snapshot: snap({ tipoTributacao: null }) }, 'tok-1', H('b'), T0);
    expect(d.ok && d.patch.estado).toBe('BLOQUEADO');
    expect(d.ok && d.patch.motivoCodigo).toBe('REGIME_SEM_FONTE');
  });
  it('lease de outro worker, vencido, replay de revisão, estado errado e CNPJ de outro cadastro recusam', () => {
    expect(decidirPrevia(linha(), { revisao: 1, snapshot: snap() }, 'outro', H('b'), T0)).toMatchObject({ ok: false, codigo: 'RESERVA_INVALIDA' });
    expect(decidirPrevia(linha({ reservadoAte: em(-1) }), { revisao: 1, snapshot: snap() }, 'tok-1', H('b'), T0)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(decidirPrevia(linha({ revisao: 3 }), { revisao: 2, snapshot: snap() }, 'tok-1', H('b'), T0)).toMatchObject({ codigo: 'REVISAO_DESATUALIZADA' });
    expect(decidirPrevia(linha({ estado: 'APROVADO' }), { revisao: 1, snapshot: snap() }, 'tok-1', H('b'), T0)).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
    expect(decidirPrevia(linha(), { revisao: 1, snapshot: snap({ cnpj: '11444777000161' }) }, 'tok-1', H('b'), T0)).toMatchObject({ codigo: 'CNPJ_DIFERENTE' });
    expect(decidirPrevia(linha(), { revisao: 1, snapshot: { lixo: true } }, 'tok-1', H('b'), T0)).toMatchObject({ status: 400, codigo: 'SNAPSHOT_INVALIDO' });
  });
  it('contatos confirmados no CRM prevalecem sobre o que o worker mandou, com a origem do CRM', () => {
    const l = linha({ contatos: { telefone: { valor: '84911112222', origem: 'TARCYO_CONFIRMADO' } } });
    const d = decidirPrevia(l, { revisao: 1, snapshot: snap() }, 'tok-1', H('b'), T0);
    expect(d.ok && d.patch.snapshot?.telefone).toBe('84911112222');
    expect(d.ok && d.patch.snapshot?.origens.telefone).toBe('TARCYO_CONFIRMADO');
  });
  it('snapshot que muda depois de já existir sobe a revisão e invalida a aprovação', () => {
    const base = ok();
    if (!base.ok) throw new Error('esperado ok');
    const l = linha({ revisao: 4, snapshot: base.patch.snapshot!, snapshotHash: base.patch.snapshotHash! });
    const d = decidirPrevia(l, { revisao: 4, snapshot: snap({ razaoSocial: 'NOME NOVO LTDA' }) }, 'tok-1', H('b'), T0);
    expect(d.ok && d.patch.revisao).toBe(5);
    expect(d.ok && d.patch.aprovadoPorId).toBeNull();
  });
});

describe('POST iniciar', () => {
  const l = () => aprovadaLinha();
  const corpo = () => ({ revisao: 2, snapshotHash: l().snapshotHash!, pedidoHash: H('a') });
  it('APROVADO → CADASTRANDO com lease, aprovação, gate e pedido inalterado', () => {
    const d = decidirIniciar(l(), corpo(), 'tok-1', H('a'), true, T0);
    expect(d).toMatchObject({ ok: true, idempotente: false });
    expect(d.ok && d.patch.estado).toBe('CADASTRANDO');
    expect(d.ok && d.patch.tentativaIniciadaEm).toEqual(T0);
  });
  it('é idempotente: segunda chamada igual não regrava (jaIniciado)', () => {
    const iniciada = linha({ ...l(), estado: 'CADASTRANDO', tentativaIniciadaEm: T0 });
    expect(decidirIniciar(iniciada, corpo(), 'tok-1', H('a'), true, em(1000))).toMatchObject({ ok: true, idempotente: true, patch: {} });
  });
  it('recusa: sem lease, aprovação expirada, revisão antiga, hash adulterado, pedido alterado', () => {
    expect(decidirIniciar(l(), corpo(), 'outro', H('a'), true, T0)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(decidirIniciar(l(), corpo(), 'tok-1', H('a'), true, em(25 * 3600_000))).toMatchObject({ codigo: 'RESERVA_INVALIDA' }); // reserva também venceu
    expect(decidirIniciar(aprovadaLinha({ reservadoAte: em(30 * 3600_000) }), corpo(), 'tok-1', H('a'), true, em(25 * 3600_000))).toMatchObject({ codigo: 'APROVACAO_INVALIDA' });
    expect(decidirIniciar(l(), { ...corpo(), revisao: 1 }, 'tok-1', H('a'), true, T0)).toMatchObject({ codigo: 'APROVACAO_INVALIDA' });
    expect(decidirIniciar(l(), { ...corpo(), snapshotHash: H('f') }, 'tok-1', H('a'), true, T0)).toMatchObject({ codigo: 'APROVACAO_INVALIDA' });
    expect(decidirIniciar(l(), corpo(), 'tok-1', H('z'), true, T0)).toMatchObject({ codigo: 'PEDIDO_ALTERADO' });
    expect(decidirIniciar(l(), { ...corpo(), pedidoHash: H('z') }, 'tok-1', H('a'), true, T0)).toMatchObject({ codigo: 'APROVACAO_INVALIDA' });
  });
  it('INCERTO nunca reinicia, nem com lease e gate', () => {
    expect(decidirIniciar(linha({ ...l(), estado: 'INCERTO' }), corpo(), 'tok-1', H('a'), true, T0)).toMatchObject({ ok: false, codigo: 'ESTADO_INVALIDO' });
  });
});

describe('POST resultado', () => {
  const emCurso = () => linha({ ...aprovadaLinha(), estado: 'CADASTRANDO', tentativaIniciadaEm: T0 });
  const corpo = (o: Record<string, unknown> = {}) => resultadoBodySchema.parse({ revisao: 2, snapshotHash: aprovadaLinha().snapshotHash, estado: 'CONFERIDO', erpClienteId: '9001', ...o });
  it('CONFERIDO grava cliente, libera o lease e a repetição idêntica é idempotente (sem nova escrita)', () => {
    const d = decidirResultado(emCurso(), corpo(), 'tok-1', T0);
    expect(d).toMatchObject({ ok: true, idempotente: false });
    if (!d.ok) return;
    const gravado = linha({ ...emCurso(), ...d.patch });
    expect(gravado.estado).toBe('CONFERIDO');
    expect(decidirResultado(gravado, corpo(), undefined, em(5000))).toMatchObject({ ok: true, idempotente: true, patch: {} });
    expect(decidirResultado(gravado, corpo({ erpClienteId: '9002' }), undefined, em(5000))).toMatchObject({ ok: false, codigo: 'RESULTADO_DIFERENTE' });
  });
  it('exige coerência: CONFERIDO sem cliente ou com divergência; DIVERGENTE sem divergência', () => {
    expect(decidirResultado(emCurso(), corpo({ erpClienteId: null }), 'tok-1', T0)).toMatchObject({ status: 400 });
    expect(decidirResultado(emCurso(), corpo({ divergencias: [{ campo: 'ie', esperado: '1', lido: '2' }] }), 'tok-1', T0)).toMatchObject({ status: 400 });
    expect(decidirResultado(emCurso(), corpo({ estado: 'DIVERGENTE' }), 'tok-1', T0)).toMatchObject({ status: 400 });
    const dv = decidirResultado(emCurso(), corpo({ estado: 'DIVERGENTE', divergencias: [{ campo: 'ie', esperado: '1', lido: '2' }] }), 'tok-1', T0);
    expect(dv.ok && dv.patch.estado).toBe('DIVERGENTE');
  });
  it('lease de outro worker/vencido, revisão antiga e hash adulterado recusam', () => {
    expect(decidirResultado(emCurso(), corpo(), 'outro', T0)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(decidirResultado(emCurso(), corpo(), 'tok-1', em(11 * 60_000))).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(decidirResultado(emCurso(), corpo({ revisao: 1 }), 'tok-1', T0)).toMatchObject({ codigo: 'REVISAO_DESATUALIZADA' });
    expect(decidirResultado(emCurso(), corpo({ snapshotHash: H('f') }), 'tok-1', T0)).toMatchObject({ codigo: 'SNAPSHOT_HASH_DIFERENTE' });
  });
  it('INCERTO só sai por reconciliação (CONFERIDO/DIVERGENTE) e INCERTO não vira outro INCERTO', () => {
    const incerto = linha({ ...emCurso(), estado: 'INCERTO', reservaToken: null, reservadoAte: null });
    expect(decidirResultado(incerto, corpo(), undefined, T0)).toMatchObject({ ok: true });
    // repetir INCERTO é só idempotência; a transição CADASTRANDO → INCERTO exige a reserva
    expect(decidirResultado(incerto, corpo({ estado: 'INCERTO', erpClienteId: null }), undefined, T0)).toMatchObject({ ok: true, idempotente: true });
    expect(decidirResultado(emCurso(), corpo({ estado: 'INCERTO', erpClienteId: null }), 'tok-1', T0)).toMatchObject({ ok: true, idempotente: false });
    expect(decidirResultado(emCurso(), corpo({ estado: 'INCERTO', erpClienteId: null }), 'outro', T0)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
  it('JA_EXISTE_CONFERIDO vira CONFERIDO sem escrita e sem precisar de aprovação; PREPARANDO exige lease', () => {
    const prep = linha();
    const d = decidirResultado(prep, corpo({ estado: 'JA_EXISTE_CONFERIDO', snapshotHash: undefined, revisao: 1 }), 'tok-1', T0);
    expect(d.ok && d.patch.estado).toBe('CONFERIDO');
    expect(d.ok && d.patch.motivoCodigo).toBe('JA_EXISTE_CONFERIDO');
    expect(decidirResultado(prep, corpo({ estado: 'JA_EXISTE_CONFERIDO', snapshotHash: undefined, revisao: 1 }), 'outro', T0)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
  it('estados que não podem receber resultado (AGUARDANDO_APROVACAO → CONFERIDO escrito)', () => {
    expect(decidirResultado(linha({ estado: 'AGUARDANDO_APROVACAO' }), corpo({ revisao: 1 }), 'tok-1', T0)).toMatchObject({ codigo: 'TRANSICAO_PROIBIDA' });
  });
});

describe('procedures: solicitar prévia', () => {
  const ped = { id: 'ped1', cnpj: '11.222.333/0001-81', status: 'estimado', aprovadoEm: '2026-10-01', faturadoEm: null, smbiMovsaiId: null, smbiVinculoEstado: null, smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'CLIENTE_NAO_CADASTRADO' };
  it('aceita só pedido aprovado, pendente por cliente, sem movsai/vínculo/faturamento/criação', () => {
    expect(podeSolicitarPrevia(ped)).toEqual({ ok: true, cnpj: CNPJ });
    expect(podeSolicitarPrevia({ ...ped, aprovadoEm: null })).toMatchObject({ codigo: 'PEDIDO_NAO_APROVADO' });
    expect(podeSolicitarPrevia({ ...ped, smbiMotivoCodigo: 'PRAZO_SEM_CODIGO' })).toMatchObject({ codigo: 'SEM_PENDENCIA_DE_CLIENTE' });
    expect(podeSolicitarPrevia({ ...ped, smbiMovsaiId: '1' })).toMatchObject({ codigo: 'PEDIDO_JA_PROCESSADO' });
    expect(podeSolicitarPrevia({ ...ped, smbiVinculoEstado: 'CONFERIDO' })).toMatchObject({ codigo: 'PEDIDO_JA_PROCESSADO' });
    expect(podeSolicitarPrevia({ ...ped, status: 'faturado' })).toMatchObject({ codigo: 'PEDIDO_JA_PROCESSADO' });
    expect(podeSolicitarPrevia({ ...ped, smbiEstado: 'CRIADO' })).toMatchObject({ codigo: 'PEDIDO_JA_PROCESSADO' });
    expect(podeSolicitarPrevia({ ...ped, cnpj: '11222333000182' })).toMatchObject({ codigo: 'CNPJ_INVALIDO' });
  });
  it('cria, mantém, reativa (só sem tentativa) e recusa outro pedido', () => {
    expect(decidirSolicitacao(null, 'ped1')).toEqual({ acao: 'CRIAR' });
    expect(decidirSolicitacao(linha(), 'ped1')).toEqual({ acao: 'MANTER' });
    expect(decidirSolicitacao(linha({ estado: 'INVALIDADO' }), 'ped2')).toEqual({ acao: 'REATIVAR' });
    expect(decidirSolicitacao(linha({ estado: 'INVALIDADO', tentativaIniciadaEm: T0 }), 'ped1')).toMatchObject({ codigo: 'TENTATIVA_ANTERIOR' });
    expect(decidirSolicitacao(linha(), 'ped2')).toMatchObject({ codigo: 'OUTRO_PEDIDO' });
  });
  it('reenvio do pedido não mexe em cadastro com risco de escrita', () => {
    for (const e of ['CADASTRANDO', 'INCERTO', 'DIVERGENTE']) expect(reenvioBloqueadoPorCadastro(e)).toBe(true);
    for (const e of ['PREPARANDO', 'CONFERIDO', 'APROVADO', undefined]) expect(reenvioBloqueadoPorCadastro(e)).toBe(false);
  });
});

describe('procedures: contatos', () => {
  const tarefa = { cnpj: '11.222.333/0001-81', phone: '(84) 99999-0000', email: 'Contato@Empresa.com', emailConfirmed: true };
  it('relação determinística (tarefa do pedido, mesmo CNPJ, mesmo valor) é aceita como CRM_CONFIRMADO', () => {
    const r = validarRevisaoContatos({ telefone: { valor: '84 99999-0000', origem: 'CRM_CONFIRMADO' }, email: { valor: 'contato@empresa.com', origem: 'CRM_CONFIRMADO' } }, { role: 'manager' }, CNPJ, tarefa);
    expect(r.ok && r.contatos.telefone?.valor).toBe('84999990000');
  });
  it('contato ambíguo é recusado: sem tarefa, CNPJ diferente/ausente, valor diferente, e-mail não confirmado', () => {
    const tel = { telefone: { valor: '84999990000', origem: 'CRM_CONFIRMADO' as const } };
    expect(validarRevisaoContatos(tel, { role: 'manager' }, CNPJ, null)).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
    expect(validarRevisaoContatos(tel, { role: 'manager' }, CNPJ, { ...tarefa, cnpj: '11444777000161' })).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
    expect(validarRevisaoContatos(tel, { role: 'manager' }, CNPJ, { ...tarefa, cnpj: null })).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
    expect(validarRevisaoContatos({ telefone: { valor: '84988880000', origem: 'CRM_CONFIRMADO' } }, { role: 'manager' }, CNPJ, tarefa)).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
    expect(validarRevisaoContatos({ email: { valor: 'contato@empresa.com', origem: 'CRM_CONFIRMADO' } }, { role: 'manager' }, CNPJ, { ...tarefa, emailConfirmed: false })).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
    // campo que a tarefa não cobre não pode ser CRM_CONFIRMADO
    expect(validarRevisaoContatos({ contato: { valor: 'Maria', origem: 'CRM_CONFIRMADO' } }, { role: 'manager' }, CNPJ, tarefa)).toMatchObject({ codigo: 'CONTATO_AMBIGUO' });
  });
  it('TARCYO_CONFIRMADO só do admin; origem FISCAL_SMBI nunca; valores inválidos recusados', () => {
    const c = { contato: { valor: 'Maria', origem: 'TARCYO_CONFIRMADO' as const } };
    expect(validarRevisaoContatos(c, { role: 'manager' }, CNPJ, null)).toMatchObject({ status: 403 });
    expect(validarRevisaoContatos(c, { role: 'admin' }, CNPJ, null)).toMatchObject({ ok: true });
    expect(validarRevisaoContatos({ contato: { valor: 'M', origem: 'FISCAL_SMBI' } }, { role: 'admin' }, CNPJ, null)).toMatchObject({ ok: false });
    expect(validarRevisaoContatos({ representanteDoc: { valor: '11111111111', origem: 'TARCYO_CONFIRMADO' } }, { role: 'admin' }, CNPJ, null)).toMatchObject({ codigo: 'VALOR_INVALIDO' });
  });
  it('revisar INVALIDA a aprovação, sobe a revisão e volta a PREPARANDO; snapshot alterado já não aprova', () => {
    const aprov = aprovadaLinha();
    expect(aprovacaoValida(aprov, em(1000))).toBe(true);
    const d = decidirRevisaoContatos(aprov, 2, { telefone: { valor: '84911112222', origem: 'TARCYO_CONFIRMADO' } }, em(1000));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.patch).toMatchObject({ revisao: 3, estado: 'PREPARANDO', aprovadoPorId: null, aprovacaoExpiraEm: null });
    expect(aprovacaoValida({ ...aprov, ...d.patch } as Cadastro, em(1000))).toBe(false);
    expect(decidirRevisaoContatos(aprov, 1, {}, em(1000))).toMatchObject({ codigo: 'REVISAO_DESATUALIZADA' });
    expect(decidirRevisaoContatos(linha({ estado: 'CADASTRANDO' }), 1, {}, em(1000))).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  });
});

describe('procedures: aprovação', () => {
  const pronta = () => {
    const s = snap();
    return linha({ estado: 'AGUARDANDO_APROVACAO', revisao: 2, snapshot: s, snapshotHash: hashSnapshot(s), pedidoHash: H('a') });
  };
  const input = () => ({ revisao: 2, snapshotHash: pronta().snapshotHash!, pedidoHash: H('a') });
  const admin = { id: 7, name: 'Tarcyo', role: 'admin' };
  it('staff (manager) não aprova; o worker nem tem rota de aprovação', () => {
    expect(decidirAprovacao(pronta(), input(), H('a'), { id: 8, name: 'Gerente', role: 'manager' }, T0)).toMatchObject({ status: 403, codigo: 'SO_ADMIN' });
  });
  it('o ator vem do ctx, nunca do payload (campos extras são rejeitados)', () => {
    expect(aprovarInputSchema.safeParse({ cadastroId: pronta().id, ...input(), aprovadoPorId: 99 }).success).toBe(false);
    expect(aprovarInputSchema.safeParse({ cadastroId: pronta().id, ...input(), aprovadoPorNome: 'Fulano' }).success).toBe(false);
    const d = decidirAprovacao(pronta(), input(), H('a'), admin, T0);
    expect(d.ok && d.patch).toMatchObject({ estado: 'APROVADO', aprovadoPorId: 7, aprovadoPorNome: 'Tarcyo' });
    expect(d.ok && d.patch.aprovacaoExpiraEm).toEqual(em(24 * 3600_000));
  });
  it('compara hashes com o estado atual: revisão antiga, snapshot e pedido alterados recusam', () => {
    expect(decidirAprovacao(pronta(), { ...input(), revisao: 1 }, H('a'), admin, T0)).toMatchObject({ codigo: 'REVISAO_DESATUALIZADA' });
    expect(decidirAprovacao(pronta(), { ...input(), snapshotHash: H('f') }, H('a'), admin, T0)).toMatchObject({ codigo: 'SNAPSHOT_HASH_DIFERENTE' });
    expect(decidirAprovacao(pronta(), input(), H('z'), admin, T0)).toMatchObject({ codigo: 'PEDIDO_ALTERADO' });
    expect(decidirAprovacao(linha({ ...pronta(), snapshotHash: H('f') }), { ...input(), snapshotHash: H('f') }, H('a'), admin, T0)).toMatchObject({ codigo: 'SNAPSHOT_HASH_DIFERENTE' });
  });
  it('não aprova cadastro com campo faltante, bloqueio ou de outro estado', () => {
    const s = snap({ tipoTributacao: null });
    const l = linha({ estado: 'AGUARDANDO_APROVACAO', revisao: 2, snapshot: s, snapshotHash: hashSnapshot(s), pedidoHash: H('a') });
    expect(avaliarSnapshot(s).bloqueios.length).toBeGreaterThan(0);
    expect(decidirAprovacao(l, { revisao: 2, snapshotHash: l.snapshotHash!, pedidoHash: H('a') }, H('a'), admin, T0)).toMatchObject({ codigo: 'CADASTRO_BLOQUEADO' });
    expect(decidirAprovacao(linha({ ...pronta(), estado: 'BLOQUEADO' }), input(), H('a'), admin, T0)).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  });
  it('aprovação ainda viva não é renovada em silêncio (idempotente)', () => {
    const viva = aprovadaLinha();
    const d = decidirAprovacao(viva, { revisao: 2, snapshotHash: viva.snapshotHash!, pedidoHash: H('a') }, H('a'), admin, em(1000));
    expect(d).toMatchObject({ ok: true, idempotente: true });
  });
});

describe('procedures: continuidade só do originador', () => {
  const conferido = (o: Partial<Cadastro> = {}) => linha({ ...aprovadaLinha(), estado: 'CONFERIDO', erpClienteId: '9001', conferidoEm: T0, reservaToken: null, reservadoAte: null, ...o });
  const ped = (o: Partial<PedidoParaLiberar> = {}): PedidoParaLiberar => ({
    id: 'ped1', cnpj: CNPJ, status: 'estimado', aprovadoEm: '2026-10-01', faturadoEm: null, smbiMovsaiId: null, smbiVinculoEstado: null,
    smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'CLIENTE_NAO_CADASTRADO', hashAtual: H('a'), ...o,
  });
  const gates = { cadastroAtivo: true, roboAtivo: true };
  it('libera o pedido originador quando tudo confere', () => {
    expect(podeLiberarPedido(conferido(), ped(), gates)).toEqual({ ok: true });
  });
  it('outro pedido do mesmo CNPJ NÃO é liberado por esta via', () => {
    expect(podeLiberarPedido(conferido(), ped({ id: 'ped2' }), gates)).toMatchObject({ codigo: 'NAO_E_ORIGINADOR' });
    expect(podeLiberarPedido(conferido(), ped({ cnpj: '11444777000161' }), gates)).toMatchObject({ codigo: 'CNPJ_DIFERENTE' });
  });
  it('pedido alterado depois do cadastro bloqueia (o cliente segue conferido)', () => {
    expect(podeLiberarPedido(conferido(), ped({ hashAtual: H('z') }), gates)).toMatchObject({ codigo: 'PEDIDO_ALTERADO' });
    expect(conferido().estado).toBe('CONFERIDO');
  });
  it('exige CONFERIDO, cliente ERP, aprovação consistente e os dois gates', () => {
    expect(podeLiberarPedido(conferido({ estado: 'INCERTO' }), ped(), gates)).toMatchObject({ codigo: 'CADASTRO_NAO_CONFERIDO' });
    expect(podeLiberarPedido(conferido({ estado: 'DIVERGENTE' }), ped(), gates)).toMatchObject({ codigo: 'CADASTRO_NAO_CONFERIDO' });
    expect(podeLiberarPedido(conferido({ erpClienteId: null }), ped(), gates)).toMatchObject({ codigo: 'SEM_CLIENTE_ERP' });
    expect(podeLiberarPedido(conferido({ aprovadoPorId: null }), ped(), gates)).toMatchObject({ codigo: 'SEM_APROVACAO' });
    expect(podeLiberarPedido(conferido({ snapshotHash: H('f') }), ped(), gates)).toMatchObject({ codigo: 'SEM_APROVACAO' });
    expect(podeLiberarPedido(conferido(), ped(), { cadastroAtivo: false, roboAtivo: true })).toMatchObject({ codigo: 'GATE_DESLIGADO' });
    expect(podeLiberarPedido(conferido(), ped(), { cadastroAtivo: true, roboAtivo: false })).toMatchObject({ codigo: 'GATE_DESLIGADO' });
  });
  it('cliente que já existia (nada foi escrito) dispensa aprovação de escrita', () => {
    expect(podeLiberarPedido(conferido({ motivoCodigo: 'JA_EXISTE_CONFERIDO', aprovadoPorId: null, snapshot: null, snapshotHash: null }), ped(), gates)).toEqual({ ok: true });
  });
  it('pedido já com movsai, vínculo, faturado ou criado não é tocado; só a pendência de cliente é limpa', () => {
    for (const o of [{ smbiMovsaiId: '1' }, { smbiVinculoEstado: 'CONFERIDO' }, { status: 'faturado' }, { faturadoEm: 'x' }, { smbiEstado: 'CRIADO' }]) {
      expect(podeLiberarPedido(conferido(), ped(o), gates)).toMatchObject({ codigo: 'PEDIDO_JA_PROCESSADO' });
    }
    expect(podeLiberarPedido(conferido(), ped({ smbiMotivoCodigo: 'PRAZO_SEM_CODIGO' }), gates)).toMatchObject({ codigo: 'OUTRA_PENDENCIA' });
    expect(podeLiberarPedido(conferido(), ped({ smbiEstado: null, smbiMotivoCodigo: null }), gates)).toMatchObject({ codigo: 'SEM_PENDENCIA' });
  });
});
