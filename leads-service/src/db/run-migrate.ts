import { ensureTablesExist } from './migrate';

ensureTablesExist()
  .then(() => {
    console.log('Tabelas verificadas/criadas com sucesso.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erro ao criar tabelas:', err);
    process.exit(1);
  });
