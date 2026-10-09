// Cadastro assistido CRM → SMBI (Fase 2, lado do CRM). Ver docs/SMBI-CADASTRO-ASSISTIDO.md.
// Tipos e máquina de estados compartilhados entre servidor, testes e (no futuro) a tela.
// O gate `cadastro_ativo` nasce DESLIGADO: nada aqui executa cadastro real.
// O cadastro é POR EMPRESA do SMBI: a chave é (empresaCnpj, cnpj) e a aprovação numa empresa não vale na outra.
import type { SmbiEmpresaCnpj } from './smbiEmpresas';

export const CADASTRO_ESTADOS = [
  'PREPARANDO', 'BLOQUEADO', 'AGUARDANDO_APROVACAO', 'APROVADO',
  'CADASTRANDO', 'CONFERIDO', 'INCERTO', 'DIVERGENTE', 'INVALIDADO',
] as const;
export type CadastroEstado = (typeof CADASTRO_ESTADOS)[number];

/**
 * Transições permitidas (de → lista de destinos). Tudo que não está aqui é proibido.
 * Regras que importam:
 *  - INCERTO nunca volta a CADASTRANDO: houve risco de escrita, só reconciliação (leitura)
 *    pode levá-lo a CONFERIDO/DIVERGENTE.
 *  - Só APROVADO chega a CADASTRANDO; APROVADO só nasce de AGUARDANDO_APROVACAO (ator humano admin).
 *  - CONFERIDO é terminal.
 *  - CONFERIDO também é alcançável sem escrita (cliente já existia no SMBI).
 */
export const CADASTRO_TRANSICOES: Record<CadastroEstado, readonly CadastroEstado[]> = {
  PREPARANDO: ['BLOQUEADO', 'AGUARDANDO_APROVACAO', 'CONFERIDO', 'INVALIDADO'],
  BLOQUEADO: ['PREPARANDO', 'INVALIDADO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'PREPARANDO', 'INVALIDADO'],
  APROVADO: ['CADASTRANDO', 'AGUARDANDO_APROVACAO', 'PREPARANDO', 'CONFERIDO', 'INVALIDADO'],
  CADASTRANDO: ['CONFERIDO', 'INCERTO', 'DIVERGENTE'],
  CONFERIDO: [],
  INCERTO: ['CONFERIDO', 'DIVERGENTE'],
  DIVERGENTE: ['INVALIDADO'],
  INVALIDADO: ['PREPARANDO'],
};

/** Quem já passou (ou pode ter passado) por escrita no SMBI: nunca reinicia o cadastro. */
export const CADASTRO_ESTADOS_COM_RISCO = ['CADASTRANDO', 'INCERTO', 'DIVERGENTE'] as const;

export const CADASTRO_ORIGENS = ['FISCAL_SMBI', 'CRM_CONFIRMADO', 'TARCYO_CONFIRMADO'] as const;
export type CadastroOrigem = (typeof CADASTRO_ORIGENS)[number];

/** Campos que a revisão de contatos (CRM) pode definir — nunca os fiscais. */
export const CADASTRO_CAMPOS_CONTATO = [
  'contato', 'telefone', 'celular', 'email', 'emailFinanceiro', 'representanteDoc', 'comissaoClientePct',
] as const;
export type CadastroCampoContato = (typeof CADASTRO_CAMPOS_CONTATO)[number];

export interface CadastroEndereco {
  logradouro: string;
  numero: string | null;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  municipioIbge: string;
}

export interface CadastroSnapshotV1 {
  versao: 1;
  /** Empresa do SMBI onde o cliente é cadastrado. Entra no hash: o mesmo cliente em outra empresa é outro snapshot. */
  empresaCnpj: SmbiEmpresaCnpj;
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  ie: string | null;
  situacaoCadastral: string;
  ieAtiva: boolean | null;
  endereco: CadastroEndereco;
  /** null = sem fonte: o cadastro fica BLOQUEADO (nunca se assume "tipo_1"). */
  tipoTributacao: string | null;
  contato: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  emailFinanceiro: string | null;
  representanteDoc: string | null;
  comissaoClientePct: number | null;
  /** Origem de cada campo relevante (chave = nome do campo, ex.: "telefone", "endereco.numero"). */
  origens: Record<string, CadastroOrigem>;
}

/** Contatos definidos pelo CRM (revisão); o servidor os mescla por cima do snapshot do worker. */
export type CadastroContatos = Partial<Record<CadastroCampoContato, { valor: string | number | null; origem: CadastroOrigem }>>;

export interface CadastroDivergencia {
  campo: string;
  esperado: string | number | boolean | null;
  lido: string | number | boolean | null;
}

export const CADASTRO_RESULTADOS = ['CONFERIDO', 'INCERTO', 'DIVERGENTE', 'JA_EXISTE_CONFERIDO'] as const;
export type CadastroResultado = (typeof CADASTRO_RESULTADOS)[number];

export const CADASTRO_FASES = ['PREVIA', 'CADASTRO', 'RESULTADO'] as const;

/** Envelope ÚNICO que a ferramenta da VPS escreve em stdout (logs vão para stderr). */
export interface CadastroEnvelopeV1 {
  versao: 1;
  ok: boolean;
  empresaCnpj: SmbiEmpresaCnpj;
  fase: (typeof CADASTRO_FASES)[number];
  estado: CadastroEstado | CadastroResultado | null;
  cnpj: string;
  cadastroId: string;
  revisao: number;
  snapshotHash: string | null;
  clienteId: string | null;
  /** true assim que a ferramenta passou do ponto de não-retorno (antes do submit). */
  houveRiscoDeEscrita: boolean;
  divergencias: CadastroDivergencia[];
  camposFaltantes: string[];
}
