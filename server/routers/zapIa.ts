// IA do follow-up do Vita Zap (extensão do WhatsApp Web). Mesma autenticação que a extensão já usa com o CRM:
// cookie de sessão (ou Bearer) do atendente → `protectedProcedure`, com a origem da extensão liberada no csrfGuard.
// Lógica e prompts em server/lib/zapIa.ts. Sem tabela nova, sem log do conteúdo das mensagens.
import { router, protectedProcedure } from '../trpc';
import { spDateStr } from '../lib/tz';
import {
  ContadorDiario,
  IaIndisponivel,
  LIMITE_DIARIO_CLASSIFICACOES,
  LIMITE_DIARIO_CONFERENCIAS,
  LIMITE_DIARIO_PEDIDOS,
  LIMITE_DIARIO_COBRANCAS,
  LIMITE_DIARIO_REATIVACOES,
  avaliarReativacao,
  classificarConversas,
  conferirInputSchema,
  conferirPedido,
  fallbackConferencia,
  interpretarPedido,
  pedidoInputSchema,
  type ConferenciaPedido,
  classificarInputSchema,
  cobrancaInputSchema,
  fallbackReativacao,
  fallbackRevisar,
  gerarCobranca,
  reativacaoInputSchema,
  type AvaliacaoReativacao,
  type Classificacao,
} from '../lib/zapIa';

const classificacoesDoDia = new ContadorDiario(LIMITE_DIARIO_CLASSIFICACOES);
const cobrancasDoDia = new ContadorDiario(LIMITE_DIARIO_COBRANCAS);
const reativacoesDoDia = new ContadorDiario(LIMITE_DIARIO_REATIVACOES);
const pedidosDoDia = new ContadorDiario(LIMITE_DIARIO_PEDIDOS);
const conferenciasDoDia = new ContadorDiario(LIMITE_DIARIO_CONFERENCIAS);

export type ZapIaFalha = { ok: false; codigo: 'ia_indisponivel' | 'limite_diario' | 'texto_invalido'; mensagem: string };

const MSG_IA_FORA = 'A IA está indisponível agora. Tente de novo mais tarde; nada foi enviado.';
const MSG_LIMITE = 'Limite diário de uso da IA atingido para o seu usuário. Volta a liberar amanhã.';

export const zapIaRouter = router({
  /**
   * Lê as respostas dos clientes a um disparo e diz quem precisa de atenção.
   * Entrada: até 20 conversas {ref, primeiroNome, mensagemCampanha, mensagens[{de, texto, quando?}]}.
   * Saída: {ok:true, itens:[{ref, classe, precisaAtencao, resumo, sugestao, lembreteDias?}], restantesHoje}
   *        ou {ok:false, codigo, mensagem} (IA fora do ar, limite diário).
   */
  classificarConversas: protectedProcedure.input(classificarInputSchema).mutation(async ({ ctx, input }) => {
    const hoje = spDateStr();
    const concedidas = classificacoesDoDia.consumir(ctx.user.id, hoje, input.conversas.length);
    if (concedidas === 0) return { ok: false, codigo: 'limite_diario', mensagem: MSG_LIMITE } satisfies ZapIaFalha;

    const dentro = input.conversas.slice(0, concedidas);
    const fora = input.conversas.slice(concedidas);
    let itens: Classificacao[];
    try {
      itens = await classificarConversas(dentro, input.orientacoes);
    } catch (e) {
      if (e instanceof IaIndisponivel) return { ok: false, codigo: 'ia_indisponivel', mensagem: MSG_IA_FORA } satisfies ZapIaFalha;
      // Falha inesperada: nunca devolve conteúdo na mensagem; o lote todo vai para "revisar".
      itens = dentro.map((c) => fallbackRevisar(c.ref, 'erro ao processar com a IA'));
    }
    const semCota = fora.map((c) => fallbackRevisar(c.ref, 'limite diário da IA atingido'));
    return {
      ok: true as const,
      itens: [...itens, ...semCota],
      restantesHoje: classificacoesDoDia.restante(ctx.user.id, hoje),
    };
  }),

  /**
   * Texto curto e gentil de cobrança (sem link, sem mídia, com o primeiro nome). tentativa 1 ou 2.
   * Opcional: `estilo` (até 500) e `exemplos` (até 10 de até 300) = o jeito de escrever do dono; a IA imita sem copiar
   * e a saída passa pela mesma validação de sempre.
   */
  gerarCobranca: protectedProcedure.input(cobrancaInputSchema).mutation(async ({ ctx, input }) => {
    const hoje = spDateStr();
    if (cobrancasDoDia.consumir(ctx.user.id, hoje, 1) === 0) return { ok: false, codigo: 'limite_diario', mensagem: MSG_LIMITE } satisfies ZapIaFalha;
    try {
      const texto = await gerarCobranca(input);
      return { ok: true as const, texto };
    } catch (e) {
      if (e instanceof IaIndisponivel) return { ok: false, codigo: 'ia_indisponivel', mensagem: MSG_IA_FORA } satisfies ZapIaFalha;
      return { ok: false, codigo: 'texto_invalido', mensagem: 'A IA devolveu um texto que não passou nas regras. Use o modelo local.' } satisfies ZapIaFalha;
    }
  }),
  /**
   * Reativação por inatividade (Vita Zap 0.7.56): lê a ÚLTIMA conversa de clientes parados há 25+ dias e decide
   * precisa_agora | precisa_mais_tempo | aguardando_cliente | delicado | pediu_para_sair | sem_contexto, com um resumo
   * curto (que a extensão salva no CRM). Entrada: até 20 {ref, primeiroNome, diasSemConversa, mensagens[]}.
   * Saída: {ok:true, itens:[{ref, decisao, diasSugeridos?, resumo}], restantesHoje} ou {ok:false, codigo, mensagem}.
   * Mesma LGPD de classificarConversas (sem telefone/CPF/e-mail, só o primeiro nome, conteúdo nunca logado).
   */
  avaliarReativacao: protectedProcedure.input(reativacaoInputSchema).mutation(async ({ ctx, input }) => {
    const hoje = spDateStr();
    const concedidas = reativacoesDoDia.consumir(ctx.user.id, hoje, input.conversas.length);
    if (concedidas === 0) return { ok: false, codigo: 'limite_diario', mensagem: MSG_LIMITE } satisfies ZapIaFalha;
    const dentro = input.conversas.slice(0, concedidas);
    const fora = input.conversas.slice(concedidas);
    let itens: AvaliacaoReativacao[];
    try {
      itens = await avaliarReativacao(dentro, hoje, input.orientacoes);
    } catch (e) {
      if (e instanceof IaIndisponivel) return { ok: false, codigo: 'ia_indisponivel', mensagem: MSG_IA_FORA } satisfies ZapIaFalha;
      itens = dentro.map((c) => fallbackReativacao(c.ref, 'erro ao processar com a IA'));
    }
    const semCota = fora.map((c) => fallbackReativacao(c.ref, 'limite diário da IA atingido'));
    return { ok: true as const, itens: [...itens, ...semCota], restantesHoje: reativacoesDoDia.restante(ctx.user.id, hoje) };
  }),

  /**
   * "Pedir à IA" passo 1 (Vita Zap 0.7.57): o pedido do dono em português vira um plano de busca para ele confirmar/editar.
   * Entrada: {texto (3 a 600), orientacoes?}. Saída: {ok:true, plano:{periodoDias 1-60, quemFalouPorUltimo, respondeu, assunto,
   * termosNomeContato?, perguntas?}, restantesHoje} ou {ok:false, codigo, mensagem}. Não lê conversa nenhuma e não envia nada.
   */
  interpretarPedido: protectedProcedure.input(pedidoInputSchema).mutation(async ({ ctx, input }) => {
    const hoje = spDateStr();
    if (pedidosDoDia.consumir(ctx.user.id, hoje, 1) === 0) return { ok: false, codigo: 'limite_diario', mensagem: MSG_LIMITE } satisfies ZapIaFalha;
    try {
      const plano = await interpretarPedido(input.texto, hoje, input.orientacoes);
      return { ok: true as const, plano, restantesHoje: pedidosDoDia.restante(ctx.user.id, hoje) };
    } catch (e) {
      if (e instanceof IaIndisponivel) return { ok: false, codigo: 'ia_indisponivel', mensagem: MSG_IA_FORA } satisfies ZapIaFalha;
      return { ok: false, codigo: 'texto_invalido', mensagem: 'A IA não conseguiu entender o pedido. Escreva de outro jeito, com mais detalhe.' } satisfies ZapIaFalha;
    }
  }),

  /**
   * "Pedir à IA" passo 2: para cada conversa lida (até 20), diz se corresponde ao plano.
   * Entrada: {assunto, quemFalouPorUltimo?, respondeu?, conversas:[{ref, primeiroNome, mensagens[]}], orientacoes?}.
   * Saída: {ok:true, itens:[{ref, corresponde, motivo, confianca, pediuParaSair?, revisar?}], restantesHoje}.
   * Mesma LGPD de classificarConversas. Item sem resposta válida da IA volta como revisar (falha fechada).
   */
  conferirPedido: protectedProcedure.input(conferirInputSchema).mutation(async ({ ctx, input }) => {
    const hoje = spDateStr();
    const concedidas = conferenciasDoDia.consumir(ctx.user.id, hoje, input.conversas.length);
    if (concedidas === 0) return { ok: false, codigo: 'limite_diario', mensagem: MSG_LIMITE } satisfies ZapIaFalha;
    const dentro = input.conversas.slice(0, concedidas);
    const fora = input.conversas.slice(concedidas);
    let itens: ConferenciaPedido[];
    try {
      itens = await conferirPedido({ ...input, conversas: dentro }, input.orientacoes);
    } catch (e) {
      if (e instanceof IaIndisponivel) return { ok: false, codigo: 'ia_indisponivel', mensagem: MSG_IA_FORA } satisfies ZapIaFalha;
      itens = dentro.map((c) => fallbackConferencia(c.ref, 'erro ao processar com a IA'));
    }
    const semCota = fora.map((c) => fallbackConferencia(c.ref, 'limite diário da IA atingido'));
    return { ok: true as const, itens: [...itens, ...semCota], restantesHoje: conferenciasDoDia.restante(ctx.user.id, hoje) };
  }),
});

export type ZapIaRouter = typeof zapIaRouter;
