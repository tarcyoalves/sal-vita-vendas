# Vita Zap 0.7.65: anexos na campanha (foto/PDF depois do texto)

- **Agente:** claude
- **Início:** 2026-11-26
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (main não tocado; reivindicação publicada na branch por ordem do dono)

## Objetivo
Pedido do dono: enviar na campanha, além do texto, até 3 arquivos (imagem jpg/png/webp ou PDF). Só o modo "texto primeiro, arquivos depois" (legenda sempre vazia).

## Arquivos e áreas que vou tocar
- `extensoes/vita-zap/src/content/envio-humano.ts` (escopo da prévia de mídia), `execucao.ts`, `dom.ts`, `index.ts`, `selectors.ts`
- `extensoes/vita-zap/src/shared/` (anexos, banco, campanha, exportar, mensagens)
- `extensoes/vita-zap/src/sidepanel/` (executor, Previa, Execucao)
- testes novos e os de lojas/versão do banco, README, versão 0.7.65

**Não vou tocar em:** CRM Lembretes (raiz do repo), loja Premium.

## Progresso
- [ ] implementação
- [ ] testes e portões
