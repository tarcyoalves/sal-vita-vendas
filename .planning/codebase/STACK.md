---
last_mapped: 2026-05-14
project: FRETEPRIME
---

# STACK.md — Technologies & Dependencies

## Runtime & Language
- **Node.js 20** (Vercel serverless functions)
- **TypeScript** throughout (frontend + backend)

## Frontend
- **React 19** + **Vite 6** — admin SPA in `sallog/admin/`
- **tRPC React Query** (`@trpc/react-query`) — typed API calls
- **TanStack Query v5** — server state management
- **superjson** — serialization transformer
- **Inline styles** — no Tailwind (CSS vars + inline JS objects)
- Google Fonts: Inter (body), configured per-page

## Backend
- **Express.js** via `@trpc/server/adapters/express`
- **tRPC v11** — full-stack type safety
- **Drizzle ORM** — type-safe SQL queries
- **PostgreSQL Neon** — serverless postgres (connection pooling)
- **JWT** (`jsonwebtoken`) — auth tokens in HttpOnly cookies + Bearer header
- **PBKDF2-SHA512** — password hashing (310,000 iterations) in `sallog/api/auth.ts`

## AI
- **Groq API** (direct fetch) — `llama-3.3-70b-versatile` + `llama-3.1-8b-instant`
- Procedures: chat, suggestValue, matchDrivers, dailySummary

## External Services
- **Cloudinary** — file/image storage (for freight documents)
- **Vercel** — hosting + serverless functions

## Key Dependencies
```json
{
  "@trpc/server": "^11",
  "@trpc/react-query": "^11",
  "drizzle-orm": "^0.43",
  "drizzle-kit": "^0.31",
  "@neondatabase/serverless": "^0.10",
  "zod": "^3",
  "jsonwebtoken": "^9",
  "superjson": "^2",
  "react": "^19",
  "vite": "^6"
}
```

## Build
- Frontend: `vite build admin -c admin/vite.config.ts` → `admin/dist/`
- Backend: `esbuild api/index.ts --bundle --outfile=api/bundle.js`
- Deploy: `git push origin main` → Vercel auto-deploys
