# Handoff — faturamento, layout de e-mail e bootstrap do admin (04/09/2026)

## Situação em uma linha

O código está escrito, testado, com CI verde e **empurrado para a branch**.
Produção continua sem as mudanças porque a Vercel só publica de `main`, e o
merge do PR #15 não foi feito. **A tarefa que resta é decidir como mesclar.**

## Coordenadas

| Item | Valor |
|---|---|
| Repo | `github.com/tarcyoalves/sal-vita-vendas` |
| Branch | `crm/reminders-tests-and-pixel-scope` |
| PR aberto | #15 — `https://github.com/tarcyoalves/sal-vita-vendas/pull/15` |
| Base | `main` (estado `MERGEABLE`) |
| Produção | `https://lembretes.salvitarn.com.br/` |
| Repo local | `C:\Users\Tarcyo Alves\Downloads\sal-vita-vendas-atual` |
| Range dos meus commits | `be68a46~1..2ef42b1` (4 commits) |

### Autenticação (a pegadinha que travou a sessão anterior)

`gh` **não** está autenticado nesta máquina, mas o token existe no Credential
Manager do Windows com escopo `repo`. Recuperar sem imprimir o valor:

```bash
export GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
```

Nunca use `gh auth login --with-token` com esse token: ele é rejeitado por
falta do escopo `read:org`. Exportar `GH_TOKEN` funciona.

## Por que produção não mudou

`.github/workflows/deploy-vercel.yml` dispara em `push: branches: [main]`.
Os 4 commits estão na branch, e `git merge-base --is-ancestor` confirma que
nenhum deles é ancestral de `origin/main`. O check "Vercel — pass" no PR é o
**deploy de preview da branch**, não produção. Sem merge, nada muda no ar.

## O problema que precisa de decisão

O PR #15 acumulou **13 commits de assuntos diferentes**:

- `7ef810b` (13/08) — testes de lembrete + escopo do Meta Pixel (o assunto original do PR)
- 8 commits `docs:` (13/08 a 24/08) — relatórios de auditoria do CRM
- **4 commits de 04/09 — os desta entrega:**
  - `be68a46` `security:` exige `INITIAL_ADMIN_*` em vez da senha fixa `admin123`
  - `f102161` `fix(email):` conteúdo preenche o corpo do e-mail
  - `9f3aa1b` `fix(faturamento):` comissão no mês do embarque, não no da digitação
  - `2ef42b1` `feat(faturamento):` desfazer faturamento

Mesclar o #15 leva tudo junto. As duas saídas:

**A) Merge do #15 como está.** Um clique, resolve hoje, mas publica os 8
commits de docs e os testes de agosto no mesmo movimento — sem revisão
separada do que é código de produção.

**B) PR novo só com os 4 commits de hoje.** Histórico revisável e permite
subir o faturamento sem esperar o resto. Custo: criar a branch e o PR.

```bash
git fetch origin main
git checkout -b fix/faturamento-competencia origin/main
git cherry-pick be68a46 f102161 9f3aa1b 2ef42b1
git push -u origin fix/faturamento-competencia
```

Os 4 commits tocam arquivos **disjuntos** dos 9 herdados (faturamento, e-mail
e migrate; os outros são testes e `.md`), então o cherry-pick não deve
conflitar.

## Antes de mesclar: variável de ambiente obrigatória

`be68a46` remove a senha fixa `admin123` do repositório. O bootstrap do admin
agora só roda com estas variáveis na Vercel (Production):

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_PASSWORD` (mín. 12 chars, classes variadas)

Sem elas o bootstrap **não cria admin** — que é o comportamento desejado. O
admin atual continua logando normalmente, então **nada quebra**. O que se
perde é a recriação automática caso a linha do admin desapareça do banco.
Presença *parcial* das três é erro de config e derruba o start de propósito
(completar com default traria de volta a credencial previsível).

## Depois de mesclar: verificar

`SCHEMA_VERSION` foi para `2026-09-04a`, então o primeiro cold start roda a
migração inteira uma vez e faz o backfill de `previsao_faturamento_em` a
partir de `criado_em`. Isso preserva o mês em que cada pedido já aparecia.

1. Abrir o relatório de faturamento e conferir **agosto e setembro** — nenhum
   pedido deve ter trocado de mês por causa do backfill.
2. Faturar um pedido escolhendo uma data de **outro mês** e confirmar que ele
   aparece no mês escolhido, não no mês da digitação.
3. Desfazer esse faturamento e confirmar que o pedido volta a "estimado" com
   as quantidades estimadas e continua no mês da previsão.
4. Disparar um e-mail de teste e ver se o conteúdo preenche a largura (antes
   era uma coluna de 600px com faixas cinza dos lados).

## Verificação já feita nesta sessão

- `tsc --noEmit` limpo
- 66 testes passando (`vitest run`), incluindo 4 novos do desfazer
- `npm run build` OK
- CI do PR: `typecheck` pass, `Vercel` pass (preview)
- Árvore final conferida byte a byte contra o estado testado, após reorganizar
  os commits em temáticos

## Contexto que não está no código

O `server/db/initialAdmin.ts` e a mudança de bootstrap **não** faziam parte do
pedido original desta sessão (que era o layout do e-mail). Apareceram na árvore
de trabalho sem rastro no git, entrelaçados no mesmo arquivo que a minha
alteração de `migrate.ts`. O Tarcyo autorizou incluí-los, em commit separado,
por remover a senha `admin123` do repositório. Se algo nesse commit surpreender,
essa é a origem — não foi código que eu escrevi de propósito para a tarefa.
