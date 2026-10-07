import 'dotenv/config';
import { db } from './db';
import { users } from './db/schema';
import { hashPassword } from './auth';
import { eq } from 'drizzle-orm';
import { seedRefusal, seedPassword } from './lib/seedGuard';

// Só desenvolvimento local. E-mail do admin: SEED_ADMIN_EMAIL (obrigatório);
// senha: SEED_ADMIN_PASSWORD ou aleatória, impressa uma única vez. Sempre mustChangePassword.
async function seed() {
  const refusal = seedRefusal(process.env.NODE_ENV);
  if (refusal) { console.error(refusal); process.exit(1); }
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) { console.error('Defina SEED_ADMIN_EMAIL.'); process.exit(1); }

  console.log('Criando usuário admin inicial...');
  const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));
  if (!existing) {
    const { password, generated } = seedPassword(process.env.SEED_ADMIN_PASSWORD);
    await db.insert(users).values({
      name: 'Admin',
      email: adminEmail,
      passwordHash: hashPassword(password),
      role: 'admin',
      mustChangePassword: true,
    });
    console.log(`Admin criado: ${adminEmail}${generated ? ` / senha gerada (anote, não será exibida de novo): ${password}` : ' (senha de SEED_ADMIN_PASSWORD)'}`);
  } else {
    console.log('Admin já existe');
  }

  console.log('Seed concluído.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
