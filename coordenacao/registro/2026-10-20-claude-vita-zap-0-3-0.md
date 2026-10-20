# Vita Zap 0.3.0 — modo automático opcional (decisão do dono)

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (sem push; commit no branch do worktree)
- **Branch:** `worktree-agent-a581d24f2edff3bf3` (base: f89d688, Vita Zap 0.2.2)

## Objetivo

Por decisão escrita do dono (ciente de que o envio automático viola os Termos do WhatsApp e pode
bloquear o número de forma permanente), criar um modo automático OPT-IN para clientes que já
conversam com ele, em volume baixo. O padrão continua sendo o modo manual (uma tecla).

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (somente) — `src/content/envioAutomatico.ts` é o único arquivo que
  aciona o envio.

## Resultado

Aba Dados: liga só com caixa de aceite + palavra `AUTOMATICO` (data do aceite guardada), desliga
com um clique, selo AUTOMÁTICO no topo. Por contato: política → abre sem esperar clique (se não
estiver digitando) → conferências → cola → contagem de 8 s com Cancelar → token de uso único
(30 s, amarrado a nome+texto+campanha) → reconferência no content script → botão de enviar do
rodapé → confirmação em 20 s. Limites: teto 30/dia, 90–180 s, pausa longa de 10–20 min a cada
10 envios, seg–sex 8–18h e sáb 8–12h. Freio: 2 problemas seguidos ou aviso do WhatsApp desligam
o automático. Teste `envio-so-no-automatico-autorizado.test.ts` (renomeado) trava onde o envio
pode existir.

## Verificado

- `npm test`, `npx tsc --noEmit -p .`, `npm run build` — ok (jsdom, WhatsApp falso formato "real")

## Não verificado / pendente

- Nada do automático foi validado no WhatsApp real: seletor do botão de enviar, efeito do clique,
  detecção em 20 s, avisos reais. O risco de bloqueio do número não foi medido.
