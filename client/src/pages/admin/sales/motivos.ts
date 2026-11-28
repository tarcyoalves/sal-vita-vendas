// Tradução dos códigos que o servidor devolve (elegibilidade, despacho, árbitro, ciclo) para português
// simples. Arquivo compartilhado pelas abas do painel "Vendas B2B". Código desconhecido nunca quebra:
// cai em `humanizar`. tests/sales-painel.test.ts garante que todo código emitido no servidor está aqui.

export const MOTIVOS: Record<string, string> = {
  // Elegibilidade (server/lib/sales/elegibilidade.ts)
  email_invalido: 'E-mail com formato inválido',
  dominio_bloqueado: 'Domínio de e-mail na lista de bloqueio',
  canal_desligado: 'Canal de envio desligado',
  politica_do_canal_nao_aprovada: 'Política do provedor de e-mail ainda não aprovada',
  empresa_inativa: 'Empresa inativa na Receita',
  fora_do_publico: 'Empresa fora do público da caixa de 10 kg',
  sem_evidencia_de_compatibilidade: 'Sem sinal de que a empresa usa o produto',
  fora_da_onda: 'Estado fora das ondas de prospecção',
  origem_nao_verificavel: 'Não sabemos de onde veio o e-mail',
  email_do_cadastro_cnpj: 'E-mail veio do cadastro do CNPJ (costuma ser do contador)',
  email_compartilhado: 'E-mail usado por várias empresas (provável contador)',
  email_de_pessoa: 'E-mail parece ser de uma pessoa, não da empresa',
  webmail_sem_publicacao_comercial: 'E-mail gratuito que a empresa não publicou como comercial',
  supressao_indisponivel: 'Não foi possível consultar a lista de quem pediu para sair',
  suprimido: 'Contato na lista de quem não quer receber',
  ja_prospectado: 'Empresa já recebeu uma sequência antes',
  // Despacho (server/lib/sales/despacho.ts) e árbitro (server/lib/sales/arbitro.ts)
  nao_reservada: 'Mensagem não estava reservada para envio',
  outro_executor: 'Reserva pertence a outro executor',
  fence_antigo: 'Reserva desatualizada',
  token_invalido: 'Autorização de envio inválida',
  reserva_vencida: 'Reserva venceu antes do envio',
  pausado: 'Operação pausada',
  canal_fechado: 'Canal desligado ou sem política aprovada',
  modo_nao_permite: 'O modo atual não permite este envio',
  sem_jornada: 'Jornada da empresa não encontrada',
  jornada_pausada: 'Jornada pausada',
  estado_mudou: 'A situação da empresa mudou antes do envio',
  inelegivel: 'Deixou de ser elegível no momento do envio',
  teto_diario: 'Limite diário de envios atingido',
  teto_novas: 'Limite diário de empresas novas atingido',
  teto_empresa: 'Empresa já recebeu o máximo de mensagens',
  intervalo_minimo: 'Pouco tempo desde a última mensagem para este e-mail',
  // Geração de mensagem (ciclo)
  modelo_rascunho: 'Modelo de e-mail ainda é rascunho (aprove em Configurações)',
  remetente_incompleto: 'Dados do remetente incompletos',
  sem_dominio: 'Domínio do canal não informado',
  texto_barrado: 'Texto barrado pelas travas de conteúdo',
  sem_passo: 'Modelo sem o passo necessário',
  mercado_livre_nao_configurado: 'Link do Mercado Livre não informado',
};

/** "algum_codigo_novo" → "Algum codigo novo". Último recurso para códigos que ainda não têm tradução. */
export function humanizar(codigo: string): string {
  const t = codigo.replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : codigo;
}

export function traduzirMotivo(codigo: string): string {
  return MOTIVOS[codigo] ?? humanizar(codigo);
}

export const SEVERIDADE_LABEL: Record<string, string> = { critica: 'Crítica', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
export const SEVERIDADE_ORDEM: Record<string, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };

export const EXCECAO_LABEL: Record<string, string> = {
  resposta_humana: 'Uma pessoa respondeu',
  pedido_grande: 'Pedido grande',
  pergunta_sensivel: 'Pergunta sensível',
  reclamacao: 'Reclamação',
  pediu_pessoa: 'Pediu para falar com uma pessoa',
  lead_sem_email: 'Lead sem e-mail',
  lead_atacado: 'Lead do atacado',
  cliente_parado: 'Cliente parado',
  envio_desconhecido: 'Envio sem confirmação',
  falha_integracao: 'Falha de integração',
  supressao_inconsistente: 'Lista de saída inconsistente',
  proposta_hermes: 'Proposta do Hermes',
  alegacao_barrada: 'Resposta barrada por alegação proibida',
  heartbeat_ausente: 'Executor sem dar sinal',
  outro: 'Outro',
};

export const MENSAGEM_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando envio',
  RESERVED: 'Reservada',
  DISPATCHING: 'Enviando',
  ACCEPTED: 'Aceita pelo servidor de e-mail',
  UNKNOWN: 'Sem confirmação',
  RETRYABLE_FAILURE: 'Falhou, vai tentar de novo',
  PERMANENT_FAILURE: 'Falhou de vez',
  CANCELLED: 'Cancelada',
};

export const KB_KIND_LABEL: Record<string, string> = {
  produto: 'Produto',
  politica: 'Políticas',
  objecao: 'Objeções',
  resposta_padrao: 'Respostas padrão',
  proibido: 'Proibido dizer',
};

export const KB_STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', approved: 'Aprovado', archived: 'Arquivado' };

export const DISPONIBILIDADE_LABEL: Record<string, string> = {
  nao_informado: 'Não informado',
  disponivel: 'Disponível',
  em_falta: 'Em falta',
};

/** Variáveis do modelo de e-mail. Espelha server/routers/salesRegras.ts (um teste confere). */
export const PLACEHOLDERS: ReadonlyArray<{ chave: string; descricao: string }> = [
  { chave: '{empresa}', descricao: 'Nome da empresa' },
  { chave: '{abertura}', descricao: 'Linha de abertura (só se a abertura por IA estiver ligada)' },
  { chave: '{link_site}', descricao: 'Link do site da loja' },
  { chave: '{link_mercado_livre}', descricao: 'Link do anúncio no Mercado Livre' },
  { chave: '{link_descadastro}', descricao: 'Link para não receber mais mensagens (obrigatório)' },
  { chave: '{remetente_nome}', descricao: 'Nome de quem envia' },
  { chave: '{remetente_razao_social}', descricao: 'Razão social' },
  { chave: '{remetente_cnpj}', descricao: 'CNPJ' },
  { chave: '{remetente_endereco}', descricao: 'Endereço' },
];

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

/** Situação do lote diário (sales_batches.status). */
export const LOTE_STATUS_LABEL: Record<string, string> = {
  draft: 'aguardando sua aprovação',
  approved: 'aprovado',
  cancelled: 'cancelado',
};
export function rotuloLote(status: string): string {
  return LOTE_STATUS_LABEL[status] ?? status;
}
