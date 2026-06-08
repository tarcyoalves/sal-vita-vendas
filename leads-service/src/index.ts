import 'dotenv/config';
import express from 'express';
import { ensureTablesExist } from './db/migrate';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sal-vita-leads' });
});

const port = Number(process.env.PORT) || 3100;

ensureTablesExist()
  .then(() => {
    app.listen(port, () => {
      console.log(`sal-vita-leads rodando na porta ${port}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco de dados:', err);
    process.exit(1);
  });
