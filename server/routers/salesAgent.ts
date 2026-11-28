// Vendedor virtual B2B da página /atacado (Sal Vita Sales AI). Público e com limite de uso.
// Nasce DESLIGADO (setting agente.ativo = false): desligado, o widget vira formulário de contato.
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { conversar, estadoPublico, MAX_CHARS_MENSAGEM } from '../lib/sales/agente/servico';

const contatoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  empresa: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
});

export const salesAgentRouter = router({
  /** Público: o widget precisa saber se o agente está ligado, o limite de texto e os textos de consentimento. */
  estado: publicProcedure.query(() => estadoPublico()),

  // Público de propósito: o visitante da /atacado não tem login (é a vitrine B2B). A proteção vem de:
  // limiter por IP em api/index.ts (procedure fora de lote: trpcBatchGuard), tetos atômicos de mensagens por
  // conversa, de mensagens por visitante por dia e de conversas novas por dia (servico.ts, antes da IA),
  // visitante identificado só por HMAC de IP + user agent, e todas as travas de conteúdo do pipeline.
  chat: publicProcedure
    .input(z.object({
      conversationId: z.string().uuid().optional(),
      mensagem: z.string().trim().min(1).max(MAX_CHARS_MENSAGEM),
      // Caixa marcada PELO VISITANTE na interface. É o único caminho do consentimento: o modelo não tem como defini-lo.
      consentimentoResumo: z.boolean().optional(),
      contato: contatoSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ua = ctx.req.headers['user-agent'];
      return conversar(input, { ip: ctx.clientIp, userAgent: typeof ua === 'string' ? ua : '' });
    }),

  /**
   * Formulário de contato (modo sem IA). Não duplica a lógica de /api/b2b/inbound: devolve o contrato e o
   * widget envia direto para lá (lead, deduplicação, supressão e aviso interno já existem na rota).
   */
  enviarFormulario: publicProcedure.query(() => ({
    endpoint: '/api/b2b/inbound',
    metodo: 'POST' as const,
    campos: ['companyName', 'contactName', 'email', 'whatsapp', 'city', 'state', 'segment', 'volumeInterest', 'message', 'website (honeypot, deixar vazio)', 'consent (true)'],
    ancora: '/atacado#contato',
  })),
});
