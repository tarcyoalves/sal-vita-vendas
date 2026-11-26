# Vita Zap 0.7.64: envio automático não confunde "Programar mensagem" com Enviar

- **Agente:** claude
- **Início/Fim:** 2026-11-26
- **Status:** concluído (branch `claude/magical-fermi-wrdxjy`; main não tocado; `npm run publicar` NÃO rodado)

## Objetivo
Defeito em produção: o envio automático abria o diálogo "Programar mensagem" do WhatsApp Web em vez de enviar.

## Arquivos e áreas
- `extensoes/vita-zap/src/content/envio-humano.ts`, `src/content/execucao.ts`, `src/content/index.ts`
- `extensoes/vita-zap/src/shared/mensagens.ts`, `src/sidepanel/executor.ts`
- `extensoes/vita-zap/tests/envio-programar.test.ts`, `tests/executor-envio-seguro.test.ts`, README, versão 0.7.64

## Resultado
Só igualdade exata de rótulo/ícone, lista negativa (programar/schedule/menu/...), ambiguidade não clica, pressão 30-60 ms,
diálogo de programar fechado pelo X e campanha pausada (evento `vitaZap:abriuProgramar`), diagnóstico do rodapé.

## Não verificado
WhatsApp real (HTML sintético). A causa é provável, não confirmada com o DOM real.
