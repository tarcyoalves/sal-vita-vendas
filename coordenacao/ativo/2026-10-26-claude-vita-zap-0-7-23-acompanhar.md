# Vita Zap 0.7.23 — Acompanhar (botão na faixa do lead + aba)

- **Agente:** claude
- **Início:** 2026-10-26
- **Fim:** —
- **Status:** em andamento
- **Branch:** `worktree-agent-aec5c8ce72cd5db8e` (sem push)

## Objetivo

Pedido do dono: botão "Acompanhar" na faixa do lead (etiqueta do CRM "Acompanhar", pelo
`alterarEtiquetas` existente), selo "Em acompanhamento", "Marcar convertido" tira a etiqueta, e uma
aba "Acompanhar" (painel lateral + barra de abas do WhatsApp) com os leads em acompanhamento,
ordenados por vencido e dias sem contato. Sem polling; no máximo 1 consulta ao CRM a cada 15 min.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/` (src/content/crm, src/sidepanel, src/shared, tests, README, manifest, package*.json)
- `client/public/vita-zap/` (gerado por `npm run publicar`)
- `server/routers/tasks.ts` e `server/lib/whatsappLead.ts` (procedure de leitura `tasks.acompanhando`
  com `meusLeadsFilter`; `toggleConverted` tira a etiqueta "Acompanhar"), `tests/extensao-vita-zap.test.ts`, `api/bundle.js`

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito) nem em nada do Premium.

## Progresso

- [ ] servidor
- [ ] extensão (serviço, faixa, painel lateral, barra)
- [ ] testes, README, versão, publicar
