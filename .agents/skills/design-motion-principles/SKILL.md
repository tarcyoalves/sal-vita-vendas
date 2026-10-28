---
name: design-motion-principles
description: Auditoria e construção de animações intencionais, micro-interações, curvas de aceleração fluidas e eliminação de anti-patterns de movimento.
metadata:
  author: kylezantos
  version: "1.0.0"
---

# Design Motion Principles Skill

Engenharia e direção de animação e interação para produtos digitais de alta fidelidade. Combina o rigor técnico de velocidade e contenção com estética refinada.

## As 3 Lentes de Design de Movimento

1. **Emil Kowalski (Restrição e Velocidade)**:
   - Animações de UI devem ser rápidas e quase invisíveis: durações entre **150ms e 250ms**.
   - Evite animações que atrasem a conclusão de tarefas pelo usuário.
   - Use curvas de aceleração com desaceleração suave no final: `cubic-bezier(0.16, 1, 0.3, 1)` ou `ease-out`.

2. **Jakub Krehel (Polimento de Produção)**:
   - Transições de layout com interpolação contínua (ex.: View Transitions API, Framer Motion / Motion).
   - Movimentos contextuais: elementos entram na direção do gesto de origem e saem na direção de destino.
   - Sincronização entre estados interativos (hover, active, focus, disabled).

3. **Jhey Tompkins (Experimentação Criativa com CSS)**:
   - Uso de recursos CSS modernos: `@keyframes`, CSS custom properties animáveis (`@property`), transições baseadas em rolagem (`animation-timeline: scroll()`).
   - Micro-detalhes táteis: brilhos sutis, bordas dinâmicas, cursores interativos.

## Anti-Patterns de Movimento (O que NÃO fazer)

- ❌ **Stagger Spam**: Atrasar 15 itens em cascata fazendo o usuário esperar 1.5s para ver uma lista.
- ❌ **Over-Scaling**: Botões que pulam para 1.2x no hover gerando layout shift ou distorção visual.
- ❌ **Pulsing Infinito**: Elementos normais pulsando sem parar competindo pela atenção do usuário.
- ❌ **Animação sem Propósito**: Animar elementos puramente estáticos que não fornecem feedback de estado.
- ❌ **Layout Thrashing**: Animar propriedades que forçam recalculo de layout (`width`, `height`, `top`, `left`) em vez de `transform` e `opacity` aceleradas por GPU.

## Acessibilidade e Performance

- Respeite estritamente `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
