import { SMBI_MOTIVO_CODIGOS, type SmbiMotivoCodigo } from '../../../../shared/smbiEstados.js';
import { formatCnpj } from '../../../../shared/radar.js';

/** Rótulo curto de cada motivo (selo da lista). A frase longa fica em SMBI_MOTIVO_ROTULO. */
export const SMBI_MOTIVO_CURTO: Record<SmbiMotivoCodigo, string> = {
  CLIENTE_NAO_CADASTRADO: 'Cliente não cadastrado no SMBI',
  PRAZO_SEM_CODIGO: 'Prazo sem código',
  PRODUTO_SEM_CODIGO: 'Produto sem código',
  MAIS_DE_UM_ITEM: 'Mais de um item',
  PRECO_INVALIDO: 'Preço inválido',
  CRIACAO_FALHOU: 'Criação falhou',
  DIVERGENTE_APOS_CRIAR: 'Divergente após criar',
  EMPRESA_NAO_HOMOLOGADA: 'Empresa não habilitada',
  EMPRESA_DIVERGENTE: 'Empresa divergente',
  SOLICITACAO_OBSOLETA: 'Envio desatualizado',
};

export interface SeloPendencia { rotulo: string; tom: 'warning' | 'danger'; codigo: SmbiMotivoCodigo }

interface PedidoMotivo {
  smbiEstado?: string | null;
  smbiMotivoCodigo?: string | null;
  smbiMovsaiId?: string | null;
  smbiVinculoEstado?: string | null;
}

export function motivoConhecido(c: string | null | undefined): SmbiMotivoCodigo | null {
  return (SMBI_MOTIVO_CODIGOS as readonly string[]).includes(c ?? '') ? (c as SmbiMotivoCodigo) : null;
}

/** Pendência devolvida pelo robô (só quando o pedido ainda não está ligado ao SMBI). null = sem selo. */
export function seloPendenciaSmbi(p: PedidoMotivo): SeloPendencia | null {
  if (p.smbiMovsaiId || p.smbiVinculoEstado) return null;
  if (!p.smbiEstado || p.smbiEstado === 'CRIADO') return null;
  const codigo = motivoConhecido(p.smbiMotivoCodigo);
  if (!codigo) return null;
  if (codigo === 'CLIENTE_NAO_CADASTRADO') return { rotulo: SMBI_MOTIVO_CURTO[codigo], tom: 'warning', codigo };
  return { rotulo: `Pendente: ${SMBI_MOTIVO_CURTO[codigo]}`, tom: p.smbiEstado === 'PENDENTE' ? 'warning' : 'danger', codigo };
}

export const clienteNaoCadastrado = (p: PedidoMotivo) => seloPendenciaSmbi(p)?.codigo === 'CLIENTE_NAO_CADASTRADO';

/** Contagem de pedidos com pendência armazenada, por motivo (ignora vinculados/criados). */
export function contarPendenciasPorMotivo(pedidos: PedidoMotivo[]): Partial<Record<SmbiMotivoCodigo, number>> {
  const out: Partial<Record<SmbiMotivoCodigo, number>> = {};
  for (const p of pedidos) {
    const s = seloPendenciaSmbi(p);
    if (s) out[s.codigo] = (out[s.codigo] ?? 0) + 1;
  }
  return out;
}

export interface DadosPedidoCadastro {
  id: string; cnpj: string; razaoSocial?: string; clienteNome: string; cidade?: string; uf?: string; sellerName: string;
}

/** Texto para colar no Hermes. Só texto: nada é gravado por aqui. */
export function textoPedidoCadastroHermes(p: DadosPedidoCadastro): string {
  const nome = (p.razaoSocial || p.clienteNome || '').trim() || 'razão social não informada';
  const local = [p.cidade, p.uf].map((s) => (s ?? '').trim()).filter(Boolean).join('/') || 'cidade/UF não informadas';
  const cnpj = p.cnpj ? formatCnpj(p.cnpj) : 'CNPJ não informado';
  return (
    `Cadastre este cliente no SMBI (cadastro assistido, com minha aprovação): CNPJ ${cnpj}, ${nome}, ${local}, ` +
    `atendente ${p.sellerName || 'não informado'}. Pedido CRM ${p.id}. ` +
    'Primeiro mostre a prévia (dry-run) com os dados fiscais, o representante e a comissão que o SMBI vai aplicar, ' +
    'e só grave depois do meu "cadastra". Não crie o pedido; o pedido segue pelo meu clique em Enviar para o SMBI depois do cadastro.'
  );
}
