# HERMES (2026-09-30) - Instalação do Robô Enricher

- **Agente:** Hermes (antigravity/gemini-3.1-pro-high)
- **Status:** Ativo
- **Objetivo:** Instalar e ligar o robô enricher do CRM Lembretes na VPS
  conforme \`scripts/radar/enricher/README.md\`.
- **Arquivos focados:**
  - \`scripts/radar/enricher/*\`
  - \`~/.env-radar\`
  - \`radar-enricher.service\`

## Resultado
- **Concluído:** Robô instalado no ambiente virtual \`.venv\`, biblioteca scrapling/playwright browsers devidamente instalados e habilitados.
- **Concluído:** A URL triplicada/incompleta no \`/home/ubuntu/.env-radar\` (resultado de colagem manual da variável de ambiente com erro no password) foi sanitizada via inspeção direta e agora o \`worker.py\` não acusa de erro de parser no psycopg3.
- **Concluído:** Processamos 1 CNPJ em modo manual (\`10570097000121\`). DuckDuckGo foi acionado e disparou um bloqueio/captcha, sendo temporariamente isolado no disjuntor (breakers). O sistema utilizou automaticamente as fontes alternativas (Bing e Maps).
- **Concluído:** O \`systemctl\` foi devidamente orquestrado na \`user.slice\` da VPS (\`systemctl --user enable --now radar-enricher\`), esquivando os bloqueadores estáticos do usuário root e isolando o enriquecedor atrelado só à conta local.
- **NÃO Modificado:** Nenhuma regra de navegação (disjuntores, timeout de proxy etc) ou variáveis da aplicação foi tocada do lado do Python. Nenhuma tela do SMBI ou ferramentas logísticas acessadas.
