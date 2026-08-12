Você vai ajudar no projeto "Vita Construções" — um ERP em produção, com
dinheiro real de uma construtora de verdade. Antes de tocar em qualquer
código ou publicar qualquer alteração, siga isto:

## 1. Repositório e branch

- O único repositório de trabalho real é `github.com/tarcyoalves/VITA-CONSTRUCOES`,
  branch `claude/github-repo-access-ms553a`. É a única branch que a Vercel
  publica — todo push nela vai direto para produção, sem PR obrigatório.
- Existem outros dois repositórios no GitHub do dono
  (`tarcyoalves/vita-construcoes-app` e `tarcyoalves/SAAS-vita-construcoes-app`).
  São cópias/snapshots antigos, não projetos paralelos. Já foram comparados
  árvore-por-árvore com o repositório real mais de uma vez e nunca tinham
  nada que o real já não tivesse. Não publique neles achando que é "o
  mesmo projeto", e não traga conteúdo deles para o repositório real sem
  antes comparar arquivo por arquivo com o que já existe lá.
- Nunca crie uma branch nova sem o dono pedir explicitamente. Nunca publique
  em `main`.

## 2. Regra mais importante: NUNCA `git push --force`, nunca reescreva histórico

Isso já aconteceu de verdade neste projeto: um agente (Google AI Studio/
Gemini) deu um `git push --force` "pra publicar" e apagou 294 commits
inteiros — RBAC, isolamento entre organizações (multi-tenant), todas as
migrations de banco — substituindo por um snapshot bem mais antigo. Isso já
tinha ido para produção via deploy automático antes de qualquer revisão
humana. Foi recuperado (sem perda real, com um commit novo em cima do
histórico, sem reescrever nada), mas não deveria ter acontecido.

Se o seu fluxo de "publicar alteração" só sabe sobrescrever a branch inteira
(em vez de fazer commit normal em cima do que já existe), **pare e avise o
dono em vez de forçar o push.**

## 3. Antes de escrever qualquer linha, leia (nesta ordem)

1. `docs/AGENTES.md` — contrato de convivência entre agentes: ambiente,
   como o banco é operado, regras inegociáveis de código. Leia inteiro.
2. `DIARIO.md` (topo do arquivo) — o que aconteceu por último. Tem uma
   seção fixa "INSTRUÇÕES PERMANENTES PARA O GEMINI" logo no início com a
   lista completa das regras aprendidas por erro real — vale para você
   também, mesmo não sendo o Gemini.
3. `docs/HANDOFF.md` — contexto de negócio, decisões já fechadas (não
   reabra sem motivo), estado atual do código, próximos passos plausíveis.
4. `docs/MODELO-DE-DADOS.md`, seção 8 — decisões de modelo de dados que
   prevalecem sobre o resto do documento.
5. `SKILL_ERP_VITA.md` (raiz) + `docs/skill-erp-vita/` — documentação
   verificada contra o código real (gerada e checada automaticamente no
   CI). Mas confira contra o código antes de repetir um número de lá —
   versões anteriores já tiveram fabricação corrigida depois.

## 4. Regras de código que já causaram bug real neste projeto

- **Dinheiro nunca é float.** Proibido `parseFloat`/`Number(valor)` para
  valor financeiro. Tudo passa por `src/services/finance/money.ts`
  (bigint de centavos na aplicação; no banco a coluna é `numeric(18,2)`,
  não inteiro).
- **`organizationId` sempre de `requireSession()`/`requirePermission()`,
  nunca do client.** Não há Row Level Security no Postgres — o isolamento
  entre empresas é 100% disciplina de query em cada server action.
- **Nunca `"use server"` no topo de um módulo utilitário** — em Next.js
  isso vira endpoint HTTP público. Já causou um incidente real de escrita
  cross-tenant.
- **Não invente segredo padrão nem fallback silencioso.** Nada de
  `AUTH_SECRET`/`DATABASE_URL` caindo para um valor fake quando a variável
  de ambiente não existe — o app deve falhar alto e claro.
- **Não enfraqueça `next.config.mjs`** (CSP, `frame-ancestors`,
  `X-Frame-Options`) para "resolver" um erro de build local.
- **Nunca fabrique dado.** "Sem dado" e "0" são estados diferentes — não
  desenhe gráfico/percentual/badge que não vem de cálculo real sobre dado
  do banco, e não crie botão que só mostra sucesso sem executar a ação de
  verdade.
- **Antes de usar uma classe CSS, confirme que ela existe** em
  `globals.css`/`tailwind.config.ts` — já rolou de usar classe inexistente
  sem efeito nenhum.
- **Não mexa em `src/app/app/layout.tsx` sem ler os comentários inline
  primeiro** — a diferença de comportamento mobile/desktop ali é
  proposital e documentada.
- Migrations são sempre aditivas (nunca `DROP`/rename direto).

## 5. Antes de considerar algo pronto

Rode e confira que passam: `npx tsc --noEmit`, lint, `npx vitest run`, e
`npm run build`. Documente o que mudou e por quê em `DIARIO.md` (formato:
o que mudou, por quê, o que ficou faltando).

Se qualquer coisa acima conflitar com o que o dono pediu na hora, **pare e
pergunte antes de publicar** — não decida sozinho por cima dessas regras.
