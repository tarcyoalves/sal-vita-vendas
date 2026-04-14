import 'dotenv/config';
import { db } from './db';
import { users } from './db/schema';
import { hashPassword } from './auth';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Criando usuários iniciais...');

  // Admin
  const [existing] = await db.select().from(users).where(eq(users.email, 'admin@salvita.com'));
  if (!existing) {
    await db.insert(users).values({
      name: 'Administrador',
      email: 'admin@salvita.com',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
    });
    console.log('✅ Admin criado: admin@salvita.com / admin123');
  } else {
    console.log('ℹ️  Admin já existe');
  }

  // Atendente de teste
  const [existingUser] = await db.select().from(users).where(eq(users.email, 'atendente@salvita.com'));
  if (!existingUser) {
    await db.insert(users).values({
      name: 'Atendente Teste',
      email: 'atendente@salvita.com',
      passwordHash: hashPassword('atendente123'),
      role: 'user',
    });
    console.log('✅ Atendente criado: atendente@salvita.com / atendente123');
  } else {
    console.log('ℹ️  Atendente já existe');
  }

  console.log('✅ Seed concluído!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});
