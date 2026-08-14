import { router } from '../trpc';
import { authRouter } from './auth';
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
import { catalogRouter } from './catalog';
// Não existe namespace `reminders` aqui de propósito. Os lembretes do CRM são
// um campo da tarefa (`tasks.reminderDate`) e são lidos por `tasks.reminders`.
// A tabela `reminders` e o router que a servia eram um segundo modelo, paralelo
// e sem nenhuma tela: `trpc.reminders.*` não era chamado em lugar nenhum. O
// router foi removido; a TABELA continua no schema porque pode ter linhas
// legadas em produção (o monitor de storage a lista e `recoverOldDb` a copia).
export const appRouter = router({
  auth: authRouter,
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
  catalog: catalogRouter,
});

export type AppRouter = typeof appRouter;
