---
name: intent-engineering
description: Captura de intenções, escopo, restrições e regras de governança através da metodologia INTENT.md para direcionamento autônomo de agentes de IA.
metadata:
  author: roboco-io
  version: "1.0.0"
---

# Intent Engineering Skill

Metodologia de especificação e governança para desenvolvimento orientado por agentes de IA. Substitui prompts efêmeros por um documento estruturado e persistente de intenção (`INTENT.md`), garantindo alinhamento perfeito entre o objetivo do usuário e as ações do agente.

## Os 4 Pilares do INTENT.md

1. **Why (Por quê)**:
   - A tese central do projeto ou feature.
   - Qual problema está sendo resolvido e qual valor é entregue ao usuário/negócio.
   - A métrica de sucesso ou critério de validação da hipótese.

2. **What (O que construir)**:
   - Especificação funcional dos fluxos de usuário e comportamentos esperados.
   - Descrição de alto nível, agnóstica de detalhes técnicos voláteis.
   - Estados esperados do sistema e contratos essenciais de produto.

3. **Not (O que NÃO fazer / Restrições Invioláveis)**:
   - Anti-escopo explícito (o que está fora de cogitação).
   - Regras de conformidade, limites regulatórios ou restrições legais.
   - Limites de segurança, dependências proibidas ou padrões de arquitetura vetados.

4. **Learnings (Histórico e Aprendizados)**:
   - Registro vivo de descobertas técnicas, armadilhas identificadas e decisões tomadas.
   - Motivos de falhas em abordagens anteriores para prevenir regressões por sessões paralelas de agentes.

## Ciclo de Vida da Intenção

- **🌱 Seed**: Hipótese inicial em definição.
- **🔍 Exploring**: Prototipagem e exploração técnica para validação de viabilidade.
- **✅ Clarified**: Intenção formalizada e pronta para execução autônoma pelo agente.
- **🛑 Dropped**: Ideia descartada com registro do motivo do descarte para economia de tempo futuro.

## Protocolo de Uso no Antigravity

- Toda sessão de desenvolvimento em projeto complexo deve consultar ou manter o arquivo de governança (`.antigravity/INTENT.md` ou `INTENT.md`).
- O agente nunca deve tomar decisões que violem a seção **Not / Restrições** declarada no intent.
