import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { executeChatCommand, ChatCommand } from "./chat-commands";

const CommandType = z.union([
  z.literal("create_task"),
  z.literal("update_task"),
  z.literal("delete_task"),
  z.literal("assign_task"),
  z.literal("list_tasks"),
  z.literal("list_representatives"),
  z.literal("get_stats"),
]);

export const chatCommandsRouter = router({
  execute: protectedProcedure
    .input(
      z.object({
        type: CommandType,
        params: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const command: ChatCommand = {
        type: input.type as ChatCommand["type"],
        params: input.params,
      };
      
      return await executeChatCommand(command);
    }),
});
