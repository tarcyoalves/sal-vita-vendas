# Cartão do Buscador mostra a posição na fila do robô de busca na web

- **Agente:** claude
- **Início/Fim:** 2026-10-05
- **Status:** concluído no código; aguardando deploy

O quadro "DA WEB" ficava em "Procurando no Google Maps, site e redes…" sem explicar a espera. O robô processa uma empresa por vez com intervalo mínimo por fonte (Maps 20 s, social 15 s), e cada busca enfileira até 60 empresas: a espera pode passar de 30 min.
`enrichmentStatus` agora devolve, para cada CNPJ pendente, `fila: { aFrente, estimativaMin }` (mesma ordem do robô: priority DESC, requested_at ASC; ritmo = concluídos na última hora). O cartão mostra "Na fila do robô · N empresa(s) na frente · ~X min", "é a próxima" ou "O robô está procurando agora…". Sem ritmo na última hora, diz isso (sinal de robô parado).
Verificado: `npm run check`, 409 testes. Não testado contra o banco real.
