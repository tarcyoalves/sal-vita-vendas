---
name: image-to-code-skill
description: Conversão de protótipos e referências visuais em código de produção de alta fidelidade (HTML5, Tailwind CSS, React, Lucide Icons) com rigor estético.
metadata:
  author: Leonxlnx
  version: "1.0.0"
---

# Image-to-Code Skill

Engenharia de tradução visual: converte protótipos, designs gerados e imagens de referência em código frontend pronto para produção com fidelidade absoluta de proporções, cores, tipografia e estados interativos.

## Metodologia de Conversão em 4 Etapas

1. **Decomposição Estrutural**:
   - Mapeie a hierarquia em árvore da tela (Containers -> Grids/Flexbox -> Componentes -> Folhas).
   - Identifique pontos de quebra responsivos (Mobile, Tablet, Desktop, Wide).
   - Mapeie elementos estáticos vs estados dinâmicos (hover, active, focus, loading, skeleton).

2. **Extração de Tokens de Design**:
   - **Cores**: Converta as cores visíveis em tokens semânticos Tailwind ou variáveis CSS.
   - **Tipografia**: Identifique tamanhos (`text-xs` a `text-5xl`), pesos (`font-medium`, `font-semibold`, `font-bold`), alinhamentos e espaçamento entre letras (`tracking-tight`).
   - **Espaçamento e Ritmo**: Mapeie paddings e gaps em múltiplos consistentes de 4px/8px (`p-4`, `p-6`, `gap-3`, `gap-6`).
   - **Bordas e Sombras**: Capture raios de canto (`rounded-lg`, `rounded-none`), cores de borda (`border-zinc-800`) e sombras exatas.

3. **Construção do Código de Produção**:
   - Escreva componentes React / TypeScript modulares e tipados.
   - Use Tailwind CSS limpo, evitando classes conflitantes.
   - Utilize ícones de `lucide-react` com dimensões e espessuras de traço alinhadas ao design.
   - Garanta semântica HTML (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<button>`).

4. **Auditoria de Fidelidade Visual (Anti-Slop Check)**:
   - Verifique se a implementação não regrediu para templates genéricos de IA.
   - Confirme que o contraste entre texto e fundo cumpre os padrões WCAG AA.
   - Teste a integridade do layout em diferentes larguras de viewport.
