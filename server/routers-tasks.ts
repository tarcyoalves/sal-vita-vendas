import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getTasks, getTaskById, createTask, updateTask, deleteTask, getTasksWithClients } from "./db";
import { TRPCError } from "@trpc/server";

export const tasksRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        if (!ctx.user?.id) throw new Error("User not found");
        return await getTasksWithClients(ctx.user.id);
      } catch (error) {
        console.error("Error listing tasks:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao listar tarefas",
        });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await getTaskById(input.id);
      } catch (error) {
        console.error("Error getting task:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar tarefa",
        });
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        notes: z.string().optional(),
        reminderDate: z.date().optional(),
        reminderEnabled: z.boolean().default(true),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        assignedTo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user?.id) throw new Error("User not found");
        
        const result = await createTask({
          userId: ctx.user.id,
          clientId: input.clientId,
          title: input.title,
          description: input.description,
          notes: input.notes,
          reminderDate: input.reminderDate,
          reminderEnabled: input.reminderEnabled,
          priority: input.priority,
          assignedTo: input.assignedTo,
          status: "pending",
        });
        
        return result;
      } catch (error) {
        console.error("Error creating task:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao criar tarefa",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        reminderDate: z.date().optional(),
        reminderEnabled: z.boolean().optional(),
        status: z.enum(["pending", "completed", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        assignedTo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { id, ...data } = input;
        return await updateTask(id, data);
      } catch (error) {
        console.error("Error updating task:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar tarefa",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await deleteTask(input.id);
      } catch (error) {
        console.error("Error deleting task:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao deletar tarefa",
        });
      }
    }),
});
