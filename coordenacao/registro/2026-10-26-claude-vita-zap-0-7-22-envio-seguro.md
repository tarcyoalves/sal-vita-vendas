# Vita Zap 0.7.22 — endurecer o envio automático

- **Agente:** claude
- **Início:** 2026-10-26
- **Fim:** 2026-10-26
- **Status:** concluído (no branch; sem push)
- **Branch:** `worktree-agent-a634ecd6aca9a2514`

## Objetivo

Reconferir tudo imediatamente antes do clique do envio automático, confirmar o envio por
detector (sem `true` sem confirmação), persistir marcador "em voo" para não duplicar mensagem
ao reabrir o painel, exigir sinal positivo de conversa individual, ajustar textos e notas.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (src/content, src/sidepanel, src/shared, tests, README, manifest, package.json)
- `client/public/vita-zap/` (gerado por `npm run publicar`)
- `client/src/pages/VitaZap.tsx` (só o texto da descrição) e `docs/VITA-ZAP-SPEC-CRM.md` (uma frase)

## Resultado

- Envio automático opcional (desligado por padrão, agora de verdade): reconferência dupla antes do clique,
  botão só por rótulo/ícone exato com a caixa preenchida, sem Enter sintético, confirmação de 20 s,
  eventos `envioBloqueado` / `envioNaoConfirmado` / `observacaoExpirada`, status novo "revisar".
- Marcador "em voo" em `Campanha.emVoo` (sem mudar a versão do IndexedDB); `Executor.reconciliar()`.
- Pausa ao fechar/esconder o painel + batimento de 10 s (content script não clica sem batimento por 45 s).
- Detector só conta mensagem minha + texto igual + id novo. Conversa individual exige sinal positivo.
- Notas: corta linhas inteiras do início.

## Verificado

- Extensão: `npm test` (644), `npx tsc --noEmit -p .`, `npm run build`, `npm run publicar`.
- Raiz: `npm run check` e vitest (1528), excluindo `.claude`, `node_modules`, `extensoes`.

## Não verificado / pendente

- Nada foi testado no WhatsApp Web real (só HTML sintético): rótulo/ícone do botão Enviar, `data-pre-plain-text`,
  elemento de autor em grupo, subtítulo do cabeçalho, o que conta como "aviso" (`role="dialog"`), `visibilitychange`
  do painel lateral. Lista completa no README, seção 6.

## Armadilhas encontradas

- O executor nascia com `envioAutomatico = true` apesar do texto "envio manual": agora nasce desligado.
- `iniciar()` zera o freio de propósito (Retomar), então "3 seguidos" só é alcançável sem pausas; por isso
  bloqueio e não-confirmação pausam a campanha na hora, além de contar no freio.
- Edição manual do texto antes do Enter deixa de ser reconhecida como envio (exige texto igual): vira "revisar" em 30 min.
- Heredoc que grava fora do worktree é recusado pelo ambiente; use scripts em arquivo.
