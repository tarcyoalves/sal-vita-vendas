import 'dotenv/config';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './auth';
import { seedRefusal, seedPassword } from './lib/seedGuard';

// Só desenvolvimento local: UPDATE_ADMIN_FROM (e-mail atual) e UPDATE_ADMIN_EMAIL (novo)
// são obrigatórios; senha de UPDATE_ADMIN_PASSWORD ou aleatória (impressa uma vez).
async function updateAdmin() {
  const refusal = seedRefusal(process.env.NODE_ENV);
  if (refusal) { console.error(refusal); process.exit(1); }
  const from = process.env.UPDATE_ADMIN_FROM?.trim().toLowerCase();
  const email = process.env.UPDATE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!from || !email) { console.error('Defina UPDATE_ADMIN_FROM e UPDATE_ADMIN_EMAIL.'); process.exit(1); }
  const { password, generated } = seedPassword(process.env.UPDATE_ADMIN_PASSWORD);
  await db.update(users)
    .set({ email, passwordHash: hashPassword(password), mustChangePassword: true })
    .where(eq(users.email, from));
  console.log(`Admin atualizado: ${email}${generated ? ` / senha gerada (anote, não será exibida de novo): ${password}` : ''}`);
  process.exit(0);
}
updateAdmin().catch(err => { console.error(err); process.exit(1); });
