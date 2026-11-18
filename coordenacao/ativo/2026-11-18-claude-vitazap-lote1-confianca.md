# Vita Zap 0.7.59, lote 1: segurança e confiança nos automáticos

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (análise crítica da extensão, lote 1): (1) modo Observação + placar de acerto da IA antes de ligar o envio automático;
(2) reler a conversa imediatamente antes de cada envio automático; (3) prioridade e previsão da fila com o teto diário compartilhado;
(4) aviso (badge) de histórico do WhatsApp Web prestes a sumir; (5) registro "O que a IA fez" com Desfazer;
(6) reserva da IA: log único quando a cadeia inteira de provedores falha. Nada de função nova fora desta lista.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/lib/llm.ts` (log da cadeia inteira), `server/routers/zapCrm.ts` + `server/lib/zapAgendamentos.ts`
  (procedure mínima para desfazer um agendamento criado pela IA, sem tabela nem coluna nova), `tests/`.
- Extensão (só na branch): `extensoes/vita-zap/src/` (shared/, sidepanel/, background/), testes, versão 0.7.59.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md`, `extensoes/vita-zap/README.md`, `ESTADO-DO-PROJETO.md`.

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito), nenhum outro arquivo do CRM.
Esta mesma publicação fecha a reivindicação antiga do ajuste "{nome} opcional" (18/11), com autorização do dono.

## Progresso

- [ ] servidor: llm.ts, desfazer agendamento
- [ ] extensão: observação + placar, reler antes de enviar, fila, aviso do histórico, registro/desfazer
- [ ] docs, testes, zip local (sem `npm run publicar`)
