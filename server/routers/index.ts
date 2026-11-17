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
import { catalogRouter } from './catalog';
import { prospectingRadarRouter } from './prospectingRadar';
import { creditoRouter } from './credito';
import { premiumAuthRouter } from './premiumAuth';
import { zapIaRouter } from './zapIa';
import { zapCrmRouter } from './zapCrm';
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
  catalog: catalogRouter,
  prospectingRadar: prospectingRadarRouter,
  credito: creditoRouter,
  // Login da loja Premium: sem banco, independente do `auth` do CRM.
  premiumAuth: premiumAuthRouter,
  // IA do follow-up do Vita Zap (classificar respostas e escrever cobrança). Só lê texto; nunca envia.
  zapIa: zapIaRouter,
  // Dados do CRM para a trava de agendamento do Vita Zap (só leitura).
  zapCrm: zapCrmRouter,
});

export type AppRouter = typeof appRouter;
