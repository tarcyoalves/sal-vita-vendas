// Estados e motivos que o robô do SMBI devolve ao CRM (CONTRATO-ROBO-CRM.md, rota 2).
// Vale para o servidor (validação do corpo) e para a tela (selo + "por que não foi").

export const SMBI_ESTADOS = ['CRIADO', 'PENDENTE', 'ERRO', 'DIVERGENTE'] as const;
export type SmbiEstado = (typeof SMBI_ESTADOS)[number];

export const SMBI_ESTADO_ROTULO: Record<SmbiEstado, string> = {
  CRIADO: 'Criado no SMBI',
  PENDENTE: 'Pendente — o robô não criou',
  ERRO: 'Erro ao criar no SMBI',
  DIVERGENTE: 'Criado, mas diverge do CRM',
};

export const SMBI_MOTIVO_CODIGOS = [
  'CLIENTE_NAO_CADASTRADO',
  'PRAZO_SEM_CODIGO',
  'PRODUTO_SEM_CODIGO',
  'MAIS_DE_UM_ITEM',
  'PRECO_INVALIDO',
  'CRIACAO_FALHOU',
  'DIVERGENTE_APOS_CRIAR',
] as const;
export type SmbiMotivoCodigo = (typeof SMBI_MOTIVO_CODIGOS)[number];

/** Frase para o atendente entender o que fazer. */
export const SMBI_MOTIVO_ROTULO: Record<SmbiMotivoCodigo, string> = {
  CLIENTE_NAO_CADASTRADO: 'Cliente não cadastrado no SMBI — cadastre o cliente lá e envie de novo.',
  PRAZO_SEM_CODIGO: 'Prazo de pagamento sem código do SMBI — escolha um prazo da lista e envie de novo.',
  PRODUTO_SEM_CODIGO: 'Produto sem código do SMBI — avise o administrador.',
  MAIS_DE_UM_ITEM: 'Pedido com mais de um item — o robô ainda não cria esse tipo de pedido.',
  PRECO_INVALIDO: 'Preço, quantidade ou frete inválido — confira os valores do pedido.',
  CRIACAO_FALHOU: 'O SMBI recusou ou falhou ao criar — o robô tentará de novo se você enviar outra vez.',
  DIVERGENTE_APOS_CRIAR: 'O pedido foi criado no SMBI, mas não confere com o CRM — confira os dois antes de seguir.',
};

/** Sem batimento do robô por mais que isto, a tela avisa (contrato, rota 8). */
export const SMBI_ROBO_SEM_SINAL_MIN = 10;

/**
 * Reserva de um pedido para UM ciclo do robô (anti-duplicidade): enquanto ela vale, nenhuma
 * outra consulta recebe o pedido, e a re-checagem `?id=` exige o token. Passado o prazo o pedido
 * volta à lista (o robô protege esse caso procurando a marca `CRM:<id>` no SMBI).
 */
export const SMBI_RESERVA_MIN = 15;

/** Estados que tiram o pedido da lista do robô até um NOVO clique do dono (sem retentativa automática). */
export const SMBI_ESTADOS_QUE_PARAM = ['PENDENTE', 'ERRO', 'DIVERGENTE'] as const;

/** Eventos que o robô reporta na linha do tempo do pedido (contrato, rota 7). */
export const SMBI_EVENTOS_ROBO = ['EM_OE', 'FATURADO', 'CIOT', 'MDFE', 'CANCELADO_SMBI', 'EXCLUIDO_SMBI'] as const;
export type SmbiEventoRobo = (typeof SMBI_EVENTOS_ROBO)[number];
/** Ações humanas registradas na mesma linha do tempo (auditoria). */
export const SMBI_EVENTOS_TELA = ['ENVIO_SOLICITADO', 'ENVIO_CANCELADO', 'VINCULADO', 'VINCULO_CONFIRMADO', 'DESVINCULADO'] as const;

export const SMBI_EVENTO_ROTULO: Record<string, string> = {
  EM_OE: 'Entrou em ordem de embarque',
  FATURADO: 'Faturado no SMBI',
  CIOT: 'CIOT emitido',
  MDFE: 'MDF-e emitido',
  CANCELADO_SMBI: 'Cancelado no SMBI',
  EXCLUIDO_SMBI: 'Excluído no SMBI (vínculo desfeito)',
  ENVIO_SOLICITADO: 'Envio ao SMBI solicitado',
  ENVIO_CANCELADO: 'Envio ao SMBI cancelado',
  VINCULADO: 'Vinculado a pedido do SMBI',
  VINCULO_CONFIRMADO: 'Vínculo confirmado pelo administrador',
  DESVINCULADO: 'Vínculo desfeito',
  VINCULO_CONFERIDO: 'Robô conferiu o vínculo: tudo bate',
  VINCULO_DIVERGENTE: 'Robô conferiu o vínculo: há divergência',
};

/** Conferência do vínculo manual (rotas 4/5/6 do contrato). */
export const SMBI_VINCULO_ESTADOS = ['PENDENTE_CONFERENCIA', 'CONFERIDO', 'VINCULO_COM_DIVERGENCIA'] as const;
export type SmbiVinculoEstado = (typeof SMBI_VINCULO_ESTADOS)[number];
export const SMBI_VINCULO_ROTULO: Record<SmbiVinculoEstado, string> = {
  PENDENTE_CONFERENCIA: 'Vinculado — aguardando o robô conferir no SMBI',
  CONFERIDO: 'Vínculo conferido (cliente, produto e quantidade batem)',
  VINCULO_COM_DIVERGENCIA: 'Vínculo com divergência — confira antes de confirmar',
};

// ── Espelho fiscal (só leitura no CRM; nunca altera valor comercial nem comissão) ──
export interface SmbiNfe { numero?: string; chave?: string; data?: string; valorTotal?: number; valorSal?: number }
export interface SmbiCte { numero?: string; chave?: string; valorFrete?: number }
export interface SmbiMovsaiFiscal { id: string; pesoKg?: number | null; nfe?: SmbiNfe | null; cte?: SmbiCte | null }
export interface SmbiEspelhoFiscal {
  movsais: SmbiMovsaiFiscal[];
  faturadoEm: string | null;
  snapshotHash: string | null;
  recebidoEm: string;
  /** sal (NF-e) + frete (CT-e) somados de todos os movsais. */
  totalFiscal: number;
  /** total acordado no CRM (itens + frete) no momento do recebimento. */
  totalAcordado: number;
  /** peso líquido do pedido no CRM e soma dos pesos dos movsais (kg). Ausentes em espelhos antigos. */
  pesoPedidoKg?: number;
  pesoFaturadoKg?: number;
  /** total acordado ajustado ao peso faturado: com a quantidade alterada, é isso que o fiscal deveria somar. */
  totalEsperado?: number;
}

/** Comparação lado a lado para o admin decidir um vínculo com divergência. */
export interface SmbiVinculoResultado {
  recebidoEm: string;
  confere: { cliente: boolean; produto: boolean; quantidade: boolean };
  movsais: Array<{
    id: string; cnpj?: string; cliente?: string; faturado?: boolean; status?: string;
    itens?: Array<{ produto: string; qtdKg: number; valorUnit?: number }>;
    /** Guardados para o admin poder confirmar uma divergência e espelhar o faturamento depois. */
    pesoKg?: number | null; nfe?: SmbiNfe | null; cte?: SmbiCte | null;
  }>;
}
