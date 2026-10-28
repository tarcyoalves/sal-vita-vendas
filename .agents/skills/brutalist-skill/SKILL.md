---
name: brutalist-skill
description: Implementação de diretrizes de design brutalista e industrial, alto contraste, tipografia crua, bordas sólidas e estética impactante sem suavizações genéricas.
metadata:
  author: Leonxlnx
  version: "1.0.0"
---

# Brutalist & Industrial UI Skill

Guia de engenharia estética para interfaces brutalistas, funcionais e industriais. Rejeita designs corporativos genéricos, cantos excessivamente arredondados e sombras difusas artificiais em favor de impacto visual, legibilidade crua e rigor geométrico.

## Regras de Design Brutalista

1. **Tipografia Crua e Monumental**:
   - Títulos em caixas altas (uppercase), tracking apertado (`tracking-tighter`) ou expandido com precisão (`tracking-widest`).
   - Uso expressivo de fontes monospace para metadados, números, tags e carimbos de tempo.
   - Proporções extremas de escala tipográfica (títulos massivos contrastando com corpo de texto cirúrgico e compacto).

2. **Bordas Sólidas e Geometria Rígida**:
   - `border-2` ou `border-[1.5px]` nítidas e sólidas (`border-black`, `border-zinc-900` ou `border-zinc-700`).
   - `rounded-none` ou cantos vivos com raio mínimo (`rounded-sm` / `rounded-md`), evitando "pills" e curvas genéricas.
   - Divisores estruturais evidentes com grades ortogonais e linhas de grade aparentes (architectural grid).

3. **Contraste e Paleta de Cores**:
   - Base de alto contraste: preto absoluto (`#000000` / `bg-zinc-950`), branco puro (`#FFFFFF`) e cinzas metálicos/crus.
   - Ponto de destaque único e hiper-saturado (ex.: amarelo segurança `#FACC15`, laranja industrial `#FF5500`, verde radar `#22C55E` ou ciano elétrico).
   - Sombras duras estilo neo-brutalista (`box-shadow: 4px 4px 0px #000` ou `shadow-[4px_4px_0_0_#000]`), sem blur difuso.

4. **Micro-interações Mecânicas**:
   - Efeitos hover táteis: transições bruscas e mecânicas (100ms–150ms `ease-out`), translação em offset `translate-x-[2px] translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px]`.
   - Feedback de clique instantâneo sem atrasos de amortecimento elástico.
