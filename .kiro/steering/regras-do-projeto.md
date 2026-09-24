# Regras do projeto — leia antes de qualquer alteração

Este repositório tem **dois produtos** (CRM de Lembretes e loja Premium) e
**outras IAs trabalham aqui ao mesmo tempo**. As regras completas estão em:

1. `HANDOFF-HERMES.md` — regras invioláveis, fluxo de trabalho, portões de
   qualidade e os erros reais já cometidos por IA neste repositório.
2. `coordenacao/README.md` — **obrigatório em toda sessão**: como registrar o
   que você está fazendo para não colidir com outras IAs.
3. `ESTADO-DO-PROJETO.md` — estado atual, pendências e conformidade sanitária.

**Antes de alterar qualquer coisa:** leia `coordenacao/ativo/`, crie a sua
reivindicação a partir de `coordenacao/MODELO.md` e **publique** (push). Nunca
toque arquivos listados na reivindicação de outro agente. Ao terminar, mova-a
para `coordenacao/registro/` e atualize o `ESTADO-DO-PROJETO.md`.

Deploy é `git push origin main`. Nunca `git push --force` em `main`. Antes de
todo commit: `npm run check && npm test`. O repositório é **público**: nunca
escreva token, senha ou chave em arquivo.
