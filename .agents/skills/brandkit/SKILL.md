---
name: brandkit
description: Geração de sistemas de identidade visual, logotipos, diretrizes de marca, paletas tipográficas e harmonização cromática antes do desenvolvimento front-end.
metadata:
  author: Leonxlnx
  version: "1.0.0"
---

# Brandkit Skill

Especialista em direção de arte, branding digital e engenharia de identidade visual para interfaces modernas.

## Pilares de Identidade Visual

1. **Sistemas Tipográficos Coesos**:
   - Defina sempre um par tipográfico de alto contraste intencional:
     - **Display/Headings**: Fonte expressiva com forte personalidade (ex.: serif editorial, grotesk industrial, mono geométrica).
     - **Body/UI**: Fonte com máxima legibilidade, kerning balanceado e suporte robusto a numerais tabulares (tabular figures).
   - Estabeleça uma escala modular rígida (ex.: `12px`, `14px`, `16px`, `20px`, `24px`, `32px`, `48px`, `64px`) mapeada em tokens CSS/Tailwind.

2. **Harmonização Cromática e Tokens Semânticos**:
   - Estruture paletas cromáticas com tokens semânticos:
     - `background` / `foreground` (fundos primários e superfícies)
     - `primary` / `primary-foreground` (cor de ação focal e alto impacto)
     - `accent` / `accent-foreground` (destaques, badges, micro-interações)
     - `muted` / `muted-foreground` (informações secundárias e bordas sutis)
     - `destructive` / `destructive-foreground` (alertas e estados críticos)
   - Nunca utilize paletas padrão de IA (como tons de roxo clichê em fundos brancos puros). Escolha uma identidade cromática proposital (ex.: tons minerais, terrosos, carvão com ouro âmbar, esmeralda escuro ou contrastes monocromáticos cirúrgicos).

3. **Elementos Gráficos e Aplicação de Marca**:
   - Favicons, ícones de interface (`lucide-react`) padronizados em espessura de traço (`stroke-width: 1.5px` ou `2px`).
   - Texturas sutis, gradientes de ruído (noise texture), grades geométricas ou bordas nítidas para ancorar a estética do produto.
   - Guias de tom de voz (Tone of Voice) e copy alinhada com os valores da marca.
