# Product

## Register

product

## Users

- **Atendentes de vendas** da Sal Vita (sal marinho, Mossoró/RN). Usam o sistema o dia inteiro, muitas vezes pelo celular (PWA instalado), entre ligações e mensagens de WhatsApp para clientes. Precisam de respostas rápidas: qual cliente contatar agora, quais tarefas vencem hoje, como registrar um follow-up em segundos.
- **Admin/gestor** que supervisiona a equipe pelo desktop: dashboard de desempenho, análise IA das conversas, gestão de atendentes e clientes, painel de TV no escritório (`/tv`).
- Contexto secundário: visitantes da landing page pública (`premium.salvitarn.com.br`) — superfície de marketing, register `brand` quando trabalhada isoladamente.

## Product Purpose

Sistema interno de gestão de vendas e lembretes de contato. Garante que nenhum cliente fique sem follow-up: tarefas com data de lembrete, notificações, histórico de chamadas, metas diárias e sessões de trabalho cronometradas. Sucesso = atendente abre o app, sabe imediatamente o que fazer, registra o contato sem fricção e o gestor enxerga o progresso em tempo real.

## Brand Personality

Confiável, direto, trabalhador. É ferramenta de trabalho diário, não vitrine: transmite organização e calma sob pressão. O toque de identidade vem do azul-marinho da marca (#0C3680) e do logotipo em Pacifico — caloroso e regional (Nordeste), sem ser informal na interface.

## Anti-references

- Dashboards genéricos de template admin (cards demais, gráficos decorativos sem pergunta a responder).
- Interfaces de CRM enterprise densas (Salesforce-like): excesso de campos e navegação profunda.
- Estética "AI-generated": gradientes roxos, glassmorphism gratuito, emojis como ícones.
- Qualquer coisa que fique ilegível no sol ou em tela pequena — o atendente usa no celular, em movimento.

## Design Principles

1. **A próxima ação primeiro** — cada tela responde "o que eu faço agora?" antes de mostrar qualquer métrica.
2. **Registrar em segundos** — criar tarefa/lembrete ou marcar contato feito deve caber em um polegar e três toques.
3. **Mobile é o padrão, desktop é o bônus** — atendentes vivem no PWA; o admin no desktop tolera densidade maior.
4. **Estado do dia sempre visível** — meta diária, tarefas vencidas e sessão de trabalho são o pulso do app, nunca escondidos.
5. **Calmo por padrão, urgente por exceção** — cor forte (vermelho/âmbar) só para atraso e prioridade real; o resto descansa em azul e cinza.

## Accessibility & Inclusion

- Alvo WCAG 2.1 AA: contraste mínimo 4.5:1 em texto (atenção ao dark mode gray-900).
- Alvos de toque ≥ 44px no mobile (bottom nav, botões de ação rápida).
- Safe areas iOS obrigatórias (`env(safe-area-inset-*)`) — já em uso no header e bottom nav.
- Respeitar `prefers-reduced-motion` em animações e transições.
- Idioma da interface: português brasileiro; datas e horários no formato local.
