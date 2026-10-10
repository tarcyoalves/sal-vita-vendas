// Lógica pura (sem DOM) do envio ao SMBI com escolha de empresa. Ver docs/SMBI-MULTIEMPRESA.md.
// O CNPJ do COMPRADOR (pedido.cnpj) nunca passa por aqui: só o campo smbiEmpresaCnpj é lido como empresa.
import { SMBI_EMPRESAS, empresaPorCnpj, formatarCnpj, type SmbiEmpresa } from '../../../../shared/smbiEmpresas.js';
import { SMBI_ESTADO_ROTULO, type SmbiEstado } from '../../../../shared/smbiEstados.js';
import { SMBI_MOTIVO_CURTO, motivoConhecido } from './smbiPendencia';

export interface PedidoEmpresa {
  smbiEmpresaCnpj?: string | null;
  smbiEmpresaTravadaEm?: string | null;
  smbiEscritaIniciadaEm?: string | null;
  smbiMovsaiId?: string | null;
  smbiVinculoEstado?: string | null;
  smbiVinculoMovsais?: string[] | null;
  smbiSolicitadoEm?: string | null;
  smbiEstado?: string | null;
  smbiMotivoCodigo?: string | null;
}

export const TEXTO_NAO_HABILITADA = 'Ainda não habilitada (códigos do SMBI em homologação)';
export const TEXTO_SEM_EMPRESA = 'Empresa não definida';
export const AVISO_ESCRITA_INICIADA = 'O robô já começou a criar este pedido. Não reenvie: confira no SMBI e use Vincular.';
export const AVISO_CADASTRO_POR_EMPRESA = 'O cadastro vale só para esta empresa; a outra empresa precisa de cadastro próprio.';

/** Campos de empresa que só o servidor escreve. O upsert do formulário nunca os envia nem os apaga. */
export const CAMPOS_EMPRESA_SOMENTE_LEITURA = [
  'smbiEmpresaCnpj', 'smbiSolicitacaoId', 'smbiEmpresaTravadaEm', 'smbiEscritaIniciadaEm', 'smbiEmpresaOrigem', 'numeroCrm',
] as const;

export function semCamposEmpresa<T extends object>(p: T): T {
  const out = { ...p } as Record<string, unknown>;
  for (const c of CAMPOS_EMPRESA_SOMENTE_LEITURA) delete out[c];
  return out as T;
}

export const empresaDoPedido = (p: Pick<PedidoEmpresa, 'smbiEmpresaCnpj'>): SmbiEmpresa | null => empresaPorCnpj(p.smbiEmpresaCnpj);

/** Rótulo curto da empresa do pedido. Legado: "Empresa não definida" (nunca inventa uma empresa). */
export function rotuloEmpresa(p: Pick<PedidoEmpresa, 'smbiEmpresaCnpj'>): string {
  if (!p.smbiEmpresaCnpj) return TEXTO_SEM_EMPRESA;
  return empresaDoPedido(p)?.curto ?? 'Empresa fora do catálogo';
}

export const empresaTravada = (p: Pick<PedidoEmpresa, 'smbiEmpresaTravadaEm'>) => !!p.smbiEmpresaTravadaEm;

/** Robô começou a escrever e não devolveu número: só reconciliação humana (Vincular). */
export const escritaIniciadaSemMovsai = (p: Pick<PedidoEmpresa, 'smbiEscritaIniciadaEm' | 'smbiMovsaiId'>) =>
  !!p.smbiEscritaIniciadaEm && !p.smbiMovsaiId;

const numerosSmbi = (p: PedidoEmpresa) => (p.smbiVinculoMovsais?.length ? p.smbiVinculoMovsais.join(', ') : (p.smbiMovsaiId ?? ''));

/**
 * Texto de andamento por empresa. null = nada a dizer (pedido sem empresa ou ainda não enviado).
 * Pendência devolvida pelo robô vence "aguardando", porque o clique novo zera o estado no servidor.
 */
export function andamentoEmpresa(p: PedidoEmpresa): string | null {
  const emp = empresaDoPedido(p);
  if (!emp) return null;
  if (p.smbiMovsaiId || p.smbiVinculoEstado) {
    const n = numerosSmbi(p);
    return `Criado na ${emp.curto}${n ? ` — Pedido ${n}` : ''}`;
  }
  if (p.smbiEstado && p.smbiEstado !== 'CRIADO') {
    const cod = motivoConhecido(p.smbiMotivoCodigo);
    const o = cod ? SMBI_MOTIVO_CURTO[cod] : (SMBI_ESTADO_ROTULO[p.smbiEstado as SmbiEstado] ?? p.smbiEstado);
    return `${emp.curto}: ${o}`;
  }
  if (p.smbiSolicitadoEm) return `Aguardando envio — ${emp.curto}`;
  return null;
}

/** Coluna "Empresa SMBI" do CSV: a empresa; "Empresa não definida" só se o pedido já foi ao SMBI sem empresa (legado); senão vazio. */
export function empresaParaCsv(p: PedidoEmpresa): string {
  if (p.smbiEmpresaCnpj) return rotuloEmpresa(p);
  return p.smbiSolicitadoEm || p.smbiMovsaiId || p.smbiVinculoEstado ? TEXTO_SEM_EMPRESA : '';
}

export interface OpcaoEmpresa {
  empresa: SmbiEmpresa;
  cnpjFormatado: string;
  desabilitada: boolean;
  /** Por que está desabilitada (null se está disponível). */
  motivo: string | null;
}

/** As duas empresas do catálogo; não habilitada (ou outra que a travada) vem desabilitada. Nunca há pré-seleção. */
export function opcoesEmpresa(
  p: Pick<PedidoEmpresa, 'smbiEmpresaCnpj' | 'smbiEmpresaTravadaEm'>,
  // Vínculo manual e cadastro não criam pedido: a homologação do robô não os impede (o servidor também não exige).
  opts: { exigeHomologada?: boolean } = {},
): OpcaoEmpresa[] {
  const exigeHomologada = opts.exigeHomologada ?? true;
  const travada = empresaTravada(p);
  return SMBI_EMPRESAS.map((empresa) => {
    let motivo: string | null = null;
    if (exigeHomologada && !empresa.homologada) motivo = TEXTO_NAO_HABILITADA;
    else if (travada && p.smbiEmpresaCnpj !== empresa.cnpj) motivo = 'Empresa já travada neste pedido';
    return { empresa, cnpjFormatado: formatarCnpj(empresa.cnpj), desabilitada: motivo !== null, motivo };
  });
}

/** Com o interruptor ligado o clique abre o diálogo de empresa; desligado, o fluxo antigo (só { id }). */
export const abreDialogoDeEmpresa = (multiempresaAtivo: boolean | undefined) => multiempresaAtivo === true;

/** Em qual empresa o envio vai: a travada (definitiva) ou a escolhida. null = ainda sem escolha. */
export function empresaDoEnvio(p: Pick<PedidoEmpresa, 'smbiEmpresaCnpj' | 'smbiEmpresaTravadaEm'>, escolhida: string | null): SmbiEmpresa | null {
  const alvo = empresaTravada(p) ? p.smbiEmpresaCnpj : escolhida;
  const emp = empresaPorCnpj(alvo);
  if (!emp) return null;
  return opcoesEmpresa(p).find((o) => o.empresa.cnpj === emp.cnpj)?.desabilitada ? null : emp;
}

export const textoBotaoFinal = (e: SmbiEmpresa | null) => (e ? `Enviar para ${e.curto}` : 'Escolha a empresa');

export const textoBotaoEnvio = (p: Pick<PedidoEmpresa, 'smbiSolicitadoEm'>) =>
  p.smbiSolicitadoEm ? 'Reenviar ao SMBI' : 'Enviar pedido para SMBI';

/**
 * Por que o botão de envio NÃO deve aparecer (null = pode aparecer). Espelha as recusas do servidor que a tela já
 * conhece; as demais (reserva, pedido editado...) vêm na mensagem do servidor e são mostradas no toast.
 */
export function bloqueioDeEnvio(p: PedidoEmpresa, multiempresaAtivo: boolean | undefined): string | null {
  if (escritaIniciadaSemMovsai(p)) return AVISO_ESCRITA_INICIADA;
  if (!multiempresaAtivo && p.smbiEmpresaCnpj) {
    return 'Este pedido já tem empresa escolhida e o envio com escolha de empresa está desligado.';
  }
  return null;
}

/** Vínculo manual: empresa exigida na tela quando o pedido não tem e o interruptor está ligado. */
export const vinculoExigeEscolha = (p: Pick<PedidoEmpresa, 'smbiEmpresaCnpj'>, multiempresaAtivo: boolean | undefined) =>
  multiempresaAtivo === true && !p.smbiEmpresaCnpj;

/** Cadastro assistido: o botão "Preparar cadastro" exige escolher antes? */
export const cadastroExigeEscolha = vinculoExigeEscolha;

export const tituloCadastroEmpresa = (cnpj: string | null | undefined): string | null => {
  const e = empresaPorCnpj(cnpj);
  return e ? `Cadastro na ${e.curto}` : null;
};
