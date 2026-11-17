# Vita Zap 0.7.54: follow-up com IA (cobrança automática + "Precisa de você")

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (não vai para main sem aprovação do dono)

## Objetivo

Pedido do dono: uma IA que leia as respostas dos disparos e entenda quem precisa de atenção.
Quem NÃO respondeu é cobrado sozinho depois de X dias (mesmo motor e política das campanhas);
quem respondeu e exige atenção vai para "Precisa de você" com resposta sugerida (sem envio
automático); pedido de sair vira opt-out. A IA roda no servidor do CRM (`server/lib/llm.ts`).

## Arquivos e áreas que vou tocar

- `server/routers/zapIa.ts` (novo) e registro em `server/routers/index.ts`
- `tests/zap-ia*.test.ts` (novo)
- `extensoes/vita-zap/` (shared/followup*, painel Follow-up, content, testes, versão 0.7.54)
- `docs/PLANO-CAMPANHAS-WHATSAPP.md`, `extensoes/vita-zap/README.md`

**Não vou tocar em:** schema do banco (sem tabela nova), `server/lib/llm.ts`, `api/bundle.js` só se o build exigir.

## Progresso

- [ ] servidor zapIa + testes
- [ ] extensão followup + testes
- [ ] versão 0.7.54, zip local (sem publicar)
