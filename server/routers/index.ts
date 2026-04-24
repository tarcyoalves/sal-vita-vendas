import { router } from '../trpc';
import { authRouter } from './auth';
import { remindersRouter } from './reminders';
import { tasksRouter } from './tasks';
import { sellersRouter } from './sellers';
import { clientsRouter } from './clients';
import { aiRouter } from './ai';
import { knowledgeRouter } from './knowledge';
import { workSessionsRouter } from './workSessions';

export const appRouter = router({
  auth: authRouter,
  reminders: remindersRouter,
  tasks: tasksRouter,
  sellers: sellersRouter,
  clients: clientsRouter,
  ai: aiRouter,
  knowledge: knowledgeRouter,
  workSessions: workSessionsRouter,
});

export type AppRouter = typeof appRouter;
