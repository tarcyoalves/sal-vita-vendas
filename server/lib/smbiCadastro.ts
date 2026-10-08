// Cadastro assistido CRM → SMBI — regras PURAS (sem `server/db`, testáveis sem banco).
// Snapshot validado, CNPJ, serialização canônica + sha256, máquina de estados e validade
// da aprovação. Princípio: nenhum default fiscal silencioso — o que não tem fonte é
// "campo faltante" ou bloqueio, nunca um valor assumido.
import crypto from 'crypto';
import { z } from 'zod';
import {
  CADASTRO_ESTADOS, CADASTRO_ORIGENS, CADASTRO_TRANSICOES,
  type CadastroEstado, type CadastroSnapshotV1,
} from '../../shared/smbiCadastro';

export const APROVACAO_VALIDADE_MS = 24 * 60 * 60 * 1000;

// ── CNPJ ─────────────────────────────────────────────────────────────────────

/** Só tira a pontuação usual (. / - espaço). Qualquer outro caractere = inválido; nunca completa nem "corrige". */
export function normalizarCnpj(valor: string): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.replace(/[.\-/\s]/g, '');
  return /^\d{14}$/.test(limpo) ? limpo : null;
}

function digitoCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** true só para 14 dígitos com dígitos verificadores corretos (e não repetidos). */
export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!cnpj || /^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoCnpj(cnpj.slice(0, 12));
  const d2 = digitoCnpj(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

// ── Snapshot (zod strict) ────────────────────────────────────────────────────

const texto = (max: number) => z.string().trim().max(max);
const textoOuNulo = (max: number) => z.string().trim().max(max).nullable();

export const snapshotSchema = z
  .object({
    versao: z.literal(1),
    cnpj: z.string().refine((v) => /^\d{14}$/.test(v) && cnpjValido(v), 'CNPJ inválido'),
    razaoSocial: texto(120).min(1),
    fantasia: texto(120),
    ie: textoOuNulo(20),
    situacaoCadastral: texto(40).min(1),
    ieAtiva: z.boolean().nullable(),
    endereco: z
      .object({
        logradouro: texto(120),
        numero: textoOuNulo(10),
        complemento: texto(80),
        bairro: texto(80),
        municipio: texto(80),
        uf: texto(2),
        cep: texto(8),
        municipioIbge: texto(7),
      })
      .strict(),
    tipoTributacao: textoOuNulo(30),
    contato: textoOuNulo(80),
    telefone: textoOuNulo(20),
    celular: textoOuNulo(20),
    email: textoOuNulo(120),
    emailFinanceiro: textoOuNulo(120),
    representanteDoc: textoOuNulo(14),
    comissaoClientePct: z.number().min(0).max(100).nullable(),
    origens: z.record(z.string().max(40), z.enum(CADASTRO_ORIGENS)),
  })
  .strict();

export type SnapshotParse = { ok: true; snapshot: CadastroSnapshotV1 } | { ok: false; erro: string };

export function validarSnapshot(entrada: unknown): SnapshotParse {
  const r = snapshotSchema.safeParse(entrada);
  if (r.success) return { ok: true, snapshot: r.data };
  return { ok: false, erro: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'snapshot'}: ${i.message}`).join('; ') };
}

const CAMPOS_COM_ORIGEM_OBRIGATORIA = ['contato', 'telefone', 'celular', 'email', 'emailFinanceiro', 'representanteDoc', 'comissaoClientePct'] as const;
const ehConfirmado = (o: string | undefined) => o === 'CRM_CONFIRMADO' || o === 'TARCYO_CONFIRMADO';

export interface AvaliacaoSnapshot {
  /** Campos que impedem o cadastro e que alguém precisa informar. */
  camposFaltantes: string[];
  /** Motivos de bloqueio que não são "campo vazio" (ex.: situação cadastral, regime sem fonte). */
  bloqueios: string[];
}

/** Lista o que falta e o que bloqueia. Nada é assumido: número ausente é faltante; regime sem fonte é bloqueio. */
export function avaliarSnapshot(s: CadastroSnapshotV1): AvaliacaoSnapshot {
  const faltantes: string[] = [];
  const bloqueios: string[] = [];
  const vazio = (v: string | null | undefined) => v == null || v.trim() === '';

  if (vazio(s.razaoSocial)) faltantes.push('razaoSocial');
  if (vazio(s.ie)) faltantes.push('ie');
  const e = s.endereco;
  if (vazio(e.logradouro)) faltantes.push('endereco.logradouro');
  // "S/N" é valor fiscal real, mas nunca pode ser suposto: só vale se alguém confirmou.
  if (vazio(e.numero)) faltantes.push('endereco.numero');
  else if (/^s\s*\/?\s*n$/i.test(e.numero!.trim()) && !ehConfirmado(s.origens['endereco.numero'])) faltantes.push('endereco.numero');
  if (vazio(e.bairro)) faltantes.push('endereco.bairro');
  if (vazio(e.municipio)) faltantes.push('endereco.municipio');
  if (!/^[A-Z]{2}$/.test(e.uf)) faltantes.push('endereco.uf');
  if (!/^\d{8}$/.test(e.cep)) faltantes.push('endereco.cep');
  if (!/^\d{7}$/.test(e.municipioIbge)) faltantes.push('endereco.municipioIbge');
  if (vazio(s.telefone) && vazio(s.celular)) faltantes.push('telefone');
  if (vazio(s.email)) faltantes.push('email');
  if (vazio(s.representanteDoc)) faltantes.push('representanteDoc');
  for (const campo of CAMPOS_COM_ORIGEM_OBRIGATORIA) {
    const v = s[campo];
    if (v != null && v !== '' && !s.origens[campo]) faltantes.push(`origens.${campo}`);
  }

  if (vazio(s.tipoTributacao) || !s.origens['tipoTributacao']) bloqueios.push('REGIME_SEM_FONTE');
  if (s.situacaoCadastral.trim().toUpperCase() !== 'ATIVA') bloqueios.push('SITUACAO_CADASTRAL_NAO_ATIVA');
  if (s.ieAtiva === false) bloqueios.push('IE_INATIVA');
  return { camposFaltantes: [...new Set(faltantes)], bloqueios };
}

/** Atalho com o nome do plano. */
export const camposFaltantes = (s: CadastroSnapshotV1): string[] => avaliarSnapshot(s).camposFaltantes;

// ── Serialização canônica + hashes ───────────────────────────────────────────

/** JSON determinístico: chaves ordenadas em todos os níveis, `undefined` omitido, número não finito = erro. */
export function canonico(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('número não finito na serialização canônica');
    return JSON.stringify(v);
  }
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonico(x))).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
  }
  throw new Error(`tipo não serializável: ${typeof v}`);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export const hashSnapshot = (s: CadastroSnapshotV1): string => sha256(canonico(s));

/** Parte do pedido que, se mudar, invalida aprovação e continuidade. Sem datas/estado do robô (mudam sem o pedido mudar). */
export interface PedidoParaHash {
  id: string;
  taskId: number | null;
  sellerId: number | null;
  sellerName: string;
  cnpj: string;
  clienteNome: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  comissaoPct: number;
  itens: Array<{ produtoId: string | null; descricao: string; quantidade: number; pesoKg: number; valorUnitario: number; isentoFrete?: boolean }>;
  prazoPagamentoSal: string;
  prazoPagamentoFrete: string;
  smbiCondpagSalCod: string | null;
  smbiCondpagFreteCod: string | null;
  valorFretePorUnidade: number;
}

export function hashPedido(p: PedidoParaHash): string {
  return sha256(canonico({
    id: p.id, taskId: p.taskId, sellerId: p.sellerId, sellerName: p.sellerName,
    cnpj: p.cnpj.replace(/\D/g, ''), clienteNome: p.clienteNome, razaoSocial: p.razaoSocial, cidade: p.cidade, uf: p.uf,
    comissaoPct: p.comissaoPct,
    itens: p.itens.map((i) => ({
      produtoId: i.produtoId, descricao: i.descricao, quantidade: i.quantidade, pesoKg: i.pesoKg,
      valorUnitario: i.valorUnitario, isentoFrete: i.isentoFrete ?? false,
    })),
    prazoPagamentoSal: p.prazoPagamentoSal, prazoPagamentoFrete: p.prazoPagamentoFrete,
    smbiCondpagSalCod: p.smbiCondpagSalCod, smbiCondpagFreteCod: p.smbiCondpagFreteCod,
    valorFretePorUnidade: p.valorFretePorUnidade,
  }));
}

// ── Estados e aprovação ──────────────────────────────────────────────────────

export const ehEstadoCadastro = (v: string): v is CadastroEstado => (CADASTRO_ESTADOS as readonly string[]).includes(v);

export function podeTransitar(de: CadastroEstado, para: CadastroEstado): boolean {
  return CADASTRO_TRANSICOES[de].includes(para);
}

export interface CadastroAprovavel {
  cnpj: string;
  estado: string;
  revisao: number;
  snapshot: CadastroSnapshotV1 | null;
  snapshotHash: string | null;
  pedidoHash: string | null;
  aprovadoPorId: number | null;
  aprovadoEm: Date | null;
  aprovacaoExpiraEm: Date | null;
}

export interface AprovacaoEsperada {
  cnpj?: string;
  revisao?: number;
  snapshotHash?: string;
  pedidoHash?: string;
}

/**
 * Motivo pelo qual a aprovação NÃO vale (ou null se vale). Vale só se: estado APROVADO, ator humano gravado,
 * dentro de 24 h, snapshot do MESMO CNPJ, hash gravado == hash recalculado do snapshot (adulteração ou edição
 * invalida) e, se informado, revisão/hashes/CNPJ esperados batem (aprovação de outra revisão ou de outro CNPJ não vale).
 */
export function motivoAprovacaoInvalida(c: CadastroAprovavel, agora: Date, esperado: AprovacaoEsperada = {}): string | null {
  if (c.estado !== 'APROVADO') return 'ESTADO_NAO_APROVADO';
  if (c.aprovadoPorId == null || !c.aprovadoEm || !c.aprovacaoExpiraEm) return 'SEM_APROVACAO';
  if (c.aprovacaoExpiraEm.getTime() - c.aprovadoEm.getTime() > APROVACAO_VALIDADE_MS) return 'VALIDADE_ACIMA_DO_LIMITE';
  if (c.aprovacaoExpiraEm.getTime() <= agora.getTime()) return 'APROVACAO_EXPIRADA';
  if (!c.snapshot || !c.snapshotHash || !c.pedidoHash) return 'SEM_SNAPSHOT';
  if (c.snapshot.cnpj !== c.cnpj) return 'CNPJ_DIFERENTE';
  if (hashSnapshot(c.snapshot) !== c.snapshotHash) return 'SNAPSHOT_ALTERADO';
  if (esperado.cnpj !== undefined && esperado.cnpj !== c.cnpj) return 'CNPJ_DIFERENTE';
  if (esperado.revisao !== undefined && esperado.revisao !== c.revisao) return 'REVISAO_DIFERENTE';
  if (esperado.snapshotHash !== undefined && esperado.snapshotHash !== c.snapshotHash) return 'SNAPSHOT_HASH_DIFERENTE';
  if (esperado.pedidoHash !== undefined && esperado.pedidoHash !== c.pedidoHash) return 'PEDIDO_HASH_DIFERENTE';
  return null;
}

export const aprovacaoValida = (c: CadastroAprovavel, agora: Date, esperado?: AprovacaoEsperada): boolean =>
  motivoAprovacaoInvalida(c, agora, esperado) === null;
