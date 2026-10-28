---
name: imagegen-frontend-web
description: Direção artística e geração de referências visuais de alta fidelidade (image-first) para interfaces web modernas antes da codificação.
metadata:
  author: Leonxlnx
  version: "1.0.0"
---

# Imagegen Frontend Web Skill

Metodologia de concepção visual *image-first*. Ao invés de tentar programar telas complexas a partir de prompts de texto ambíguos, esta skill estrutura a geração de mockups conceituais de alta fidelidade para validar a identidade estética antes de qualquer linha de código.

## Pipeline Image-First

1. **Definição da Identidade e Vibe**:
   - Estabeleça o arquétipo visual da interface (ex.: Minimalist Editorial, Industrial Brutalist, Dark Luxury SaaS, Organic Crafted, Retro Terminal).
   - Defina os pontos focais da tela: Hero section, painéis de controle, cartões de produto, esteiras de status ou formulários de checkout.

2. **Engenharia de Prompt para UI Mockups**:
   - Utilize descritores de alta precisão visual:
     - **Estilo**: `UI design mockup`, `clean modern web interface`, `Figma presentation style`, `retina crisp details`.
     - **Composição**: `asymmetrical grid`, `generous negative space`, `subtle tactile grain`, `studio lighting`, `hero section with high-contrast typography`.
     - **Paleta**: `matte obsidian background, golden amber accents, frosted glass containers` ou `monochrome brutalist grid with acid lime badges`.
   - Evite renders genéricos 3D flutuantes ou representações tortas de telas dentro de monitores estilizados, focando na interface em si.

3. **Validação da Direção Visual**:
   - Avalie legibilidade, contraste e atmosfera.
   - Extraia a paleta exata de cores, proporções e hierarquia antes de iniciar o handoff para o código (`image-to-code-skill`).
