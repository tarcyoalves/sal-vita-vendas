// Lógica PURA da tela de cadastro assistido (sem React, sem DOM): rótulos, "próxima ação",
// "pode aprovar?" e tradução de erros do servidor. A tela nunca calcula hash nem decide
// aprovação: o servidor é a fonte da verdade, aqui só se evita oferecer um botão que ele recusaria.
import {
  CADASTRO_ESTADOS, type CadastroEstado, type CadastroOrigem, type CadastroSnapshotV1,
} from '../../../../shared/smbiCadastro.js';

export type TomCadastro = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface EstadoUi {
  rotulo: string;
  tom: TomCadastro;
  /** O que o estado significa, em uma frase. */
  significado: string;
  /** Próxima ação para quem é admin / para quem é gerente. */
  proximaAdmin: string;
  proximaStaff: string;
}

export const ESTADO_UI: Record<CadastroEstado, EstadoUi> = {
  PREPARANDO: {
    rotulo: 'Preparando prévia', tom: 'info',
    significado: 'O robô ainda vai ler os dados fiscais do cliente (somente leitura). Nada foi gravado no SMBI.',
    proximaAdmin: 'Aguarde a prévia. Se o robô de cadastro estiver desligado, ela não sai.',
    proximaStaff: 'Aguarde a prévia. Você pode revisar os contatos enquanto isso.',
  },
  BLOQUEADO: {
    rotulo: 'Bloqueado', tom: 'danger',
    significado: 'A prévia encontrou um impedimento que ninguém pode contornar na tela (ex.: regime tributário sem fonte, situação cadastral não ativa).',
    proximaAdmin: 'Resolva o motivo indicado e prepare a prévia de novo; não há como aprovar assim.',
    proximaStaff: 'Avise o administrador sobre o motivo do bloqueio.',
  },
  AGUARDANDO_APROVACAO: {
    rotulo: 'Aguardando aprovação', tom: 'warning',
    significado: 'A prévia está pronta. Nada será cadastrado enquanto o administrador não aprovar.',
    proximaAdmin: 'Confira os dados abaixo e, se estiverem corretos, aprove.',
    proximaStaff: 'Confira os contatos. A aprovação é feita pelo administrador.',
  },
  APROVADO: {
    rotulo: 'Aprovado', tom: 'info',
    significado: 'Aprovado para o robô cadastrar estes dados. Vale 24 h e só para esta revisão. Ainda não foi gravado.',
    proximaAdmin: 'O robô cadastra quando o gate do cadastro automatizado estiver ligado. Se alterar contatos, a aprovação cai.',
    proximaStaff: 'Aguarde o robô. Alterar contatos cancela a aprovação.',
  },
  CADASTRANDO: {
    rotulo: 'Cadastrando no SMBI', tom: 'warning',
    significado: 'O robô passou do ponto sem volta e está gravando o cliente no SMBI agora.',
    proximaAdmin: 'Aguarde o resultado. Não reenvie o pedido.',
    proximaStaff: 'Aguarde o resultado. Não reenvie o pedido.',
  },
  CONFERIDO: {
    rotulo: 'Conferido', tom: 'success',
    significado: 'O cliente existe no SMBI e foi relido campo a campo sem diferenças.',
    proximaAdmin: 'Libere este pedido para o robô, se ainda não liberou.',
    proximaStaff: 'O administrador libera o pedido para o robô.',
  },
  INCERTO: {
    rotulo: 'Incerto', tom: 'danger',
    significado: 'O robô pode ter gravado o cliente, mas não conseguiu confirmar. O resultado precisa ser reconciliado por leitura.',
    proximaAdmin: 'Não reenvie nem recadastre. Confira o cliente no SMBI e acione o Hermes para reconciliar.',
    proximaStaff: 'Não reenvie nem recadastre. Avise o administrador.',
  },
  DIVERGENTE: {
    rotulo: 'Divergente', tom: 'danger',
    significado: 'O cliente foi gravado, mas a releitura difere do que foi aprovado.',
    proximaAdmin: 'Não reenvie nem recadastre. Confira as divergências no SMBI com o Hermes.',
    proximaStaff: 'Não reenvie nem recadastre. Avise o administrador.',
  },
  INVALIDADO: {
    rotulo: 'Invalidado', tom: 'neutral',
    significado: 'Este cadastro foi descartado antes de qualquer gravação.',
    proximaAdmin: 'Prepare o cadastro novamente.',
    proximaStaff: 'Prepare o cadastro novamente.',
  },
};

export const ehEstadoCadastro = (v: string | null | undefined): v is CadastroEstado =>
  (CADASTRO_ESTADOS as readonly string[]).includes(v ?? '');

/** Estado desconhecido (servidor mais novo que a tela) vira um rótulo neutro, nunca quebra. */
export function estadoUi(estado: string): EstadoUi {
  return ehEstadoCadastro(estado)
    ? ESTADO_UI[estado]
    : { rotulo: estado, tom: 'neutral', significado: 'Estado não reconhecido por esta tela.', proximaAdmin: 'Recarregue a página.', proximaStaff: 'Recarregue a página.' };
}

export function proximaAcao(estado: string, isAdmin: boolean): string {
  const u = estadoUi(estado);
  return isAdmin ? u.proximaAdmin : u.proximaStaff;
}

/** Estados em que o cadastro pode ter sido gravado no SMBI: nada de reenviar nem recadastrar. */
export const ehEstadoReconciliar = (estado: string) => estado === 'INCERTO' || estado === 'DIVERGENTE';

/** Estados que aceitam revisão de contatos (espelha ESTADOS_REVISAVEIS do servidor). */
export const ESTADOS_REVISAVEIS_UI: readonly string[] = ['PREPARANDO', 'BLOQUEADO', 'AGUARDANDO_APROVACAO', 'APROVADO'];
export const podeRevisarContatos = (estado: string) => ESTADOS_REVISAVEIS_UI.includes(estado);

// ── Campos ───────────────────────────────────────────────────────────────────

export const ORIGEM_ROTULO: Record<CadastroOrigem, string> = {
  FISCAL_SMBI: 'Fiscal (SMBI)',
  CRM_CONFIRMADO: 'CRM confirmado',
  TARCYO_CONFIRMADO: 'Confirmado pelo Tarcyo',
};

const CAMPO_ROTULO: Record<string, string> = {
  razaoSocial: 'Razão social', fantasia: 'Nome fantasia', ie: 'Inscrição estadual', situacaoCadastral: 'Situação cadastral',
  'endereco.logradouro': 'Endereço: logradouro', 'endereco.numero': 'Endereço: número', 'endereco.complemento': 'Endereço: complemento',
  'endereco.bairro': 'Endereço: bairro', 'endereco.municipio': 'Endereço: município', 'endereco.uf': 'Endereço: UF',
  'endereco.cep': 'Endereço: CEP', 'endereco.municipioIbge': 'Endereço: código IBGE do município',
  tipoTributacao: 'Regime tributário', contato: 'Contato', telefone: 'Telefone (ou celular)', celular: 'Celular', email: 'E-mail',
  emailFinanceiro: 'E-mail financeiro', representanteDoc: 'Representante (CPF/CNPJ)', comissaoClientePct: 'Comissão do cliente',
};

export function rotuloCampo(campo: string): string {
  if (campo.startsWith('origens.')) return `Origem de "${rotuloCampo(campo.slice(8))}" não informada`;
  return CAMPO_ROTULO[campo] ?? campo;
}

const BLOQUEIO_ROTULO: Record<string, string> = {
  REGIME_SEM_FONTE: 'Regime tributário sem fonte confirmada (nunca é assumido)',
  SITUACAO_CADASTRAL_NAO_ATIVA: 'Situação cadastral do CNPJ não está ATIVA',
  IE_INATIVA: 'Inscrição estadual inativa',
};
export const rotuloBloqueio = (b: string) => BLOQUEIO_ROTULO[b] ?? b;

/** "Faltam: Telefone, E-mail" — vazio se nada falta. */
export function formatarFaltantes(campos: readonly string[]): string {
  return campos.length === 0 ? '' : `Faltam: ${campos.map(rotuloCampo).join(', ')}`;
}

export interface LinhaPrevia { chave: string; rotulo: string; valor: string; origem: CadastroOrigem | null; faltante: boolean }

/**
 * Linhas da tabela da prévia. Mostra exatamente o que veio no snapshot; valor ausente aparece como
 * "não informado" (e destacado se for campo faltante). Não preenche nenhum default.
 */
export function linhasPrevia(s: CadastroSnapshotV1, faltantes: readonly string[]): LinhaPrevia[] {
  const falta = new Set(faltantes);
  const txt = (v: string | number | boolean | null | undefined) => (v === null || v === undefined || v === '' ? '' : String(v));
  const e = s.endereco;
  const ender = [
    [e.logradouro, e.numero].map(txt).filter(Boolean).join(', '), txt(e.complemento), txt(e.bairro),
    [e.municipio, e.uf].map(txt).filter(Boolean).join('/'), e.cep ? `CEP ${e.cep}` : '', e.municipioIbge ? `IBGE ${e.municipioIbge}` : '',
  ].filter(Boolean).join(' · ');
  const def: Array<[string, string, string]> = [
    ['cnpj', 'CNPJ', s.cnpj], ['razaoSocial', 'Razão social', s.razaoSocial], ['fantasia', 'Nome fantasia', s.fantasia],
    ['ie', 'Inscrição estadual', txt(s.ie)], ['situacaoCadastral', 'Situação cadastral', s.situacaoCadastral],
    ['endereco', 'Endereço', ender], ['tipoTributacao', 'Regime tributário', txt(s.tipoTributacao)],
    ['contato', 'Contato', txt(s.contato)], ['telefone', 'Telefone', txt(s.telefone)], ['celular', 'Celular', txt(s.celular)],
    ['email', 'E-mail', txt(s.email)], ['emailFinanceiro', 'E-mail financeiro', txt(s.emailFinanceiro)],
    ['representanteDoc', 'Representante (CPF/CNPJ)', txt(s.representanteDoc)],
    ['comissaoClientePct', 'Comissão do cliente (%)', txt(s.comissaoClientePct)],
  ];
  return def.map(([chave, rotulo, valor]) => {
    // Endereço agrega vários campos: a origem/falta vale se qualquer parte tiver.
    const partes = chave === 'endereco' ? Object.keys(e).map((k) => `endereco.${k}`) : [chave];
    const origemChave = partes.find((p) => s.origens[p]);
    return {
      chave, rotulo, valor: valor || 'não informado',
      origem: origemChave ? s.origens[origemChave] : null,
      faltante: partes.some((p) => falta.has(p)),
    };
  });
}

export interface DivergenciaUi { campo: string; esperado: string; lido: string }

/** O servidor guarda `divergencias` como lista do robô ou como objeto; só a lista vira linhas. */
export function listarDivergencias(d: unknown): DivergenciaUi[] {
  if (!Array.isArray(d)) return [];
  const f = (v: unknown) => (v === null || v === undefined ? '—' : String(v));
  return d
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({ campo: rotuloCampo(String(x.campo ?? '?')), esperado: f(x.esperado), lido: f(x.lido) }));
}

// ── Aprovação ────────────────────────────────────────────────────────────────

export interface CondicoesAprovacao {
  isAdmin: boolean;
  estado: string;
  camposFaltantes: readonly string[];
  bloqueios: readonly string[];
  pedidoAlterado: boolean;
  temSnapshotEHashes: boolean;
  /** true se a revisão/hashes que o admin viu já não são os do servidor (a tela ficou velha). */
  revisaoVelha: boolean;
}

/** Só decide se o botão é oferecido. Quem realmente aprova (ou recusa) é o servidor. */
export function podeAprovar(c: CondicoesAprovacao): { ok: true } | { ok: false; motivo: string } {
  if (!c.isAdmin) return { ok: false, motivo: 'Só o administrador aprova.' };
  if (c.estado !== 'AGUARDANDO_APROVACAO') return { ok: false, motivo: 'Só se aprova um cadastro em "Aguardando aprovação".' };
  if (!c.temSnapshotEHashes) return { ok: false, motivo: 'Ainda não há prévia.' };
  if (c.revisaoVelha) return { ok: false, motivo: 'A tela ficou desatualizada. Atualize a consulta antes de aprovar.' };
  if (c.pedidoAlterado) return { ok: false, motivo: 'O pedido foi alterado depois da prévia. Prepare o cadastro de novo.' };
  if (c.camposFaltantes.length > 0) return { ok: false, motivo: formatarFaltantes(c.camposFaltantes) };
  if (c.bloqueios.length > 0) return { ok: false, motivo: c.bloqueios.map(rotuloBloqueio).join('; ') };
  return { ok: true };
}

export const TEXTO_APROVACAO =
  'Aprovar autoriza o robô a CADASTRAR este cliente no SMBI com estes dados. A aprovação vale 24 h e só para estes dados.';

// ── Erros do servidor ────────────────────────────────────────────────────────

const ERRO_ROTULO: Record<string, string> = {
  CONTATO_AMBIGUO: 'Não dá para confirmar este contato pelo CRM: a tarefa do pedido precisa ter o mesmo CNPJ e exatamente o mesmo valor. Peça ao administrador para confirmar.',
  SO_ADMIN: 'Esta ação é só do administrador.',
  ORIGEM_PROIBIDA: 'Esta origem não pode ser usada na tela.',
  VALOR_INVALIDO: '',
  SEM_CONTATOS: 'Preencha ao menos um contato para revisar.',
  REVISAO_DESATUALIZADA: 'O cadastro mudou enquanto você olhava. Os dados foram recarregados; confira e tente de novo.',
  CONCORRENCIA: 'O cadastro mudou agora há pouco. Os dados foram recarregados; confira e tente de novo.',
  SNAPSHOT_HASH_DIFERENTE: 'A prévia mudou. Os dados foram recarregados; confira e aprove de novo.',
  PEDIDO_ALTERADO: 'O pedido foi alterado desde que você o viu. Recarregue e confira antes de continuar.',
  CADASTRO_BLOQUEADO: 'Há campos faltantes ou bloqueios: não é possível aprovar.',
  ESTADO_INVALIDO: 'O cadastro não está em um estado que permita esta ação.',
  SEM_SNAPSHOT: 'Ainda não há prévia do cadastro.',
  GATE_DESLIGADO: 'O cadastro automatizado ou o robô do SMBI está desligado.',
  TENTATIVA_ANTERIOR: 'Houve tentativa de cadastro anterior: confira o SMBI manualmente antes de qualquer nova ação.',
  OUTRO_PEDIDO: 'Já existe cadastro deste CNPJ ligado a outro pedido.',
  PEDIDO_JA_PROCESSADO: 'O pedido já foi criado, vinculado ou faturado no SMBI.',
  SEM_PENDENCIA_DE_CLIENTE: 'O pedido não está pendente por "cliente não cadastrado".',
  CNPJ_INVALIDO: 'O CNPJ do pedido é inválido. Corrija o pedido.',
  PEDIDO_NAO_APROVADO: 'O pedido precisa estar aprovado.',
};

export interface ErroUi { mensagem: string; recarregar: boolean }

const CODIGOS_RECARREGAR = new Set(['REVISAO_DESATUALIZADA', 'CONCORRENCIA', 'SNAPSHOT_HASH_DIFERENTE', 'PEDIDO_ALTERADO', 'ESTADO_INVALIDO']);

/** Traduz a mensagem do servidor ("texto [CODIGO]") sem expor stack nem JSON de validação. */
export function mensagemErroCadastro(erro: unknown): ErroUi {
  const bruto = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '';
  const m = /\[([A-Z_]+)\]\s*$/.exec(bruto);
  const codigo = m?.[1] ?? null;
  const semCodigo = m ? bruto.slice(0, m.index).trim() : bruto.trim();
  if (codigo && ERRO_ROTULO[codigo]) return { mensagem: ERRO_ROTULO[codigo], recarregar: CODIGOS_RECARREGAR.has(codigo) };
  if (!semCodigo || /^[[{]/.test(semCodigo)) return { mensagem: 'Dados inválidos ou ação não permitida. Confira os campos.', recarregar: false };
  return { mensagem: semCodigo.split('\n')[0].slice(0, 300), recarregar: !!codigo && CODIGOS_RECARREGAR.has(codigo) };
}

// ── Formulário de contatos ───────────────────────────────────────────────────

export const CAMPOS_CONTATO_FORM = ['contato', 'telefone', 'celular', 'email', 'emailFinanceiro'] as const;
export type CampoContatoForm = (typeof CAMPOS_CONTATO_FORM)[number];

export const origensPermitidas = (isAdmin: boolean): CadastroOrigem[] =>
  isAdmin ? ['CRM_CONFIRMADO', 'TARCYO_CONFIRMADO'] : ['CRM_CONFIRMADO'];

/** Só os campos que o usuário mexeu (ou escolheu confirmar) vão ao servidor; vazio nunca apaga. */
export function montarContatos(
  editados: Partial<Record<CampoContatoForm, string>>,
  origens: Partial<Record<CampoContatoForm, CadastroOrigem>>,
  isAdmin: boolean,
): Partial<Record<CampoContatoForm, { valor: string; origem: CadastroOrigem }>> {
  const permitidas = origensPermitidas(isAdmin);
  const out: Partial<Record<CampoContatoForm, { valor: string; origem: CadastroOrigem }>> = {};
  for (const c of CAMPOS_CONTATO_FORM) {
    const v = (editados[c] ?? '').trim();
    if (!v) continue;
    const o = origens[c] ?? 'CRM_CONFIRMADO';
    out[c] = { valor: v, origem: permitidas.includes(o) ? o : 'CRM_CONFIRMADO' };
  }
  return out;
}
