# Vita Zap 0.7.65: anexos na campanha (foto/PDF depois do texto)

- **Agente:** claude
- **Início:** 2026-11-26
- **Status:** concluído (branch `claude/magical-fermi-wrdxjy`; main não tocado; `npm run publicar` NÃO rodado)
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
- [x] implementação
- [x] testes e portões

## Resultado
Campo Anexos (até 3, jpg/png/webp/PDF, 5 MB/12 MB), loja IndexedDB `anexos` (banco v6, aditiva, fora do backup), modo único "texto primeiro,
arquivos depois" (legenda sempre vazia, por decisão do dono), colagem por ClipboardEvent, prévia de mídia, envio da prévia com as regras
exatas de envio-humano.ts, progresso por contato (retomar não duplica o texto), diagnóstico da prévia. Versão 0.7.65.

## Verificado
`npm run check` 0 erros; `npx vitest run`: só tests/publicacao.test.ts falha (aceito); `npm run build` ok, dist/manifest.json 0.7.65 sem localhost.

## Não verificado / pendente
Nada foi testado no WhatsApp real: se a colagem sintética abre a prévia (evento não isTrusted), a heurística que localiza a prévia, rótulo
do botão Enviar da prévia, confirmação ao fechar a prévia, bolha de mídia como detectada, PDF.

## Armadilhas encontradas
- Testes de lojas/versão do banco (equipe-arquitetura, automaticos-*, resultado-texto) precisaram da loja `anexos` e da v6.
- envio-isolado proíbe `charCode` (usei codePointAt) e `.click()`/`dispatchEvent` fora dos arquivos permitidos; seletores só em selectors.ts/envio-humano.ts.
- jsdom não tem DataTransfer/ClipboardEvent nem Blob.arrayBuffer: ver tests/ajuda/whatsapp-anexo-falso.ts.
