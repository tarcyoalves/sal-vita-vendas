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
