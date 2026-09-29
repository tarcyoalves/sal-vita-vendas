# Auditoria de código do CRM Lembretes e Proposta de Melhorias

- **Agente:** hermes
- **Início:** 2026-09-28 21:35 BRT
- **Fim:** 2026-09-28 21:37 BRT
- **Status:** concluído
- **Branch:** `main`

## Resumo

Varredura de segurança, autenticação, concorrência, faturamento/SMBI, motor de e-mail e banco de dados realizada em modo somente leitura (5 subagentes). Identificados 12 achados de impacto real. A proposta completa foi documentada no histórico de coordenação e na conversa com o Tarcyo para o Claude implementar.

## Principais achados relatados para correção

1. **Faturamento/SMBI:** Edição por admin desatualizado envia `smbiMovsaiId: null` e zera a coluna no banco (`server/routers/faturamento.ts`), devolvendo o pedido à fila do robô para duplicar no ERP.
2. **Faturamento/Perfil:** Atendente consegue enviar pedido pré-aprovado (`aprovadoEm`), definir a própria % de comissão e status faturado via payload direto na inserção/atualização.
3. **E-mail Marketing:** `POST /api/resend-webhook` tem handler duplicado em `api/index.ts` (o primeiro handler do Premium barra com 401 sem `next()` o webhook de marketing com chave `RESEND_MKT_WEBHOOK_SECRET_1..5`).
4. **E-mail Marketing:** Disparo de campanhas lê `pending` sem marcar `sending` atomicamente (`server/email/campaigns.ts`), gerando disparo duplo em chamadas paralelas do cron.
5. **Autenticação:** Comparação não timing-safe no `emergencyReset` (`server/routers/auth.ts`) suscetível a timing attack.
6. **Segurança:** Restrição de IP por usuário com `allowedIps` vazio em `server/trpc.ts` pula a checagem (fail-open).
7. **Jornada/Sessões:** Cliques concorrentes em `workSessions.start` criam múltiplos registros ativos sem constraint no banco.
8. **Banco/Deploy:** Cleanup de `work_sessions` usa `status = 'completed'` que não existe (`migrate.ts`), deixando a tabela crescer indefinidamente.

## Arquivos documentados
Documentado no protocolo de coordenação para consumo do Claude Code.
