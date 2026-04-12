import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { sellers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const representativesRouter = router(
  {
    list: adminProcedure.query(async ({ ctx }) => {
      try {
        if (!ctx.user?.id) throw new Error("User not found");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const result = await db
          .select()
          .from(sellers)
          .where(eq(sellers.userId, ctx.user.id));
        
        return result;
      } catch (error) {
        console.error("Error listing representatives:", error);
        throw error;
      }
    }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          department: z.string().optional(),
          dailyGoal: z.number().default(10),
          status: z.enum(["active", "inactive"]).default("active"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          if (!ctx.user?.id) throw new Error("User not found");
          
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          
          const result = await db.insert(sellers).values({
            userId: ctx.user.id,
            name: input.name,
            email: input.email,
            phone: input.phone,
            department: input.department,
            dailyGoal: input.dailyGoal,
            status: input.status,
          });
          
          return result;
        } catch (error) {
          console.error("Error creating representative:", error);
          throw error;
        }
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          department: z.string().optional(),
          dailyGoal: z.number().optional(),
          status: z.enum(["active", "inactive"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const { id, ...data } = input;
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          
          return await db
            .update(sellers)
            .set(data)
            .where(eq(sellers.id, id));
        } catch (error) {
          console.error("Error updating representative:", error);
          throw error;
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          
          return await db
            .delete(sellers)
            .where(eq(sellers.id, input.id));
        } catch (error) {
          console.error("Error deleting representative:", error);
          throw error;
        }
      }),
  }
);
