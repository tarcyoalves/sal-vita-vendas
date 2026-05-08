# Sal Vita Lembretes — Guia do Projeto para IA

## O que é este projeto

SaaS interno de gestão de vendas e lembretes da empresa **Sal Vita** (sal marinho de Mossoró/RN).

- **Atendentes** gerenciam clientes, tarefas de follow-up e lembretes de contato
- **Admin** supervisiona tudo com dashboard, análise IA e gestão de equipe

## URLs em produção

| Endereço | O que é |
|----------|----------|
| `https://lembretes.salvitarn.com.br` | Sistema principal (login + gestão) |
| `https://premium.salvitarn.com.br` | Landing page do produto (só marketing) |
| Vercel project | `sal-vita-vendas` — team `tarcyoalves-projects` |
| GitHub repo | `github.com/tarcyoalves/sal-vita-vendas` |

**Deploy:** `git push origin main` → Vercel faz deploy automático. Nunca force-push em main.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Roteamento | **Wouter** (NÃO react-router-dom) |
| API client | **tRPC** + TanStack Query |
| Estilo | Tailwind CSS + shadcn/ui (Radix) |
| Backend | Express.js serverless (Vercel Functions) |
| Banco | PostgreSQL Neon (serverless) + Drizzle ORM |
| Auth | JWT em cookie HttpOnly (30 dias) |
| IA | Google Gemini + Groq |
| PWA | vite-plugin-pwa (iOS e Android) |

## Estrutura de pastas

```
/
├── api/index.ts          ← Entry point do servidor (bundlado → api/bundle.js)
├── client/
│   ├── index.html        ← Meta PWA + fontes Google (Pacifico, Inter, etc.)
│   ├── public/           ← Ícones PWA (icon-192.png, icon-512.png), logo SVG
│   └── src/
│       ├── App.tsx        ← Rotas wouter + lógica de host (premium vs lembretes)
│       ├── _core/hooks/   ← useAuth, useReminderNotifications
│       ├── components/
│       │   ├── AppShell.tsx  ← Layout: sidebar + header mobile + bottom nav
│       │   └── ui/           ← Componentes shadcn/ui (não editar diretamente)
│       └── pages/         ← Uma página por rota
├── server/
│   ├── auth.ts            ← hashPassword, verifyPassword, signToken, verifyToken
│   ├── db/
│   │   ├── schema.ts      ← Tabelas Drizzle (FONTE DA VERDADE do banco)
│   │   ├── index.ts       ← Conexão Neon
│   │   └── migrate.ts     ← ensureTablesExist() — cria tabelas se não existirem
│   ├── routers/           ← auth, tasks, clients, reminders, sellers, ai, knowledge, workSessions, tv
│   └── trpc.ts            ← createContext (lê JWT do cookie → ctx.user)
├── vercel.json            ← Build command + rotas + headers de segurança
└── drizzle.config.ts      ← Config do Drizzle Kit
```

## Variáveis de ambiente

Configuradas no painel Vercel (Settings → Environment Variables):

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string Neon PostgreSQL |
| `JWT_SECRET` | Segredo JWT (string longa aleatória) |
| `ADMIN_RESET_SECRET` | Chave para recuperação de emergência de senha admin |
| `GEMINI_API_KEY` | Google Gemini (IA) |
| `GROQ_API_KEY` | Groq (IA alternativa) |
| `ALLOWED_ORIGINS` | Origens CORS extras, separadas por vírgula |
| `NODE_ENV` | `production` |

Para dev local: crie `.env` na raiz com essas variáveis.

## Banco de dados

Schema em `server/db/schema.ts`:

```
users          → id, name, email, passwordHash, role(admin|user), mustChangePassword
sellers        → id, userId, name, email, phone, department, dailyGoal, workHoursGoal, status
clients        → id, name, email, phone, company, city, state, status
tasks          → id, userId, clientId, title, description, notes, reminderDate, status, priority
reminders      → id, userId, clientName, clientPhone, notes, scheduledDate, status
chatMessages   → id, userId, content, role, createdAt
knowledgeDocuments → id, userId, title, content, category, fileUrl
workSessions   → id, userId, startedAt, endedAt, pausedAt, totalPausedMs, status, dailyGoalHours
```

**Migrações:** automáticas via `ensureTablesExist()` no startup. Para dev local: `npm run db:push`.

## Papéis de usuário

- **`admin`** → acessa tudo: dashboard, atendentes, clientes, análise IA, configurações
- **`user`** → acessa: tarefas, lembretes, progresso próprio, chat IA, base de conhecimento

Após primeiro login, `mustChangePassword = true` obriga o usuário a definir uma senha pessoal.

## Rotas

| Rota | Página | Quem acessa |
|------|--------|-------------|
| `/` | Home (login) | Público |
| `/admin/dashboard` | AdminDashboard | Admin |
| `/tasks` | Tasks | Atendentes |
| `/attendants` | Attendants | Admin |
| `/admin/clients` | ClientsManagement | Admin |
| `/vendor/reminders` | VendorReminders | Admin |
| `/admin/ai-analysis` | AiAnalysis | Admin |
| `/ai-chat` | AiChat | Todos |
| `/ai-settings` | AiSettings | Admin |
| `/knowledge-base` | KnowledgeBase | Todos |
| `/meu-progresso` | AttendantProgress | Atendentes |
| `/history` | CallHistory | Admin |
| `/tv` | TvDashboard | Painel TV (sem auth) |
| `/sal-vita` | SalVitaLanding | Público (landing page) |

## Lógica de dois domínios (IMPORTANTE)

`App.tsx` detecta o `window.location.hostname`:
- Host `premium.salvitarn.com.br` → renderiza **só** `SalVitaLanding` (sem sistema)
- Qualquer outro host → sistema completo de lembretes

`vercel.json` redireciona todo o domínio premium para `/sal-vita`.

## Como fazer alterações

### Adicionar nova rota/página

1. Criar `client/src/pages/NovaPagina.tsx`
2. Importar em `App.tsx` e adicionar `<Route path="/nova-rota"><AppShell><NovaPagina /></AppShell></Route>`

### Adicionar nova funcionalidade no backend

1. Criar ou editar router em `server/routers/novo.ts`
2. Importar e registrar em `server/routers/index.ts`
3. No frontend usar `trpc.novo.procedimento.useQuery()` ou `useMutation()`

### Adicionar nova tabela no banco

1. Adicionar tabela em `server/db/schema.ts`
2. Adicionar `CREATE TABLE IF NOT EXISTS` em `server/db/migrate.ts`
3. Rodar `npm run db:push` localmente para validar

## Regras obrigatórias ao editar código

1. **Roteamento:** usar `import { useLocation } from 'wouter'` — nunca `react-router-dom`
2. **API calls:** sempre via tRPC (`trpc.[router].[procedure]`) — nunca `fetch` direto para rotas próprias
3. **Banco:** sempre Drizzle ORM — nunca SQL raw
4. **Segurança de senha:** PBKDF2-SHA512 com 310.000 iterações em `server/auth.ts` — não alterar
5. **Variáveis do frontend:** só `VITE_` prefix ficam disponíveis no cliente
6. **Entry point do backend em produção:** `api/index.ts` (não `server/index.ts`)
7. **Commits em inglês**, mensagens descritivas, sempre em `main`

## Rodar localmente

```bash
# 1. Clonar e instalar
git clone https://github.com/tarcyoalves/sal-vita-vendas
cd sal-vita-vendas
npm install

# 2. Criar .env na raiz com DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GROQ_API_KEY

# 3. Criar tabelas no banco
npm run db:push

# 4. Rodar frontend + backend juntos
npm run dev:full
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

## Build e deploy

```bash
# Deploy: apenas faça push para main
git add .
git commit -m "feat: descrição da mudança"
git push origin main
# Vercel detecta e deploya automaticamente (~1-2 min)
```

Build command completo (definido em `vercel.json`):
```bash
npm install && \
node node_modules/vite/bin/vite.js build client -c vite.config.ts && \
node_modules/.bin/esbuild api/index.ts --bundle --platform=node --target=node20 \
  --outfile=api/bundle.js --external:pg-native --external:fsevents
```

## PWA (iOS e Android)

- iOS: "Compartilhar → Adicionar à Tela de Início" no Safari
- Android: Chrome exibe banner automático "Adicionar à tela inicial"
- Safe area iOS: `env(safe-area-inset-top)` no header, `env(safe-area-inset-bottom)` no bottom nav
- `viewport-fit=cover` em `index.html` é obrigatório para tela cheia

## Logo

- **Sidebar (fundo escuro):** `<img src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp">` — webp com elementos brancos
- **Header mobile:** mesmo webp dentro de botão com `className="bg-slate-800 rounded-xl"` para fundo escuro
- **Modais e login:** SVG inline com oval azul `#0C3680`, ondas, texto "Sal Vita" em Pacifico
- O WordPress bloqueia hotlinks — o webp funciona no browser mas não via `curl`

## Cores da marca

- Azul principal: `#0C3680`
- Azul Tailwind equivalente: `blue-900` / `blue-800`
- Sidebar: `bg-slate-800` / `bg-slate-900`
