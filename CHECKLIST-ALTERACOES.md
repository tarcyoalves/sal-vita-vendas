# Checklist antes de alterar o CRM — o que não pode faltar

**Para qualquer IA (Hermes, Claude, Cursor…) ou pessoa.** Cada item abaixo já
derrubou alguma coisa em produção neste repositório. A letra entre colchetes aponta
o caso real em `HANDOFF-HERMES.md`, seção 7.

Leia inteiro antes de começar. Leva 3 minutos; o erro leva horas.

---

## 1. Antes de escrever código

- [ ] `git pull origin main` e **leia `coordenacao/ativo/`**. Se outro agente
      reivindicou os arquivos que você vai tocar, não toque.
- [ ] **Reivindique e publique** (`coordenacao/README.md`) antes de codar.
- [ ] Feature nova vai em **arquivo novo**. Nunca reescreva um arquivo existente
      para outra finalidade — assim sumiram 59 procedures do e-mail marketing. [A]
- [ ] Antes de apagar um arquivo "órfão": `grep` por quem o importa. [J]

## 2. Banco de dados — o que mais derruba o sistema

O Drizzle faz `SELECT` de **todas** as colunas declaradas em `server/db/schema.ts`.
Se uma delas não existe no banco, **toda** consulta naquela tabela falha. Foi o que
zerou o faturamento em 28/09. [M]

- [ ] **Coluna nova** em `schema.ts` → no **mesmo commit**:
  1. `await sql\`ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <TIPO>\`;`
     em `server/db/migrate.ts` (CRM) ou `server/db/ordersMigrate.ts` (Premium);
  2. subir a constante `SCHEMA_VERSION` desse arquivo (data de hoje + letra, ex.
     `2026-09-28c`) — **sem isso a migração não roda em produção**;
  3. rodar `npm run schema:lock` e commitar `tests/schema-version.lock.json`.
- [ ] **Tabela nova** → `CREATE TABLE IF NOT EXISTS` + os mesmos passos 2 e 3.
- [ ] **Só adicione.** Não renomeie nem apague coluna ou tabela: o código em produção
      e outras instâncias ainda fazem `SELECT` dela. Para "remover", pare de usar e
      deixe a coluna lá.
- [ ] Coluna `NOT NULL` nova precisa de `DEFAULT`, senão o `ALTER` falha em tabela
      com dados.
- [ ] CRM usa `db` (`DATABASE_URL`); Premium usa `ordersDb` (`ORDERS_DATABASE_URL`).
      **Não misture.** As tabelas B2B (`suppression_list`, `audit_logs`) estão no banco
      do Premium.
- [ ] Queries com `FOR UPDATE` / `FOR UPDATE SKIP LOCKED` são SQL raw **de propósito**.
      Não reescreva no query builder.

- [ ] **Também** registre a coluna/tabela em `ensureRecentSchema()` (topo de
      `server/db/migrate.ts`), guardada por `if (!have.has('coluna'))`. A migração longa é
      abandonada aos 20 s em produção e o que está no fim dela pode nunca ser criado. [N]
- [ ] Depois do deploy, olhe os logs da Vercel: nada de `does not exist` nem
      `[startup] ... passou de`. "READY" não prova que o banco foi migrado. [N]

> O teste `tests/schema-migrations.test.ts` reprova o build (e o deploy) quando falta
> a migração de uma coluna ou o bump da versão. **Não desative esse teste** — a
> mensagem de erro diz exatamente o que fazer.

## 3. Campo novo do cliente ao servidor

- [ ] Campo novo num tipo do cliente (`client/src/lib/.../types.ts`) também precisa
      entrar no **schema zod de entrada** da procedure no servidor. O tRPC descarta
      em silêncio qualquer campo que o zod não conhece — a tela "salva" e o dado some.
- [ ] Campo que só o sistema ou o admin pode gravar (número de nota, vínculo com ERP,
      comissão): o servidor ignora esse campo quando quem envia é atendente.
- [ ] Datas chegam como `Date` (superjson), não string. Use os helpers de
      `client/src/lib/faturamento/calc.ts` / `server/lib/tz.ts`. [L]
- [ ] "Hoje" é sempre no fuso de São Paulo (`spDateStr`), nunca o do servidor (UTC).

## 4. Rotas e permissões

- [ ] Procedure nova: escolha o nível certo — `protectedProcedure` (logado),
      `staffProcedure` (admin + gerente), `adminProcedure`. Nada de `publicProcedure`
      para dado interno. [B]
- [ ] Rota Express: **uma** por caminho. Duas rotas no mesmo caminho: a primeira
      responde e a segunda nunca executa (webhook do Resend do CRM morto desde 11/08).
- [ ] Endpoint para robô/script externo: token próprio em variável de ambiente,
      compara com `timingSafeEqual`, **falha fechado** se a variável não existir.
- [ ] Query de tela que só admin/gerente pode chamar: `enabled` só para esses papéis,
      senão o atendente leva erro FORBIDDEN.

## 5. Antes do commit

- [ ] `npm run check` — zero erros. **Sem `as any`**: ele desliga o typecheck e já
      escondeu um crash em produção.
- [ ] `npm test` — tudo passando.
- [ ] `git diff --stat` — só os arquivos que você reivindicou. Nada de `git add .`.
- [ ] Tela nova ou alterada: abra em **375 px** (celular) e confira que nada sai da
      tela nem some. Admin, gerente e atendente veem menus diferentes. [I]
- [ ] Nada de segredo em arquivo: o repositório é **público**.
- [ ] Texto que o cliente lê: sem alegação de saúde, sem "sem aditivos"/"natural",
      sem inventar dado técnico. `ESTADO-DO-PROJETO.md`, seção 4. [F]
- [ ] Nunca disparar WhatsApp ou e-mail frio automático. Só link para o humano enviar.

## 6. Depois do push

- [ ] Confira o deploy na Vercel até ficar **READY**. Commit que não chegou em `main`
      não está pronto. [H]
- [ ] Abra a tela em produção e veja com os próprios olhos. Não diga "corrigido" sem
      ter visto. [K]
- [ ] Mova a reivindicação para `coordenacao/registro/` com o que verificou e o que não.

## 7. Se algo quebrou em produção

1. **Não mexa na tela primeiro.** "Tudo zerado" / "sumiu" quase sempre é erro no
   servidor ou no banco. Abra a aba Rede (Network) do navegador ou os logs da
   Vercel e leia a resposta do `/api/trpc/...` que falhou. [M]
2. Achou o commit culpado e não sabe corrigir em minutos? **`git revert <hash>`** e
   `git push origin main`. Volta ao estado anterior sem perder histórico.
3. **Nunca `git push --force` em `main`.**
4. Registre o que aconteceu na seção 7 do `HANDOFF-HERMES.md`.

---

**Resumo de uma linha:** reivindique → coluna nova só com migração + versão +
`schema:lock` → campo novo também no zod do servidor → `check` + `test` → veja no
celular → confira o deploy → registre.
