// IA do follow-up do Vita Zap (extensão do WhatsApp Web). Mesma autenticação que a extensão já usa com o CRM:
// cookie de sessão (ou Bearer) do atendente → `protectedProcedure`, com a origem da extensão liberada no csrfGuard.
// Lógica e prompts em server/lib/zapIa.ts. Sem tabela nova, sem log do conteúdo das mensagens.
import { router, protectedProcedure } from '../trpc';
import { spDateStr } from '../lib/tz';
import {
  ContadorDiario,
  IaIndisponivel,
  LIMITE_DIARIO_CLASSIFICACOES,
  LIMITE_DIARIO_COBRANCAS,
  classificarConversas,
  classificarInputSchema,
  cobrancaInputSchema,
  fallbackRevisar,
  gerarCobranca,
  type Classificacao,
} from '../lib/zapIa';

const classificacoesDoDia = new ContadorDiario(LIMITE_DIARIO_CLASSIFICACOES);
const cobrancasDoDia = new ContadorDiario(LIMITE_DIARIO_COBRANCAS);

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
      itens = await classificarConversas(dentro);
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

  /** Texto curto e gentil de cobrança (sem link, sem mídia, com o primeiro nome). tentativa 1 ou 2. */
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
});

export type ZapIaRouter = typeof zapIaRouter;
