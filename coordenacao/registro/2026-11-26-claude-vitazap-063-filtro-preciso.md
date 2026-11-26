# Vita Zap 0.7.63 — varredura mais precisa (palavra inteira + região UF/DDD)

- **Agente:** claude
- **Início:** 2026-11-26
- **Fim:** 2026-11-26
- **Status:** parcial (só na branch `claude/magical-fermi-wrdxjy`; não está em `main` nem publicado)
- **Branch:** `claude/magical-fermi-wrdxjy` (não toca em `main`)

## Objetivo

Pedido do dono: filtro do nome por PALAVRA INTEIRA (PR não casa com COMPRAS) e filtro de REGIÃO por UF ou DDD
(ex.: "PR, 41, 45, 46") na Prévia de campanha; mesma função pura nos públicos da Reativação e do "Pedir à IA".

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/src/shared/filtros.ts`, `nomes.ts`, novo `regiao.ts`, `exportar.ts` (schema opcional), `reativacao.ts`, `pedido-ia.ts`, `crm-telefone-conhecido.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`, `Reativacao.tsx` (só palavra inteira), `preferencias.ts`
- `extensoes/vita-zap/tests/`, `README.md`, `package.json` (0.7.63), manifest/versão

**Não vou tocar em:** CRM Lembretes (raiz do repositório), `main`, `npm run publicar`.

## Resultado

Prévia: "Palavra inteira" (ligada por padrão nos filtros novos) e campo "Região (UF ou DDD)" com validação, atalho de DDDs
da UF e motivos ("UF PR no nome", "DDD 45", "fora da região (DDD 11)", "sem telefone conhecido para conferir o DDD" em
revisar). Reativação e Pedir à IA ganharam só a palavra inteira. Filtro/config/backup antigo sem os campos mantém o
comportamento antigo.

## Verificado

- `npm run check` (extensões/vita-zap) — 0 erros; `npx vitest run` — só `tests/publicacao.test.ts` falha (versão publicada
  é 0.7.46; esperado, `npm run publicar` não foi rodado); `npm run build` — manifest sem localhost.
- Testes novos: `tests/filtro-preciso.test.ts`, `tests/filtro-preciso-backup.test.ts`, `tests/previa-regiao-painel.test.ts`.
- Harness Chromium: print da Prévia a 400 px.

## Não verificado / pendente

- WhatsApp Web real; o telefone só vem do CRM da extensão (não do CRM Lembretes nem do registro da reativação).
- Reativação/Pedir à IA sem campo de região. Publicação (`npm run publicar`) e merge em `main` ficam com o dono.

## Armadilhas encontradas

- Motivos de exclusão mudaram no painel (`nome não contém a palavra "X"`): testes que liam o texto antigo foram atualizados.
- `normalizarConfigReativacao(undefined)` = padrão novo (palavra inteira ligada); config salva sem o campo = antigo.
