// Sal Vita Sales AI — contrato compartilhado (servidor, painel e testes).
// Venda B2B da caixa de 10 kg do Sal Vita Premium. Projeto: V3.1 (documento do dono, fora do repo).
//
// Regras deste módulo que NÃO podem ser relaxadas sem o dono:
//  - O modo padrão é DRY_RUN e o canal de prospecção nasce DESLIGADO: nenhuma mensagem real sai
//    até o dono escolher a caixa de envio, registrar a conferência dos termos do provedor e mudar o modo.
//  - Resend e Brevo NUNCA são usados para prospecção fria (as políticas deles proíbem — V3.1, seção 2.1).
//  - Clique em link não é autorização nem prova de interesse.
//  - Supressão prevalece sobre qualquer estado. Falha ao consultar a supressão = não envia.
import { z } from 'zod';

// ── Modos de operação ────────────────────────────────────────────────────────────────────────
export const SALES_MODES = ['DRY_RUN', 'REVIEW', 'SEMI_AUTONOMOUS', 'AUTONOMOUS', 'PAUSED'] as const;
export type SalesMode = (typeof SALES_MODES)[number];

export const SALES_MODE_LABEL: Record<SalesMode, string> = {
  DRY_RUN: 'Simulação (nada sai)',
  REVIEW: 'Revisão (lote sai só depois de aprovado)',
  SEMI_AUTONOMOUS: 'Semiautônomo (segmentos validados saem sozinhos)',
  AUTONOMOUS: 'Autônomo (dentro das políticas)',
  PAUSED: 'Pausado (nenhuma ação externa nova)',
};

// ── Estados da jornada (um por CONTATO elegível — V3.1, 16.5) ─────────────────────────────────
export const JOURNEY_STATES = [
  'IDENTIFIED', 'QUALIFIED', 'CONTACT_REVIEW', 'CONTACTED', 'INTERESTED',
  'NEGOTIATION', 'CUSTOMER', 'REPLENISHMENT', 'CLOSED', 'SUPPRESSED',
] as const;
export type JourneyState = (typeof JOURNEY_STATES)[number];

export const JOURNEY_STATE_LABEL: Record<JourneyState, string> = {
  IDENTIFIED: 'Identificada',
  QUALIFIED: 'Qualificada',
  CONTACT_REVIEW: 'No lote para revisão',
  CONTACTED: 'Contatada',
  INTERESTED: 'Interessada',
  NEGOTIATION: 'Em negociação',
  CUSTOMER: 'Cliente',
  REPLENISHMENT: 'Reposição',
  CLOSED: 'Encerrada',
  SUPPRESSED: 'Suprimida',
};

// ── Estados de uma mensagem lógica (V3.1, 16.3) ───────────────────────────────────────────────
export const MESSAGE_STATUSES = [
  'PENDING', 'RESERVED', 'DISPATCHING', 'ACCEPTED', 'UNKNOWN',
  'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'CANCELLED',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Resultados que o executor pode informar depois de entregar ao servidor de e-mail. */
export const DISPATCH_OUTCOMES = ['ACCEPTED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN'] as const;
export type DispatchOutcome = (typeof DISPATCH_OUTCOMES)[number];

// ── Eventos que chegam da caixa de entrada (Hermes) ──────────────────────────────────────────
export const INBOX_EVENT_TYPES = ['RESPOSTA', 'AUTO_RESPOSTA', 'DEVOLVIDO', 'PEDIU_PARA_SAIR', 'RECLAMACAO'] as const;
export type InboxEventType = (typeof INBOX_EVENT_TYPES)[number];

/** Classificação de uma resposta humana (feita pelo Hermes; o servidor valida o valor). */
export const REPLY_CLASSES = ['interessado', 'pediu_preco', 'pediu_informacao', 'compra_depois', 'sem_interesse', 'ja_tem_fornecedor', 'outro'] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

// ── Escopos de consentimento (opt-in por finalidade — V3.1, 16.5) ─────────────────────────────
export const OPT_IN_SCOPES = ['resumo_conversa', 'campanhas_b2b', 'reposicao'] as const;
export type OptInScope = (typeof OPT_IN_SCOPES)[number];

export const OPT_IN_TEXT: Record<OptInScope, string> = {
  resumo_conversa: 'Quero receber por e-mail o resumo desta conversa e o link do pedido.',
  campanhas_b2b: 'Aceito receber ofertas e novidades da Sal Vita para empresas. Posso cancelar quando quiser.',
  reposicao: 'Quero receber lembretes de reposição dos produtos que comprei. Posso cancelar quando quiser.',
};
/** Suba quando o texto de OPT_IN_TEXT mudar: a prova de opt-in guarda a versão aceita. */
export const OPT_IN_TEXT_VERSION = '2026-11-28a';

// ── Central "Precisa de você" ────────────────────────────────────────────────────────────────
export const EXCEPTION_KINDS = [
  'resposta_humana', 'pedido_grande', 'pergunta_sensivel', 'reclamacao', 'pediu_pessoa',
  'lead_sem_email', 'lead_atacado', 'cliente_parado', 'envio_desconhecido', 'falha_integracao',
  'supressao_inconsistente', 'proposta_hermes', 'alegacao_barrada', 'heartbeat_ausente', 'outro',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export const EXCEPTION_SEVERITIES = ['baixa', 'normal', 'alta', 'critica'] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

// ── As cinco responsabilidades do Hermes ────────────────────────────────────────────────────
export const HERMES_SKILLS = [
  'salvita-prospeccao', 'salvita-inteligencia-comercial', 'salvita-vendas', 'salvita-relacionamento', 'salvita-auditoria',
] as const;
export type HermesSkill = (typeof HERMES_SKILLS)[number];

// ── Configurações (tabela sales_settings, uma linha por chave) ───────────────────────────────
// Cada chave tem schema e padrão. Valor gravado inválido → usa o padrão e registra aviso (nunca quebra).

export const limitesSchema = z.object({
  novasEmpresasDia: z.number().int().min(0).max(500),
  enviosDia: z.number().int().min(0).max(1500),
  intervaloMinHoras: z.number().int().min(24).max(24 * 30),
  maxMensagensPorEmpresa: z.number().int().min(1).max(3),
  cadenciaDias: z.array(z.number().int().min(0).max(60)).min(1).max(3),
  reservaMinutos: z.number().int().min(1).max(60),
  despachoSegundos: z.number().int().min(30).max(600),
  maxTentativas: z.number().int().min(1).max(5),
});
export type SalesLimites = z.infer<typeof limitesSchema>;

export const canalSchema = z.object({
  /** Interruptor do canal de prospecção (caixa comum via SMTP, operada pelo Hermes). */
  ativo: z.boolean(),
  /** O dono registrou que os termos do provedor permitem o uso (V3.1, 16.1). */
  politicaAprovada: z.boolean(),
  provedor: z.string().max(120).nullable(),
  termosUrl: z.string().max(500).nullable(),
  termosConferidosEm: z.string().max(40).nullable(),
  responsavel: z.string().max(120).nullable(),
  conclusao: z.string().max(2000).nullable(),
  /** Domínio do remetente, usado no Message-ID. Sem ele nenhuma mensagem é gerada. */
  dominio: z.string().max(200).nullable(),
  remetenteEmail: z.string().max(200).nullable(),
});
export type SalesCanal = z.infer<typeof canalSchema>;

export const remetenteSchema = z.object({
  nome: z.string().max(120),
  razaoSocial: z.string().max(200),
  cnpj: z.string().max(30),
  endereco: z.string().max(300),
  linkSite: z.string().max(300),
  linkMercadoLivre: z.string().max(500),
});
export type SalesRemetente = z.infer<typeof remetenteSchema>;

export const disponibilidadeSchema = z.object({
  /** 'nao_informado' = o agente não afirma nada sobre estoque (V3.1, 16.6). */
  status: z.enum(['nao_informado', 'disponivel', 'em_falta']),
  atualizadoEm: z.string().max(40).nullable(),
  responsavel: z.string().max(120).nullable(),
  observacao: z.string().max(300).nullable(),
});
export type SalesDisponibilidade = z.infer<typeof disponibilidadeSchema>;

export const agenteSchema = z.object({
  /** Interruptor do vendedor virtual. Desligado = o chat vira formulário de contato. */
  ativo: z.boolean(),
  maxMensagensPorConversa: z.number().int().min(4).max(60),
  maxConversasPorDia: z.number().int().min(0).max(5000),
  /** A partir de quantas caixas o pedido vai sempre para o dono (decisão D5). */
  caixasParaEncaminhar: z.number().int().min(2).max(1000),
  /** Checagem semântica por IA da resposta (camada 4). Desligar só se a cota de IA acabar. */
  verificacaoSemantica: z.boolean(),
});
export type SalesAgente = z.infer<typeof agenteSchema>;

export const referenciaMercadoLivreSchema = z.object({
  precoCentavos: z.number().int().min(0).nullable(),
  url: z.string().max(500).nullable(),
  /** Quando o dono conferiu o preço no anúncio. Mais de 30 dias = não exibir como atual. */
  conferidoEm: z.string().max(40).nullable(),
});
export type SalesReferenciaML = z.infer<typeof referenciaMercadoLivreSchema>;

export const modeloEmailSchema = z.object({
  versao: z.string().max(40),
  status: z.enum(['rascunho', 'aprovado']),
  aprovadoPor: z.string().max(120).nullable(),
  aprovadoEm: z.string().max(40).nullable(),
  /** Um passo por item de limites.cadenciaDias, na mesma ordem. */
  passos: z.array(z.object({ assunto: z.string().max(200), corpo: z.string().max(4000) })).min(1).max(3),
  /** Linha de abertura escrita por IA a partir do site da empresa (passa pelas mesmas travas do agente). */
  aberturaPorIa: z.boolean(),
});
export type SalesModeloEmail = z.infer<typeof modeloEmailSchema>;

export const SALES_SETTINGS_SCHEMAS = {
  modo: z.enum(SALES_MODES),
  limites: limitesSchema,
  canal: canalSchema,
  remetente: remetenteSchema,
  disponibilidade: disponibilidadeSchema,
  agente: agenteSchema,
  simuladorRevenda: z.object({ ativo: z.boolean() }),
  referenciaMercadoLivre: referenciaMercadoLivreSchema,
  ondas: z.object({ ufs: z.array(z.string().length(2)).max(27) }),
  atendente: z.object({ crmUserId: z.number().int().nullable(), substitutoCrmUserId: z.number().int().nullable() }),
  modeloEmail: modeloEmailSchema,
  /** Segmentos já validados no piloto: só eles saem sem aprovação no modo SEMI_AUTONOMOUS. */
  segmentosValidados: z.object({ segmentos: z.array(z.string().max(60)).max(40) }),
} as const;

export type SalesSettingKey = keyof typeof SALES_SETTINGS_SCHEMAS;
export type SalesSettings = { [K in SalesSettingKey]: z.infer<(typeof SALES_SETTINGS_SCHEMAS)[K]> };

/** Rascunho do e-mail de prospecção (V3, seção 4). Nasce como RASCUNHO: nada é gerado até o dono aprovar. */
export const MODELO_EMAIL_RASCUNHO: SalesModeloEmail = {
  versao: '2026-11-28-rascunho',
  status: 'rascunho',
  aprovadoPor: null,
  aprovadoEm: null,
  aberturaPorIa: false,
  passos: [
    {
      assunto: 'Sal marinho integral de Mossoró para a {empresa}',
      corpo: [
        'Olá, equipe da {empresa}.',
        '',
        '{abertura}',
        '',
        'Somos a Sal Vita, de Mossoró/RN. Vendemos o Sal Vita Premium, sal marinho integral, em caixa de 10 kg.',
        '',
        'Para ver o preço atual, o frete para o seu CEP e tirar dúvidas na hora: {link_site}',
        '',
        'Se preferir comprar pelo Mercado Livre: {link_mercado_livre}',
        '',
        '{remetente_nome}. {remetente_razao_social}, CNPJ {remetente_cnpj}, {remetente_endereco}.',
        '',
        'Não quer receber nossas mensagens? Responda "sair" ou use: {link_descadastro}',
      ].join('\n'),
    },
    {
      assunto: 'Dúvidas sobre a caixa de 10 kg do Sal Vita Premium',
      corpo: [
        'Olá, equipe da {empresa}.',
        '',
        'Na mensagem anterior apresentamos a caixa de 10 kg do Sal Vita Premium.',
        'A compra é feita pelo site ou pelo Mercado Livre, com nota e rastreio do envio.',
        'Nosso assistente responde na hora sobre frete e prazo para o seu CEP: {link_site}',
        '',
        '{remetente_nome}. {remetente_razao_social}, CNPJ {remetente_cnpj}, {remetente_endereco}.',
        '',
        'Não quer receber nossas mensagens? Responda "sair" ou use: {link_descadastro}',
      ].join('\n'),
    },
    {
      assunto: 'Última mensagem da Sal Vita',
      corpo: [
        'Olá, equipe da {empresa}.',
        '',
        'Esta é a nossa última mensagem. Se quiser testar, um pedido de uma caixa de 10 kg pode ser feito aqui: {link_site}',
        'Ou pelo Mercado Livre: {link_mercado_livre}',
        '',
        '{remetente_nome}. {remetente_razao_social}, CNPJ {remetente_cnpj}, {remetente_endereco}.',
        '',
        'Não quer receber nossas mensagens? Responda "sair" ou use: {link_descadastro}',
      ].join('\n'),
    },
  ],
};

export const SALES_SETTINGS_DEFAULTS: SalesSettings = {
  modo: 'DRY_RUN',
  limites: {
    novasEmpresasDia: 20,
    enviosDia: 60,
    intervaloMinHoras: 48,
    maxMensagensPorEmpresa: 3,
    cadenciaDias: [0, 4, 10],
    reservaMinutos: 10,
    despachoSegundos: 120,
    maxTentativas: 3,
  },
  canal: {
    ativo: false, politicaAprovada: false, provedor: null, termosUrl: null, termosConferidosEm: null,
    responsavel: null, conclusao: null, dominio: null, remetenteEmail: null,
  },
  remetente: { nome: '', razaoSocial: '', cnpj: '', endereco: '', linkSite: '', linkMercadoLivre: '' },
  disponibilidade: { status: 'nao_informado', atualizadoEm: null, responsavel: null, observacao: null },
  agente: { ativo: false, maxMensagensPorConversa: 30, maxConversasPorDia: 200, caixasParaEncaminhar: 20, verificacaoSemantica: true },
  simuladorRevenda: { ativo: false },
  referenciaMercadoLivre: { precoCentavos: null, url: null, conferidoEm: null },
  ondas: { ufs: ['RN', 'CE', 'PB', 'PE'] },
  atendente: { crmUserId: null, substitutoCrmUserId: null },
  modeloEmail: MODELO_EMAIL_RASCUNHO,
  segmentosValidados: { segmentos: [] },
};

/** Referência do Mercado Livre só é exibida como atual se conferida há no máximo 30 dias. */
export const REFERENCIA_ML_VALIDADE_DIAS = 30;

export function referenciaMlVigente(ref: SalesReferenciaML, agora: Date = new Date()): boolean {
  if (ref.precoCentavos === null || !ref.conferidoEm) return false;
  const t = Date.parse(ref.conferidoEm);
  if (!Number.isFinite(t)) return false;
  const dias = (agora.getTime() - t) / 86_400_000;
  return dias >= 0 && dias <= REFERENCIA_ML_VALIDADE_DIAS;
}

// ── Contrato HTTP com o Hermes (rotas /api/sales/*) ──────────────────────────────────────────
// Escopos e variáveis: cada escopo tem segredo próprio; variável ausente = rota fecha (503).
export const HERMES_SCOPES = {
  leitura: 'SALES_HERMES_SECRET_READ',
  propostas: 'SALES_HERMES_SECRET_PROPOSE',
  operacao: 'SALES_HERMES_SECRET_OPERATE',
  despacho: 'SALES_HERMES_SECRET_DISPATCH',
} as const;
export type HermesScope = keyof typeof HERMES_SCOPES;

export const executorIdSchema = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._:-]+$/);

export const reservarBodySchema = z.object({
  executor: executorIdSchema,
  max: z.number().int().min(1).max(20),
}).strict();

export const autorizarBodySchema = z.object({
  executor: executorIdSchema,
  reservaToken: z.string().min(16).max(128),
  fence: z.number().int().min(1),
}).strict();

export const resultadoBodySchema = z.object({
  executor: executorIdSchema,
  despachoToken: z.string().min(16).max(128),
  resultado: z.enum(DISPATCH_OUTCOMES),
  /** Resposta do servidor SMTP (código e texto curto). Sem conteúdo da mensagem. */
  respostaSmtp: z.string().max(300).optional(),
}).strict();

export const eventoCaixaBodySchema = z.object({
  /** Chave estável do evento (ex.: Message-ID da mensagem recebida). Repetir = ignorado. */
  idempotencyKey: z.string().min(8).max(300),
  tipo: z.enum(INBOX_EVENT_TYPES),
  email: z.string().trim().toLowerCase().email().max(200),
  /** Message-ID da nossa mensagem que foi respondida/devolvida, quando conhecido. */
  emRespostaA: z.string().max(300).optional(),
  classificacao: z.enum(REPLY_CLASSES).optional(),
  /** Trecho curto, já sem telefone, CPF, CNPJ e e-mails de terceiros. */
  trecho: z.string().max(600).optional(),
  recebidoEm: z.string().max(40).optional(),
}).strict();

export const evidenciaSchema = z.object({
  fonte: z.string().min(2).max(300),
  periodo: z.string().min(2).max(120),
  denominador: z.string().min(1).max(200),
  amostra: z.number().int().min(0),
  confianca: z.enum(['baixa', 'media', 'alta']),
});

export const propostaBodySchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  skill: z.enum(HERMES_SKILLS),
  titulo: z.string().min(5).max(200),
  detalhe: z.string().min(10).max(4000),
  evidencia: evidenciaSchema,
  decisaoSugerida: z.string().min(5).max(1000),
  severidade: z.enum(EXCEPTION_SEVERITIES).default('normal'),
}).strict();

export const heartbeatBodySchema = z.object({
  executor: executorIdSchema,
  versao: z.string().max(40),
  ciclo: z.number().int().min(0).optional(),
  contagens: z.record(z.string().max(40), z.number().int()).optional(),
}).strict();

export const cicloBodySchema = z.object({
  executor: executorIdSchema,
  /** Só simula: não grava nada (útil para a auditoria). */
  simular: z.boolean().default(false),
}).strict();

/** Normaliza e-mail para comparação/supressão. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
