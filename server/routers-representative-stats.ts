import { router, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { tasks } from "../drizzle/schema";

export const representativeStatsRouter = router({
  getStats: adminProcedure
    .input(z.object({ representativeId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const allTasks = await db.select().from(tasks);
      
      const repTasks = allTasks.filter((t: any) => t.assignedTo === input.representativeId);
      
      return {
        total: repTasks.length,
        pending: repTasks.filter((t: any) => t.status === "pending").length,
        completed: repTasks.filter((t: any) => t.status === "completed").length,
        cancelled: repTasks.filter((t: any) => t.status === "cancelled").length,
        highPriority: repTasks.filter((t: any) => t.priority === "high").length,
      };
    }),

  getAllStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allTasks = await db.select().from(tasks);
    
    const statsByRep: Record<string, any> = {};
    
    allTasks.forEach((task: any) => {
      const repId = task.assignedTo || "unassigned";
      
      if (!statsByRep[repId]) {
        statsByRep[repId] = {
          total: 0,
          pending: 0,
          completed: 0,
          cancelled: 0,
          highPriority: 0,
        };
      }
      
      statsByRep[repId].total++;
      
      if (task.status === "pending") statsByRep[repId].pending++;
      if (task.status === "completed") statsByRep[repId].completed++;
      if (task.status === "cancelled") statsByRep[repId].cancelled++;
      if (task.priority === "high") statsByRep[repId].highPriority++;
    });
    
    return statsByRep;
  }),
});
