# Cartão do Buscador mostra a posição na fila do robô de busca na web

- **Agente:** claude
- **Início/Fim:** 2026-10-05
- **Status:** concluído no código; aguardando deploy

O quadro "DA WEB" ficava em "Procurando no Google Maps, site e redes…" sem explicar a espera. O robô processa uma empresa por vez com intervalo mínimo por fonte (Maps 20 s, social 15 s), e cada busca enfileira até 60 empresas: a espera pode passar de 30 min.
`enrichmentStatus` agora devolve, para cada CNPJ pendente, `fila: { aFrente, estimativaMin }` (mesma ordem do robô: priority DESC, requested_at ASC; ritmo = concluídos na última hora). O cartão mostra "Na fila do robô · N empresa(s) na frente · ~X min", "é a próxima" ou "O robô está procurando agora…". Sem ritmo na última hora, diz isso (sinal de robô parado).
Verificado: `npm run check`, 409 testes. Não testado contra o banco real.

## Complemento (diagnóstico do Hermes, 2026-10-05)

Robô saudável: ~170 empresas/h, sem travas, Maps sem bloqueio. Causa real: a tela parava de consultar após 5 min (ENRICH_POLL_CAP_MS) enquanto a fila de 60 empresas leva ~20 min; os cartões congelavam em "Procurando…".
Correção: acompanhamento até 30 min (4 s nos 5 primeiros min, depois 15 s); botão "Atualizar dados da web" quando o acompanhamento termina com cartões ainda na fila; RADAR_ENRICH_PER_SEARCH 60 → 20 (~7 min). Verificado: check + 409 testes. Não visto no navegador.
