import 'dotenv/config';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './auth';

async function updateAdmin() {
  await db.update(users)
    .set({ email: 'tarcyo.alves@gmail.com', name: 'Tarcyo Alves', passwordHash: hashPassword('admin123') })
    .where(eq(users.email, 'admin@salvita.com'));
  console.log('✅ Admin atualizado: tarcyo.alves@gmail.com / admin123');
  process.exit(0);
}
updateAdmin().catch(err => { console.error(err); process.exit(1); });
