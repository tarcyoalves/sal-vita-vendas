// Cadastro assistido CRM → SMBI — DECISÕES puras de cada rota REST e de cada procedure tRPC.
// Sem `server/db` (só `import type`): as rotas e o router apenas leem o banco, chamam estas funções e
// aplicam o patch com UPDATE condicional (WHERE estado/revisão esperados + linhas afetadas).
import { z } from 'zod';
import type { SmbiClientRegistration } from '../db/schema';
import {
  CADASTRO_CAMPOS_CONTATO, CADASTRO_ORIGENS, CADASTRO_RESULTADOS,
  type CadastroContatos, type CadastroDivergencia, type CadastroEstado, type CadastroResultado, type CadastroSnapshotV1,
} from '../../shared/smbiCadastro';
import { SMBI_RESERVA_MIN } from '../../shared/smbiEstados';
import { safeEqual } from './safeEqual';
import {
  APROVACAO_VALIDADE_MS, avaliarSnapshot, canonico, cnpjValido, hashSnapshot, motivoAprovacaoInvalida,
  normalizarCnpj, podeTransitar, validarSnapshot,
} from './smbiCadastro';

export type Cadastro = SmbiClientRegistration;
export type PatchCadastro = Partial<Omit<Cadastro, 'id' | 'cnpj' | 'criadoEm'>>;

export interface Recusa { ok: false; status: 400 | 403 | 404 | 409; codigo: string; erro: string }
const recusa = (status: Recusa['status'], codigo: string, erro: string): Recusa => ({ ok: false, status, codigo, erro });

// ── Reserva (lease) ──────────────────────────────────────────────────────────

export const reservaCadastroAte = (agora: Date): Date => new Date(agora.getTime() + SMBI_RESERVA_MIN * 60_000);

/** Token da reserva (header X-SMBI-Reserva, nunca URL/corpo) confere e ainda não venceu. */
export function leaseValido(row: Pick<Cadastro, 'reservaToken' | 'reservadoAte'>, token: string | undefined, agora: Date): boolean {
  if (!token || !row.reservaToken || !row.reservadoAte) return false;
  return safeEqual(token, row.reservaToken) && row.reservadoAte.getTime() > agora.getTime();
}

/** Trabalho que o worker pode receber: PREPARANDO, ou APROVADO com aprovação ainda válida; sem outra reserva viva. */
export function elegivelParaLease(row: Cadastro, agora: Date): boolean {
  if (row.reservadoAte && row.reservadoAte.getTime() > agora.getTime()) return false;
  if (row.estado === 'PREPARANDO') return true;
  return row.estado === 'APROVADO' && motivoAprovacaoInvalida(row, agora) === null;
}

export function montarTrabalho(row: Cadastro, incluirReserva: boolean) {
  return {
    id: row.id,
    cnpj: row.cnpj,
    pedidoId: row.pedidoId,
    fase: row.estado === 'APROVADO' || row.estado === 'CADASTRANDO' ? 'CADASTRO' : 'PREVIA',
    estado: row.estado,
    revisao: row.revisao,
    snapshot: row.snapshot ?? null,
    snapshotHash: row.snapshotHash ?? null,
    pedidoHash: row.pedidoHash ?? null,
    contatos: row.contatos ?? null,
    aprovacaoExpiraEm: row.aprovacaoExpiraEm ? row.aprovacaoExpiraEm.toISOString() : null,
    ...(incluirReserva
      ? { reservaToken: row.reservaToken ?? null, reservadoAte: row.reservadoAte ? row.reservadoAte.toISOString() : null }
      : {}),
  };
}

/** Resposta do GET que tenta obter trabalho: gate desligado ou fila vazia = 200 com trabalho null. */
export const respostaSemTrabalho = (gateAtivo: boolean) => ({ ok: true as const, cadastroAtivo: gateAtivo, trabalho: null });

// ── POST /cadastros/:id/previa ───────────────────────────────────────────────

export const previaBodySchema = z.object({ revisao: z.number().int().min(1), snapshot: z.unknown() }).strict();
export const iniciarBodySchema = z.object({
  revisao: z.number().int().min(1), snapshotHash: z.string().length(64), pedidoHash: z.string().length(64),
}).strict();

/** Aplica os contatos confirmados no CRM POR CIMA do snapshot do worker (o CRM é a fonte desses campos). */
export function mesclarContatos(s: CadastroSnapshotV1, contatos: CadastroContatos | null | undefined): CadastroSnapshotV1 {
  if (!contatos) return s;
  const novo: CadastroSnapshotV1 = { ...s, origens: { ...s.origens } };
  for (const campo of CADASTRO_CAMPOS_CONTATO) {
    const c = contatos[campo];
    if (!c) continue;
    if (campo === 'comissaoClientePct') novo.comissaoClientePct = typeof c.valor === 'number' ? c.valor : null;
    else novo[campo] = c.valor == null ? null : String(c.valor);
    novo.origens[campo] = c.origem;
  }
  return novo;
}

export type DecisaoPrevia = Recusa | { ok: true; patch: PatchCadastro };

export function decidirPrevia(
  row: Cadastro,
  entrada: { revisao: number; snapshot?: unknown },
  token: string | undefined,
  pedidoHashAtual: string,
  agora: Date,
): DecisaoPrevia {
  if (!leaseValido(row, token, agora)) return recusa(409, 'RESERVA_INVALIDA', 'reserva ausente, vencida ou de outro worker');
  if (row.estado !== 'PREPARANDO') return recusa(409, 'ESTADO_INVALIDO', `estado ${row.estado} não aceita prévia`);
  if (entrada.revisao !== row.revisao) return recusa(409, 'REVISAO_DESATUALIZADA', 'revisão desatualizada: releia o trabalho');
  const v = validarSnapshot(entrada.snapshot);
  if (!v.ok) return recusa(400, 'SNAPSHOT_INVALIDO', v.erro);
  if (v.snapshot.cnpj !== row.cnpj) return recusa(409, 'CNPJ_DIFERENTE', 'snapshot de outro CNPJ');
  const merged = validarSnapshot(mesclarContatos(v.snapshot, row.contatos));
  if (!merged.ok) return recusa(400, 'SNAPSHOT_INVALIDO', merged.erro);
  const snapshot = merged.snapshot;
  const hash = hashSnapshot(snapshot);
  const av = avaliarSnapshot(snapshot);
  const estado: CadastroEstado = av.camposFaltantes.length > 0 || av.bloqueios.length > 0 ? 'BLOQUEADO' : 'AGUARDANDO_APROVACAO';
  if (!podeTransitar('PREPARANDO', estado)) return recusa(409, 'TRANSICAO_PROIBIDA', 'transição proibida');
  const mudou = row.snapshotHash != null && row.snapshotHash !== hash;
  return {
    ok: true,
    patch: {
      estado,
      revisao: mudou ? row.revisao + 1 : row.revisao,
      snapshot,
      snapshotHash: hash,
      pedidoHash: pedidoHashAtual,
      motivoCodigo: estado === 'BLOQUEADO' ? (av.bloqueios[0] ?? 'CAMPOS_FALTANTES') : null,
      divergencias: { camposFaltantes: av.camposFaltantes, bloqueios: av.bloqueios },
      aprovadoPorId: null, aprovadoPorNome: null, aprovadoEm: null, aprovacaoExpiraEm: null,
      reservaToken: null, reservadoAte: null,
      atualizadoEm: agora,
    },
  };
}

// ── POST /cadastros/:id/iniciar ──────────────────────────────────────────────

export type DecisaoIniciar = Recusa | { ok: true; idempotente: boolean; patch: PatchCadastro };

export function decidirIniciar(
  row: Cadastro,
  entrada: { revisao: number; snapshotHash: string; pedidoHash: string },
  token: string | undefined,
  pedidoHashAtual: string,
  gateAtivo: boolean,
  agora: Date,
): DecisaoIniciar {
  const mesmaTentativa = row.estado === 'CADASTRANDO' && row.tentativaIniciadaEm != null
    && entrada.revisao === row.revisao && entrada.snapshotHash === row.snapshotHash;
  // Repetição do mesmo pedido pelo mesmo worker: nada é regravado. O worker NÃO pode submeter de novo
  // (jaIniciado=true significa "reconcilie antes de qualquer escrita").
  if (mesmaTentativa && leaseValido(row, token, agora)) return { ok: true, idempotente: true, patch: {} };
  if (!gateAtivo) return recusa(409, 'GATE_DESLIGADO', 'cadastro assistido desligado');
  if (!leaseValido(row, token, agora)) return recusa(409, 'RESERVA_INVALIDA', 'reserva ausente, vencida ou de outro worker');
  if (row.estado !== 'APROVADO' || !podeTransitar(row.estado as CadastroEstado, 'CADASTRANDO')) {
    return recusa(409, 'ESTADO_INVALIDO', `estado ${row.estado} não pode iniciar cadastro`);
  }
  const motivo = motivoAprovacaoInvalida(row, agora, {
    cnpj: row.cnpj, revisao: entrada.revisao, snapshotHash: entrada.snapshotHash, pedidoHash: entrada.pedidoHash,
  });
  if (motivo) return recusa(409, 'APROVACAO_INVALIDA', `aprovação não vale: ${motivo}`);
  if (pedidoHashAtual !== row.pedidoHash) return recusa(409, 'PEDIDO_ALTERADO', 'o pedido mudou depois da aprovação');
  return {
    ok: true, idempotente: false,
    patch: { estado: 'CADASTRANDO', tentativaIniciadaEm: agora, reservadoAte: reservaCadastroAte(agora), atualizadoEm: agora },
  };
}

// ── POST /cadastros/:id/resultado ────────────────────────────────────────────

const divergenciaSchema = z.object({
  campo: z.string().trim().min(1).max(60),
  esperado: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
  lido: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
}).strict();

export const resultadoBodySchema = z.object({
  revisao: z.number().int().min(1),
  snapshotHash: z.string().length(64).nullish(),
  estado: z.enum(CADASTRO_RESULTADOS),
  erpClienteId: z.string().trim().min(1).max(40).nullish(),
  divergencias: z.array(divergenciaSchema).max(50).default([]),
  motivoCodigo: z.string().trim().min(1).max(60).nullish(),
}).strict();
export type ResultadoBody = z.infer<typeof resultadoBodySchema>;

export type DecisaoResultado = Recusa | { ok: true; idempotente: boolean; patch: PatchCadastro };

export function decidirResultado(row: Cadastro, e: ResultadoBody, token: string | undefined, agora: Date): DecisaoResultado {
  const jaExiste = e.estado === 'JA_EXISTE_CONFERIDO';
  const alvo: CadastroEstado = jaExiste ? 'CONFERIDO' : (e.estado as Exclude<CadastroResultado, 'JA_EXISTE_CONFERIDO'>);
  const motivo = jaExiste ? 'JA_EXISTE_CONFERIDO' : (e.motivoCodigo ?? null);
  const erp = e.erpClienteId ?? null;
  const diverg: CadastroDivergencia[] = e.divergencias;

  if (alvo === 'CONFERIDO' && (!erp || diverg.length > 0)) return recusa(400, 'RESULTADO_INCONSISTENTE', 'CONFERIDO exige erpClienteId e nenhuma divergência');
  if (alvo === 'DIVERGENTE' && diverg.length === 0) return recusa(400, 'RESULTADO_INCONSISTENTE', 'DIVERGENTE exige ao menos uma divergência');

  // Repetição: mesmo estado final, revisão, hash, cliente ERP e divergências = sem nova escrita (nem exige reserva viva).
  if (row.estado === alvo && row.revisao === e.revisao) {
    const igual = (row.snapshotHash ?? null) === (e.snapshotHash ?? row.snapshotHash ?? null)
      && (row.erpClienteId ?? null) === erp
      && (row.motivoCodigo ?? null) === motivo
      && canonico(row.divergencias ?? []) === canonico(diverg);
    if (igual) return { ok: true, idempotente: true, patch: {} };
    return recusa(409, 'RESULTADO_DIFERENTE', 'já existe resultado diferente para esta revisão');
  }
  if (e.revisao !== row.revisao) return recusa(409, 'REVISAO_DESATUALIZADA', 'revisão desatualizada');

  const de = row.estado as CadastroEstado;
  // Reconciliação (leitura) de INCERTO não tem reserva: o worker de cadastro que o criou já perdeu a dele.
  const reconciliacao = de === 'INCERTO' && (alvo === 'CONFERIDO' || alvo === 'DIVERGENTE');
  const origemPermitida = jaExiste ? ['PREPARANDO', 'APROVADO', 'CADASTRANDO', 'INCERTO'].includes(de) : (de === 'CADASTRANDO' || reconciliacao);
  if (!origemPermitida || !podeTransitar(de, alvo)) return recusa(409, 'TRANSICAO_PROIBIDA', `${de} → ${alvo} não permitido`);
  if (!reconciliacao && !leaseValido(row, token, agora)) return recusa(409, 'RESERVA_INVALIDA', 'reserva ausente, vencida ou de outro worker');
  if (de !== 'PREPARANDO' && e.snapshotHash !== row.snapshotHash) return recusa(409, 'SNAPSHOT_HASH_DIFERENTE', 'hash do snapshot não confere');

  return {
    ok: true, idempotente: false,
    patch: {
      estado: alvo,
      erpClienteId: erp ?? row.erpClienteId,
      conferidoEm: alvo === 'CONFERIDO' || alvo === 'DIVERGENTE' ? agora : row.conferidoEm,
      motivoCodigo: motivo,
      divergencias: diverg,
      reservaToken: null, reservadoAte: null,
      atualizadoEm: agora,
    },
  };
}

// ── Procedures: solicitar prévia ─────────────────────────────────────────────

export interface PedidoParaCadastro {
  id: string; cnpj: string; status: string; aprovadoEm: string | null; faturadoEm: string | null;
  smbiMovsaiId: string | null; smbiVinculoEstado: string | null; smbiEstado: string | null; smbiMotivoCodigo: string | null;
}

/** Pedido apto a pedir cadastro: aprovado, pendência CLIENTE_NAO_CADASTRADO, sem movsai/vínculo/faturamento/criação. */
export function podeSolicitarPrevia(p: PedidoParaCadastro): Recusa | { ok: true; cnpj: string } {
  const cnpj = normalizarCnpj(p.cnpj);
  if (!cnpj || !cnpjValido(cnpj)) return recusa(400, 'CNPJ_INVALIDO', 'CNPJ do pedido inválido: corrija o pedido (nada é completado ou corrigido automaticamente)');
  if (!p.aprovadoEm) return recusa(400, 'PEDIDO_NAO_APROVADO', 'o pedido precisa estar aprovado');
  if (p.smbiMovsaiId || p.smbiVinculoEstado || p.status === 'faturado' || p.faturadoEm || p.smbiEstado === 'CRIADO') {
    return recusa(409, 'PEDIDO_JA_PROCESSADO', 'pedido já criado, vinculado ou faturado no SMBI');
  }
  if (p.smbiEstado !== 'PENDENTE' || p.smbiMotivoCodigo !== 'CLIENTE_NAO_CADASTRADO') {
    return recusa(409, 'SEM_PENDENCIA_DE_CLIENTE', 'o pedido não está pendente por cliente não cadastrado');
  }
  return { ok: true, cnpj };
}

export type AcaoSolicitacao = { acao: 'CRIAR' | 'REATIVAR' | 'MANTER' } | Recusa;

export function decidirSolicitacao(existente: Pick<Cadastro, 'estado' | 'pedidoId' | 'tentativaIniciadaEm'> | null, pedidoId: string): AcaoSolicitacao {
  if (!existente) return { acao: 'CRIAR' };
  if (existente.estado === 'INVALIDADO') {
    // Quem já iniciou tentativa pode ter escrito no SMBI: só conferência humana, nunca reativação automática.
    if (existente.tentativaIniciadaEm) return recusa(409, 'TENTATIVA_ANTERIOR', 'houve tentativa de cadastro: confira o SMBI manualmente');
    return { acao: 'REATIVAR' };
  }
  if (existente.pedidoId !== pedidoId) return recusa(409, 'OUTRO_PEDIDO', 'já existe cadastro deste CNPJ ligado a outro pedido');
  return { acao: 'MANTER' };
}

// ── Procedures: revisar contatos ─────────────────────────────────────────────

export const ESTADOS_REVISAVEIS: readonly CadastroEstado[] = ['PREPARANDO', 'BLOQUEADO', 'AGUARDANDO_APROVACAO', 'APROVADO'];

const origemContato = z.enum(CADASTRO_ORIGENS).refine((o) => o !== 'FISCAL_SMBI', 'origem FISCAL_SMBI é só do worker');
const campo = <T extends z.ZodTypeAny>(valor: T) => z.object({ valor, origem: origemContato }).strict();

export const contatosSchema = z.object({
  contato: campo(z.string().trim().min(2).max(80)),
  telefone: campo(z.string().trim().min(8).max(25)),
  celular: campo(z.string().trim().min(8).max(25)),
  email: campo(z.string().trim().max(120).email()),
  emailFinanceiro: campo(z.string().trim().max(120).email()),
  representanteDoc: campo(z.string().trim().min(11).max(18)),
  comissaoClientePct: campo(z.number().min(0).max(100)),
}).partial().strict();

export const revisarContatosInputSchema = z.object({
  cadastroId: z.string().uuid(), revisao: z.number().int().min(1), contatos: contatosSchema,
}).strict();
export const aprovarInputSchema = z.object({
  cadastroId: z.string().uuid(), revisao: z.number().int().min(1),
  snapshotHash: z.string().length(64), pedidoHash: z.string().length(64),
}).strict();

const soDigitos = (v: string) => v.replace(/\D/g, '');
const fone = (v: string) => { const d = soDigitos(v); return d.length > 11 && d.startsWith('55') ? d.slice(2) : d; };

export function cpfValido(valor: string): boolean {
  const c = soDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    const s = c.slice(0, n).split('').reduce((a, d, i) => a + Number(d) * (n + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export interface TarefaRelacionada { cnpj: string | null; phone: string | null; email: string | null; emailConfirmed: boolean }

/**
 * Valida e normaliza a revisão de contatos. CRM_CONFIRMADO só vale para telefone/celular/e-mail que COINCIDEM com a
 * tarefa do pedido (taskId) E cuja tarefa tem o MESMO CNPJ do cadastro (validado, comparação exata): nunca por nome
 * parecido. TARCYO_CONFIRMADO é só do admin. Qualquer ambiguidade = recusa.
 */
export function validarRevisaoContatos(
  contatos: CadastroContatos,
  ator: { role: string },
  cnpjCadastro: string,
  tarefa: TarefaRelacionada | null,
): Recusa | { ok: true; contatos: CadastroContatos } {
  const out: CadastroContatos = {};
  const entradas = Object.entries(contatos) as Array<[keyof CadastroContatos, NonNullable<CadastroContatos[keyof CadastroContatos]>]>;
  if (entradas.length === 0) return recusa(400, 'SEM_CONTATOS', 'nenhum contato informado');
  const tarefaVale = !!tarefa && normalizarCnpj(tarefa.cnpj ?? '') === cnpjCadastro && cnpjValido(cnpjCadastro);
  for (const [c, { valor, origem }] of entradas) {
    if (origem === 'FISCAL_SMBI') return recusa(400, 'ORIGEM_PROIBIDA', 'origem FISCAL_SMBI é só do worker');
    let norm: string | number;
    if (c === 'comissaoClientePct') {
      if (typeof valor !== 'number') return recusa(400, 'VALOR_INVALIDO', 'comissão deve ser número');
      norm = valor;
    } else {
      const s = String(valor).trim();
      if (c === 'telefone' || c === 'celular') { norm = fone(s); if (!/^\d{10,11}$/.test(norm)) return recusa(400, 'VALOR_INVALIDO', `${c}: informe DDD + número`); }
      else if (c === 'email' || c === 'emailFinanceiro') norm = s.toLowerCase();
      else if (c === 'representanteDoc') {
        norm = soDigitos(s);
        if (!(cpfValido(norm) || cnpjValido(norm))) return recusa(400, 'VALOR_INVALIDO', 'representanteDoc: CPF/CNPJ inválido');
      } else norm = s;
    }
    if (origem === 'TARCYO_CONFIRMADO') {
      if (ator.role !== 'admin') return recusa(403, 'SO_ADMIN', 'só o administrador pode registrar confirmação do Tarcyo');
    } else {
      // CRM_CONFIRMADO: relação determinística tarefa↔CNPJ + valor idêntico ao da tarefa.
      const casa = tarefaVale && tarefa && (
        ((c === 'telefone' || c === 'celular') && !!tarefa.phone && fone(tarefa.phone) === norm) ||
        (c === 'email' && tarefa.emailConfirmed && !!tarefa.email && tarefa.email.trim().toLowerCase() === norm)
      );
      if (!casa) return recusa(409, 'CONTATO_AMBIGUO', `${c}: sem vínculo determinístico (tarefa do pedido com o mesmo CNPJ e mesmo valor); use confirmação do administrador`);
    }
    out[c] = { valor: norm, origem };
  }
  return { ok: true, contatos: out };
}

/** Revisão: incrementa a revisão, INVALIDA a aprovação e volta a PREPARANDO (o worker refaz a prévia). */
export function decidirRevisaoContatos(row: Cadastro, revisao: number, novos: CadastroContatos, agora: Date): Recusa | { ok: true; patch: PatchCadastro } {
  if (!ESTADOS_REVISAVEIS.includes(row.estado as CadastroEstado)) return recusa(409, 'ESTADO_INVALIDO', `estado ${row.estado} não aceita revisão`);
  if (revisao !== row.revisao) return recusa(409, 'REVISAO_DESATUALIZADA', 'revisão desatualizada: recarregue');
  return {
    ok: true,
    patch: {
      contatos: { ...(row.contatos ?? {}), ...novos },
      revisao: row.revisao + 1,
      estado: 'PREPARANDO',
      aprovadoPorId: null, aprovadoPorNome: null, aprovadoEm: null, aprovacaoExpiraEm: null,
      atualizadoEm: agora,
    },
  };
}

// ── Procedures: aprovar ──────────────────────────────────────────────────────

export function decidirAprovacao(
  row: Cadastro,
  entrada: { revisao: number; snapshotHash: string; pedidoHash: string },
  pedidoHashAtual: string,
  ator: { id: number; name: string; role: string },
  agora: Date,
): Recusa | { ok: true; idempotente: boolean; patch: PatchCadastro } {
  if (ator.role !== 'admin') return recusa(403, 'SO_ADMIN', 'só o administrador aprova');
  if (row.estado !== 'AGUARDANDO_APROVACAO' && row.estado !== 'APROVADO') return recusa(409, 'ESTADO_INVALIDO', `estado ${row.estado} não pode ser aprovado`);
  if (entrada.revisao !== row.revisao) return recusa(409, 'REVISAO_DESATUALIZADA', 'revisão desatualizada: recarregue');
  if (!row.snapshot || !row.snapshotHash || !row.pedidoHash) return recusa(409, 'SEM_SNAPSHOT', 'ainda não há prévia');
  if (row.snapshot.cnpj !== row.cnpj) return recusa(409, 'CNPJ_DIFERENTE', 'snapshot de outro CNPJ');
  if (hashSnapshot(row.snapshot) !== row.snapshotHash || entrada.snapshotHash !== row.snapshotHash) {
    return recusa(409, 'SNAPSHOT_HASH_DIFERENTE', 'o cadastro mudou: revise de novo');
  }
  if (entrada.pedidoHash !== pedidoHashAtual || row.pedidoHash !== pedidoHashAtual) return recusa(409, 'PEDIDO_ALTERADO', 'o pedido mudou: peça nova prévia');
  const av = avaliarSnapshot(row.snapshot);
  if (av.camposFaltantes.length > 0 || av.bloqueios.length > 0) return recusa(409, 'CADASTRO_BLOQUEADO', 'há campos faltantes ou bloqueios');
  // Já aprovado e ainda dentro das 24 h: não renova silenciosamente.
  if (row.estado === 'APROVADO' && motivoAprovacaoInvalida(row, agora, { revisao: entrada.revisao, snapshotHash: entrada.snapshotHash, pedidoHash: entrada.pedidoHash }) === null) {
    return { ok: true, idempotente: true, patch: {} };
  }
  return {
    ok: true, idempotente: false,
    patch: {
      estado: 'APROVADO',
      aprovadoPorId: ator.id, aprovadoPorNome: ator.name,
      aprovadoEm: agora, aprovacaoExpiraEm: new Date(agora.getTime() + APROVACAO_VALIDADE_MS),
      atualizadoEm: agora,
    },
  };
}

// ── Procedures: continuidade (liberar SÓ o pedido originador) ────────────────

export interface PedidoParaLiberar extends PedidoParaCadastro { hashAtual: string }

/**
 * Pode limpar a pendência de cliente do pedido originador? Exige cadastro CONFERIDO com cliente ERP, aprovação humana
 * consistente (salvo cliente que já existia: nada foi escrito), pedido inalterado desde a prévia (pedidoHash), pedido
 * sem movsai/vínculo/faturamento/criação anterior e os DOIS gates (cadastro e robô) ligados.
 * `SEM_PENDENCIA` = já liberado antes (a rota trata como idempotente).
 */
export function podeLiberarPedido(
  c: Cadastro,
  p: PedidoParaLiberar,
  gates: { cadastroAtivo: boolean; roboAtivo: boolean },
): Recusa | { ok: true } {
  if (c.estado !== 'CONFERIDO') return recusa(409, 'CADASTRO_NAO_CONFERIDO', `cadastro está ${c.estado}`);
  if (!c.erpClienteId) return recusa(409, 'SEM_CLIENTE_ERP', 'cadastro conferido sem código do cliente no ERP');
  if (p.id !== c.pedidoId) return recusa(409, 'NAO_E_ORIGINADOR', 'só o pedido que originou o cadastro é liberado');
  if (normalizarCnpj(p.cnpj) !== c.cnpj) return recusa(409, 'CNPJ_DIFERENTE', 'CNPJ do pedido não é o do cadastro');
  if (p.smbiMovsaiId || p.smbiVinculoEstado || p.status === 'faturado' || p.faturadoEm || p.smbiEstado === 'CRIADO') {
    return recusa(409, 'PEDIDO_JA_PROCESSADO', 'pedido já criado, vinculado ou faturado');
  }
  if (!gates.cadastroAtivo || !gates.roboAtivo) return recusa(409, 'GATE_DESLIGADO', 'cadastro assistido e robô precisam estar ligados');
  if (c.motivoCodigo !== 'JA_EXISTE_CONFERIDO') {
    const consistente = c.aprovadoPorId != null && !!c.aprovadoEm && !!c.snapshot && !!c.snapshotHash && hashSnapshot(c.snapshot) === c.snapshotHash;
    if (!consistente) return recusa(409, 'SEM_APROVACAO', 'cadastro sem aprovação humana consistente');
  }
  if (!c.pedidoHash || c.pedidoHash !== p.hashAtual) return recusa(409, 'PEDIDO_ALTERADO', 'o pedido mudou depois do cadastro: o cliente segue conferido, mas a continuidade automática está bloqueada');
  if (p.smbiMotivoCodigo == null && p.smbiEstado == null) return recusa(409, 'SEM_PENDENCIA', 'pedido já liberado');
  if (p.smbiMotivoCodigo !== 'CLIENTE_NAO_CADASTRADO') return recusa(409, 'OUTRA_PENDENCIA', 'o pedido tem outra pendência; só a de cliente é limpa aqui');
  return { ok: true };
}

/** Guarda do reenvio manual do pedido (dispararSmbi): cadastro com risco de escrita não se mexe pelo reenvio. */
export function reenvioBloqueadoPorCadastro(estado: string | null | undefined): boolean {
  return estado === 'CADASTRANDO' || estado === 'INCERTO' || estado === 'DIVERGENTE';
}
