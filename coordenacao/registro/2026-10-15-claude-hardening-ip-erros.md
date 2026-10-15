# Hardening: IP confiável, vazamento de erros, dependências

- **Agente:** claude
- **Início:** 2026-10-15
- **Fim:** 2026-10-15
- **Status:** parcial (somente na branch claude/magical-fermi-wrdxjy; sem push)
- **Branch:** `claude/magical-fermi-wrdxjy`

## Objetivo

Helper único de IP do cliente (sem spoofing), 500 genéricos em produção, chave do
emergencyReset resistente a rotação de IP, e npm audit fix sem --force.

## Arquivos e áreas que vou tocar

- `server/lib/clientIp.ts`, `server/lib/safeError.ts`, `server/lib/emergencyThrottle.ts` (novos)
- `server/trpc.ts`, `server/index.ts`, `server/routers/auth.ts`, `api/index.ts`
- `package.json`, `package-lock.json`, `tests/client-ip.test.ts`

## Progresso

- [x] helper de IP, 500 genéricos, throttle do emergencyReset, npm audit fix
- Pendente: vulnerabilidades que exigem --force (vitest, vite, drizzle-orm, drizzle-kit, sharp, tailwindcss, react-router-dom)
- Armadilha: api/bundle.js não foi regenerado (a Vercel roda build:api).
