---
name: taste-skill
description: Superset de direção de arte e design anti-slop para agentes de IA. Elimina interfaces genéricas, paletas corporativas enfadonhas e padrões repetitivos através de parâmetros de variação, intensidade de movimento e densidade visual.
metadata:
  author: Leonxlnx
  version: "2.0.0"
---

# Taste Skill (Anti-Slop Design Engine)

O taste-skill é o motor estético que impede o agente de gerar interfaces padronizadas, vazias de personalidade ou com visual evidente de inteligência artificial genérica ("AI slop").

## Parâmetros Ajustáveis (Dials 1–10)

Ao conceber ou refatorar interfaces, o agente pode calibrar três parâmetros essenciais:

1. **`DESIGN_VARIANCE` (1–10)**:
   - `1–3`: Layout corporativo seguro, simétrico e conservador.
   - `4–7`: Layout moderno, dinâmico, grid assimétrico elegante, sobreposição sutil de elementos e hierarquia expressiva.
   - `8–10`: Experimental, brutalista, quebra de grid, composição artística de vanguarda.
   - *(Padrão recomendado: 6–7)*

2. **`MOTION_INTENSITY` (1–10)**:
   - `1–3`: Estático, apenas transições de cor instantâneas no hover.
   - `4–6`: Micro-interações táteis, feedback responsivo, transições de estado suaves de 150ms–200ms.
   - `7–10`: Animações orquestradas, stagger consciente, View Transitions, efeitos de profundidade e acelerações dinâmicas.
   - *(Padrão recomendado: 5)*

3. **`VISUAL_DENSITY` (1–10)**:
   - `1–3`: Editorial ultra-arejado com generoso espaço negativo (Linear/Apple style).
   - `4–7`: Equilíbrio entre legibilidade e conteúdo para dashboards e SaaS modernos.
   - `8–10`: Alta densidade informacional para terminais, trading desks e tabelas de gestão complexa.
   - *(Padrão recomendado: 6)*

## Mandamentos Anti-Slop (Regras Absolutas)

- 🚫 **Banido**: Roxo genérico em fundo branco puro (`#6366F1` / `#8B5CF6`), sombras difusas gigantes sem direção de luz, 3 cartões idênticos com ícones redondos centralizados em todas as seções de features.
- 🚫 **Banido**: Fontes sem personalidade (Inter, Arial, Roboto genérico em tudo) sem emparelhamento com uma tipografia display expressiva.
- 🚫 **Banido**: Textos vazios de marketing ("The all-in-one solution for your workflow") em favor de propostas de valor concretas e termos de domínio precisos.
- ✨ **Obrigatório**:
  - Paletas de cor com personalidade real (ex.: ardósia mineral, grafite fosco com detalhes dourados/âmbar, contrastes industriais).
  - Micro-texturas sutis (ruído suave, grids de fundo discretos, gradientes de luz pontuais).
  - Elementos de UI táteis e deliberados: botões com estados `:active` reais, badges com tipografia mono nítida, tabelas com números em figuras tabulares (`font-mono` ou `tabular-nums`).
