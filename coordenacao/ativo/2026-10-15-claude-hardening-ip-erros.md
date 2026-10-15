# Hardening: IP confiável, vazamento de erros, dependências

- **Agente:** claude
- **Início:** 2026-10-15
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy`

## Objetivo

Helper único de IP do cliente (sem spoofing), 500 genéricos em produção, chave do
emergencyReset resistente a rotação de IP, e npm audit fix sem --force.

## Arquivos e áreas que vou tocar

- `server/lib/clientIp.ts`, `server/lib/safeError.ts`, `server/lib/emergencyThrottle.ts` (novos)
- `server/trpc.ts`, `server/index.ts`, `server/routers/auth.ts`, `api/index.ts`
- `package.json`, `package-lock.json`, `tests/client-ip.test.ts`

## Progresso

- [ ] ver registro final
