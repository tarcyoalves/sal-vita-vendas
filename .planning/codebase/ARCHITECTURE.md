---
last_mapped: 2026-05-14
project: FRETEPRIME
---

# ARCHITECTURE.md — System Design

## Overview
Full-stack TypeScript monorepo. The FRETEPRIME admin SPA and its serverless API live in `sallog/`. The parent repo (`sal-vita-vendas`) is the original Sal Vita SaaS with a completely separate stack.

## Layers

```
Browser (Admin SPA)
  └── React 19 + tRPC client
        └── HTTP batch requests to /api/trpc
              └── Express + tRPC router (Vercel Function)
                    └── Drizzle ORM → Neon PostgreSQL
```

## Data Flow
1. Admin SPA makes tRPC calls via `httpBatchLink` with credentials: include
2. Server reads JWT from cookie (admin web) or Authorization Bearer header (mobile)
3. `createContext` validates token → attaches `ctx.user`
4. Procedures check `ctx.user.role` (admin | driver)
5. Drizzle executes typed SQL → Neon serverless

## Auth Model
- Admin: email + password → JWT in HttpOnly cookie (30 days)
- Driver (mobile): CPF + password → JWT as Bearer token
- Driver (web, MISSING): needs cookie-based login

## Key Entry Points
- `sallog/api/index.ts` — Express app, bundled to `api/bundle.js`
- `sallog/admin/src/main.tsx` — React SPA entry
- `sallog/admin/src/App.tsx` — routing and auth state
- `sallog/api/routers/index.ts` — tRPC router registry

## Role-based Access
- `adminProcedure` — requires role === 'admin'
- `protectedProcedure` — any authenticated user
- `publicProcedure` — no auth required

## Status Flow for Freights
```
available → in_progress → completed → validated → paid
```
Admin controls all transitions except `completed` (driver marks delivery done).
