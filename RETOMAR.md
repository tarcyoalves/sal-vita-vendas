# SAL VITA VENDAS — Prompt de Retomada

## Contexto do Projeto

- **Pasta:** `/home/user/sal-vita-vendas`
- **Branch de trabalho:** `claude/push-to-github-KgDGY`
- **Stack:** React + TypeScript + Tailwind + tRPC + Drizzle ORM + PostgreSQL + Vercel

---

## TAREFA 1 — Finalizar TvDashboard.tsx (PRIORIDADE MÁXIMA)

Reescreva completamente `/home/user/sal-vita-vendas/client/src/pages/TvDashboard.tsx`.

### Design

- Background `#EEF1F8`, cards brancos com borda colorida no topo (`3px solid`)
- Números: fonte `Barlow Condensed` (já carregada no `index.html`)
- Relógio: fonte `JetBrains Mono` (já carregada no `index.html`)
- Mobile: coluna única scrollável (`min-h-screen`)
- Desktop/TV: tela cheia fixa (`md:h-screen md:overflow-hidden`)
- Layout desktop: `grid-cols-12` — esquerda 7 colunas, direita 5 colunas

### Melhorias obrigatórias

1. `useMemo` para todos os dados derivados: `chartData`, `ranked`, `weeklyDelta`, `totalLastWeek`, `totalPrevWeek`, `alertPieData`, `lastUpdated`
2. Hook: `refetchInterval: 30_000` e `retry: 3`
3. `dataUpdatedAt` do hook para o footer: "atualizado às HH:MM:SS"
4. **Relógio** com indicador de expediente (Seg–Sáb 7h–18h) — badge verde pulsando ou cinza
5. **ScoreBadge** com anel SVG circular de progresso (não apenas cor de fundo)
6. **TrendBadge** com pill colorido (↗ sobe verde / ↘ cai vermelho / → estável cinza)
7. **Score composto** por atendente: 40% contatos hoje + 30% semana total + 20% ausência de atraso + 10% online — exibir coluna "score" no ranking
8. **PieChart** (Recharts) no card de Alertas mostrando distribuição por tipo — tooltip apenas, sem labels sobrepostas — cores: idle=amber, overdue=red, no_notes=slate
9. **Footer** fixo (apenas desktop): `"Sal Vita — Painel de Gestão" | "atualizado às HH:MM:SS" | "© YYYY Sal Vita"`
10. KPI strip: `grid grid-cols-2 md:flex`, 5º card com `col-span-2 md:flex-1`

### Imports corretos (sem imports mortos)

```tsx
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
```

### Estrutura de dados do backend (`/server/routers/tv.ts`)

```ts
{
  kpis: {
    onlineNow: number,
    totalSellers: number,
    contactsToday: number,
    totalClients: number,
    totalOverdue: number,
  },
  sellerStats: [{
    id: number,
    name: string,
    weeklyContacts: [{ week: string, contacts: number }], // 4 semanas
    contactsToday: number,
    overdueCount: number,
    noNotesCount: number,
    isOnline: boolean,
    trend: 'up' | 'down' | 'stable',
  }],
  hotClients: [{
    title: string,
    snippet: string,
    assignedTo: string,
    score: number,   // 0–99
    hoursAgo: number,
  }],
  alerts: [{
    type: 'idle' | 'overdue' | 'no_notes',
    seller: string,
    count: number,
    label: string,
  }],
}
```

### Após escrever o arquivo

```bash
git add client/src/pages/TvDashboard.tsx
git commit -m "feat: premium TV dashboard redesign"
git push -u origin claude/push-to-github-KgDGY
```

---

## TAREFA 2 — Bugs críticos (após entregar o TV)

### Backend (`/server/`)

| # | Arquivo | Linha | Problema | Fix |
|---|---------|-------|----------|-----|
| 1 | `routers/tv.ts` | 14 | `publicProcedure` expõe dados de todos os clientes sem auth | Mudar para `protectedProcedure` |
| 2 | `routers/sellers.ts` | 39–68 | `create` e `delete` não são atômicos (user+seller em queries separadas) | Envolver em `db.transaction()` |
| 3 | `routers/tasks.ts` | 47–81 | `update`, `delete`, `deleteMany` sem verificação de propriedade | Adicionar `eq(tasks.userId, ctx.user.id)` ou checar role admin |
| 4 | `auth.ts` | 4–7 | `JWT_SECRET` com fallback aleatório invalida sessões a cada cold start serverless | Lançar erro se env var não definida |
| 5 | `db/migrate.ts` | 41–43 | Erro de migração silenciado com `console.error` | Re-lançar o erro ou `process.exit(1)` |

### Frontend (`/client/src/`)

| # | Arquivo | Linha | Problema | Fix |
|---|---------|-------|----------|-----|
| 6 | `pages/ClientsManagement.tsx` | 16 | `trpc.clients.importCsv` não existe no servidor | Remover chamada e botão, ou criar o endpoint |
| 7 | `pages/AttendantProgress.tsx` | 36–37 | `weekTasks` e `monthTasks` usam `days=1` — mesmo limite de `todayTasks` | Usar `7` e `30` respectivamente |
| 8 | `pages/Tasks.tsx` | 187 | Warning de notas dispara também ao editar | Trocar `if (editingTask \|\| !formData.notes.trim())` por `if (!editingTask && !formData.notes.trim())` |

---

## Contexto adicional

- `vercel.json` já corrigido (removido `--force` do buildCommand)
- `AppShell.tsx` já tem "Painel TV" no submenu IA com `external: true` (abre em nova aba)
- Deploy Vercel funciona — último deploy confirmado READY
- Dois relatórios completos de auditoria gerados: +50 bugs/melhorias documentados nos agentes de varredura
- Bugs listados acima são apenas os **críticos** — há mais no relatório completo dos agentes

---

## Ordem de execução

```
1. Escrever TvDashboard.tsx → commit → push
2. Fix tv.ts publicProcedure → protectedProcedure
3. Fix sellers.ts transações atômicas
4. Fix tasks.ts autorização
5. Fix auth.ts JWT_SECRET
6. Fix migrate.ts erro silenciado
7. Fix ClientsManagement.tsx importCsv
8. Fix AttendantProgress.tsx weekTasks/monthTasks
9. Fix Tasks.tsx warning notas
10. Commit e push de todos os fixes
```

**Comece pela TAREFA 1 imediatamente, sem fazer perguntas.**
