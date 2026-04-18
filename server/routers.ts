import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { aiRouter } from "./routers-ai";
import { clientsRouter } from "./routers-clients";
import { tasksRouter } from "./routers-tasks";
import { chatHistoryRouter, knowledgeRouter } from "./routers-chat-history";
import { representativesRouter } from "./routers-representatives";
import { representativeStatsRouter } from "./routers-representative-stats";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  ai: aiRouter,
  clients: clientsRouter,
  tasks: tasksRouter,
  chatHistory: chatHistoryRouter,
  knowledge: knowledgeRouter,
  representatives: representativesRouter,
  representativeStats: representativeStatsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  sellers: router({
    list: adminProcedure.query(async () => {
      return db.getSellersWithUserRole();
    }),
    create: adminProcedure.input(z.object({
      name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().default(10),
      userId: z.number(),
    })).mutation(async ({ input }) => {
      return db.createSeller(input);
    }),
  }),

  users: router({
    updateRole: adminProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(["admin", "user"]),
    })).mutation(async ({ input }) => {
      return db.updateUserRole(input.userId, input.role);
    }),
  }),

  reminders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role === "admin") {
        return db.getAllCallRemindersWithSeller();
      }
      const sellers = await db.getSellersByUserId(ctx.user!.id);
      if (sellers.length === 0) return [];
      return db.getCallReminders(sellers[0]!.id);
    }),
    create: protectedProcedure.input(z.object({
      clientName: z.string(),
      clientPhone: z.string().optional(),
      clientEmail: z.string().email().optional(),
      scheduledDate: z.date(),
      notes: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
    })).mutation(async ({ input, ctx }) => {
      const sellers = await db.getSellersByUserId(ctx.user!.id);
      if (sellers.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return db.createCallReminder({ ...input, sellerId: sellers[0]!.id });
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      clientName: z.string().optional(),
      notes: z.string().optional(),
      scheduledDate: z.date().optional(),
      status: z.enum(["pending", "completed", "cancelled", "rescheduled"]).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateCallReminder(id, data);
    }),
  }),

  results: router({
    list: protectedProcedure.input(z.object({
      sellerId: z.number().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      if (ctx.user?.role === "admin" && input?.sellerId) {
        return db.getDb().then(d => d?.select().from(require("../drizzle/schema").callResults).where(
          require("drizzle-orm").eq(require("../drizzle/schema").callResults.sellerId, input.sellerId)
        ));
      }
      const sellers = await db.getSellersByUserId(ctx.user!.id);
      if (sellers.length === 0) return [];
      return db.getDb().then(d => d?.select().from(require("../drizzle/schema").callResults).where(
        require("drizzle-orm").eq(require("../drizzle/schema").callResults.sellerId, sellers[0]!.id)
      ));
    }),
    create: protectedProcedure.input(z.object({
      reminderId: z.number(),
      resultType: z.enum(["realizada", "nao_atendida", "reagendada", "convertida"]),
      notes: z.string().optional(),
      nextScheduledDate: z.date().optional(),
    })).mutation(async ({ input }) => {
      return db.createCallResult({
        ...input,
        completedAt: new Date(),
        isFraud: false,
      });
    }),
  }),

  metrics: router({
    daily: protectedProcedure.query(async ({ ctx }) => {
      const sellers = await db.getSellersByUserId(ctx.user!.id);
      if (sellers.length === 0) return null;
      return db.getDailyMetrics(sellers[0]!.id, new Date());
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getNotifications(ctx.user!.id);
    }),
    markRead: protectedProcedure.input(z.object({
      id: z.number().optional(),
      all: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (input.all) return db.markAllNotificationsRead(ctx.user!.id);
      if (input.id) return db.markNotificationRead(input.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
