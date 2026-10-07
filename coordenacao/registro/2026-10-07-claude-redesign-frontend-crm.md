# Auditoria e redesign do frontend do CRM

- **Agente:** claude (Opus coordenando + 6 agentes Sonnet por lote de telas)
- **Início:** 2026-10-07 09:30 BRT
- **Fim:** 2026-10-07 12:10 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Pedido do dono: auditoria completa do frontend do CRM Lembretes para tirar a cara de
template/IA e criar uma linguagem visual única (tipografia, cores, espaçamento,
botões, tabelas, modais, estados, mobile, acessibilidade). Só camada visual e de
interação: **nenhuma regra de negócio, procedure, query ou schema muda.**

## Arquivos e áreas tocadas

- `tailwind.config.js`, `client/src/index.css` — tokens e escalas remapeadas
- `client/src/components/ui/*` — primitivos
- `client/src/components/layout/Page.tsx` (novo), `StatusBadge.tsx` (novo)
- `client/src/components/AppShell.tsx`, `ActiveTimer.tsx`, `FloatingChat.tsx`,
  `AttendantDetailModal.tsx`, `QueryError.tsx`, `SalVitaLogo.tsx`
- `client/src/components/{tasks,radar,faturamento,email}/`
- Páginas do CRM: Home (login), AdminDashboard, AiAnalysis, ClientsManagement, Tasks,
  Attendants, RadarCargas, KnowledgeBase, Documentos, AiChat, AiSettings,
  AttendantProgress, EmailMarketing, Faturamento, NotFound
- `docs/DESIGN-SYSTEM.md` (novo), `HANDOFF-HERMES.md` (caso P)

**Não tocado:** `server/`, `shared/`, `api/`, schema, `lib/`, telas do Premium.

## Progresso

- [x] Inventário e auditoria por página
- [x] Tokens e primitivos
- [x] AppShell (sidebar, topo, navegação mobile)
- [x] Páginas
- [x] check + test + build; render em 1280px e 390px
- [x] Segunda auditoria

## Resultado

- Design system documentado em `docs/DESIGN-SYSTEM.md`. As escalas slate/gray/blue/
  green/red/amber do Tailwind foram remapeadas para uma paleta única (neutro frio, azul
  Sal Vita, verde, âmbar, vermelho): os ~2.500 usos espalhados ficaram coerentes sem
  editar arquivo por arquivo. Raio e sombra domados na config.
- Componentes de composição: `Page`, `PageHeader`, `Panel`, `PanelHeader`, `StatStrip`,
  `Stat`, `EmptyState`, `AccessDenied`, `StatusBadge`.
- AppShell: sidebar azul-marinho (pedido do dono), grupos sem caixa alta, conta num
  menu (alterar senha / sair), sem selo falso "Sistema Operacional", topo só no celular,
  barra inferior sem "pílulas", título da aba por tela, faixa da safe-area do iOS legível.
- Todas as telas do CRM: hero/boas-vindas, gradientes, blur, card por KPI, card dentro
  de card, eyebrows, emojis, `font-cond`/`text-3xl` removidos; listas densas com
  divisória; tabelas com números à direita; diálogos com label e rodapé padrão;
  skeleton/vazio/erro; ações de linha discretas (ghost) em vez de botão sólido repetido.
- Removidos dados falsos: gráficos de 30 dias e mapa de calor de e-mail que eram
  `Math.random()`; cartão "Double Opt-In — Em breve / Disponível em julho" (função
  inexistente); "Top 5 campanhas" que não ordenava nada virou "Campanhas enviadas recentes".
- Corrigido: hover do botão primário e anel de foco dos campos estavam mortos (opacidade
  em cor-token não gera CSS no Tailwind 3); cronômetro e botão flutuante cobriam a conta
  na sidebar no desktop (o `style` inline anulava o `md:bottom-4`); `clipPath` do logo
  com id duplicado; títulos de aba mostravam o da loja Premium.

## Verificado

- `npm run check` (tsc) — 0 erros
- `npm test` (vitest) — 46 arquivos, 599 testes passando
- `vite build client` e bundle da API (esbuild) — ok
- Conjunto de chamadas tRPC (`useQuery`/`useMutation`/`utils.*`/`mutate`) idêntico ao
  HEAD anterior em cada um dos 70 arquivos alterados (comparação por arquivo).
- Render com dados simulados (harness local de tRPC, fora do repo) em 1280px e 390px,
  como admin e atendente: 12 rotas sem erro de console nem tela de erro; nenhuma rota
  com transbordo horizontal em 390px.

## Não verificado / pendente

- Não testado contra o banco real nem logado em produção (sem credencial de teste).
  Depois do deploy, conferir no celular: Tarefas, Buscador, Meu Progresso, Faturamento.
- E-mail Marketing (5.900 linhas): limpeza sistemática feita, mas várias abas ainda usam
  `Card` com tiles soltos — próxima rodada pode trocar por `Panel`/`StatStrip`.
- `<select>` nativos mantidos (com classes do sistema) em Tarefas, Faturamento e
  Atendentes para não arriscar valores; migrar para `ui/select` com teste.
- Bundle único > 2 MB: dividir por rota com `import()` (já anotado no `vite.config.ts`).

## Armadilhas encontradas

Ver `HANDOFF-HERMES.md`, seção 7, caso P (dado inventado com `Math.random()` e
opacidade em cor-token que não gera CSS).
