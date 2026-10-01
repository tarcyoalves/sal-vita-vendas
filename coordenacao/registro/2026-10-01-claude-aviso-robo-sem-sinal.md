# Aviso "sem sinal do robô" mostrava sempre 10 min

- **Agente:** claude
- **Início/Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy

O texto usava o **limite** (10 min, `SMBI_ROBO_SEM_SINAL_MIN`) como se fosse o tempo sem sinal, então dizia sempre "mais de 10 minutos" mesmo com 3 h. Agora mostra o tempo real ("Sem sinal do robô há 3 h (o aviso aparece depois de 10 min)"). Só texto, em `SmbiRoboPanel.tsx`. Verificado: `npm run check`, 368 testes. Não visto na tela.
