import { router } from '../trpc';
import { authRouter } from './auth';
import { remindersRouter } from './reminders';
import { tasksRouter } from './tasks';
import { sellersRouter } from './sellers';
import { clientsRouter } from './clients';
import { aiRouter } from './ai';
import { knowledgeRouter } from './knowledge';
import { workSessionsRouter } from './workSessions';
import { tvRouter } from './tv';
import { shippingRouter } from './shipping';
import { recoveryRouter } from './recovery';
import { emailMarketingRouter } from './emailMarketing';
import { premiumEmailMarketingRouter } from './premiumEmailMarketing';
import { tagsRouter } from './tags';
import { faturamentoRouter } from './faturamento';
import { b2bRouter } from './b2b';
export const appRouter = router({
  auth: authRouter,
  reminders: remindersRouter,
  tasks: tasksRouter,
  sellers: sellersRouter,
  clients: clientsRouter,
  ai: aiRouter,
  knowledge: knowledgeRouter,
  workSessions: workSessionsRouter,
  tv: tvRouter,
  shipping: shippingRouter,
  recovery: recoveryRouter,
  emailMarketing: emailMarketingRouter,
  // Premium (loja) tem o seu próprio — namespaces distintos para os dois
  // produtos não se sobrescreverem como já aconteceu.
  premiumEmailMarketing: premiumEmailMarketingRouter,
  tags: tagsRouter,
  faturamento: faturamentoRouter,
  b2b: b2bRouter,
});

export type AppRouter = typeof appRouter;
