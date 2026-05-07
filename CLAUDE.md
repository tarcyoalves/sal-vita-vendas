# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Commands

```bash
# Development (run both together)
npm run dev:full       # Vite client (5173) + Express server (3000) concurrently

# Run separately
npm run dev            # Vite client only — port 5173
npm run server         # Express/tRPC server only — port 3000

# Build & type-check
npm run build          # Vite production build of client/
npm run check          # tsc --noEmit

# Database
npm run db:push        # Push schema changes to Neon DB (requires DATABASE_URL)
npm run db:seed        # Seed initial data
npm run db:update-admin  # Promote a user to admin role

# Tests
npm test -- reminders.test.ts   # Run a specific test file
```

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET` — Required at startup; server throws if missing
- `GROQ_API_KEY` — Primary AI provider (preferred: 14k req/day free tier)
- `GEMINI_API_KEY` — Fallback AI provider
- `ALLOWED_ORIGINS` — Comma-separated CORS origins (defaults to localhost:5173/4173)
- `PORT` — Server port (default: 3000)

## Architecture

### Monorepo Layout

```
client/src/          React SPA (Vite)
server/              Express + tRPC backend
  routers/           One file per domain: auth, tasks, reminders, sellers, clients, ai, knowledge, workSessions, tv
  db/schema.ts       Drizzle ORM table definitions (single source of truth for DB types)
  auth.ts            Password hashing (PBKDF2-SHA512 310k iters) + JWT utils
  trpc.ts            Context, publicProcedure, protectedProcedure, adminProcedure
shared/const.ts      Cookie name + shared constants
tests/               Test files (Jest)
```

### Request Flow

1. Vite dev server (`/api/*`) proxies to Express on port 3000.
2. All API traffic goes through tRPC at `/api/trpc`.
3. `server/trpc.ts` `createContext` reads the `sal-vita-session` JWT cookie on every request, fetching the user's current role from the DB (so role promotions take effect immediately).
4. Procedures use `protectedProcedure` or `adminProcedure` middleware for auth enforcement.
5. On the client, `client/src/lib/trpc.ts` creates the typed React Query client. Any `UNAUTHORIZED` error auto-redirects to the login page (handled in `main.tsx`).

### Authentication

- Sessions: HTTP-only cookie (`sal-vita-session`) containing a JWT signed with `JWT_SECRET`, 30-day expiry.
- Passwords: PBKDF2-HMAC-SHA512 with 310,000 iterations. Legacy hashes (2-part format with 10k iterations) are still verified correctly.
- Roles: `admin` or `user`. Admins see all data; users see only their own. Role is always re-fetched from DB in `createContext`, never trusted from the JWT alone.
- `useAuth` hook (`client/src/_core/hooks/useAuth.ts`) is the single source of truth for auth state on the frontend.

### tRPC Procedure Types

- `publicProcedure` — No auth required (login, register)
- `protectedProcedure` — Authenticated user required
- `adminProcedure` — Admin role required

### Database Schema (Drizzle, PostgreSQL)

Key tables and their purpose:
- `users` — Login credentials, role
- `sellers` — Attendant profiles (linked to `users` via `userId`)
- `tasks` — The primary reminder/client-contact record. Contains `reminderDate`, `reminderEnabled`, `assignedTo`, `lastContactedAt`
- `reminders` — Simpler standalone reminder table (separate from tasks)
- `workSessions` — Attendant login sessions with pause/resume tracking
- `chatMessages` — AI chat history per user
- `knowledgeDocuments` — Knowledge base documents

### AI System

Located in `server/routers/ai.ts`. Supports Groq, OpenAI, Gemini, and Anthropic via OpenAI-compatible `chat/completions` endpoint. Groq (llama-3.3-70b-versatile) is the default — it has the most generous free tier.

Two chat modes based on user role:
- **Admin**: Gets real-time context about all attendants + tool use. Tools: `list_tasks`, `list_sessions`, `reschedule_tasks` (which actually writes to the DB).
- **User (attendant)**: Gets read-only context of their own tasks. No tool use.

`ai.analyzeAttendants` generates a per-attendant suspicion/performance score using metrics like overdue reminders, missing notes, disabled reminders, burst contact detection (fraud signal), and work session data. Always uses `llama-3.3-70b-versatile` server-side regardless of client settings (smaller models hit TPM limits on the large analysis prompt).

### Client Routing

Uses `wouter` for routing. All authenticated pages are wrapped in `<AppShell>`. The `/sal-vita` path is a public marketing landing page that bypasses auth redirects. `FloatingChat` and `NotificationManager` are rendered globally but skip public paths.

### Reminder Notifications

`useReminderNotifications` (`client/src/_core/hooks/useReminderNotifications.ts`) polls for tasks with `reminderDate` within 5 minutes, fires browser Notification API, plays an audio beep, and falls back to toast. Prevents duplicate notifications per session.

## Critical: Date Handling

**Never use `.toISOString()` when storing or displaying reminder dates.** Dates are stored in the user's local timezone. Using `toISOString()` converts to UTC, which shifts the date for users in UTC-3 (Brazil).

```js
// Correct — extract components in local time
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, '0');
const day = String(date.getDate()).padStart(2, '0');

// Wrong — shifts date by timezone offset
date.toISOString().split('T')[0]
```

## Tailwind

This project uses **Tailwind v3.4**. Do not use v4 directives (`@theme`, `@apply border-border`). Use standard Tailwind utility classes or CSS variables defined in `client/src/index.css`.

## Path Alias

`@` resolves to `client/src/` (configured in `vite.config.ts`). Use `@/components/...`, `@/pages/...`, etc.
