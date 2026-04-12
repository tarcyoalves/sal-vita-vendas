import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { analyzeSellerPerformance, detectFraudPatterns } from "./ai-service";
import { chatWithAI } from "./chatgpt-service";
import { testAIProvider } from "./ai-test-service";
import { chatWithConfiguredAI } from "./ai-provider-service";
import { TRPCError } from "@trpc/server";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const aiRouter = router({
  analyzeSeller: adminProcedure
    .input(
      z.object({
        sellerId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await analyzeSellerPerformance(input.sellerId);
      } catch (error) {
        console.error("Error analyzing seller:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao analisar vendedor",
        });
      }
    }),

  detectFraud: adminProcedure
    .input(
      z.object({
        sellerId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await detectFraudPatterns(input.sellerId);
      } catch (error) {
        console.error("Error detecting fraud:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao detectar fraude",
        });
      }
    }),

  chat: adminProcedure
    .input(
      z.object({
        message: z.string(),
        provider: z.string().default("groq"),
        apiKey: z.string(),
        model: z.string(),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const response = await chatWithConfiguredAI(
          input.message,
          input.provider,
          input.apiKey,
          input.model,
          input.conversationHistory
        );
        return response;
      } catch (error) {
        console.error("Error in chat:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao processar mensagem: ${errorMessage}`,
        });
      }
    }),

  testConnection: adminProcedure
    .input(
      z.object({
        provider: z.string(),
        model: z.string(),
        apiKey: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await testAIProvider(input.provider, input.apiKey, input.model);
        return result;
      } catch (error) {
        console.error("Error testing AI connection:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao testar ${input.provider}: ${String(error)}`,
        });
      }
    }),
});
