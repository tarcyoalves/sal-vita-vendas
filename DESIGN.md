# Design

Sistema visual do Sal Vita Lembretes, capturado do código em produção
(`client/src/index.css`, `tailwind.config.js`, `client/index.html`).
Tokens são CSS variables consumidas pelo Tailwind (shadcn/ui style) e
suportam light e dark mode (`darkMode: 'class'`).

## Color

Paleta funcional em azul (Tailwind blue) sobre neutros gray, com o
azul-marinho institucional `#0C3680` reservado à marca (logo, theme-color,
telas de login e materiais de marketing).

### Brand

| Token | Value | Uso |
|-------|-------|-----|
| Brand navy | `#0C3680` | Logo oval, `theme-color` PWA, login, landing |
| Sidebar dark | `slate-800` / `slate-900` | Fundo da sidebar e header mobile |

### Semantic tokens (light / dark)

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `#1d4ed8` (blue-700) | `#1d4ed8` |
| `--primary-foreground` | `#eff6ff` | `#eff6ff` |
| `--background` | `#ffffff` | `#111827` (gray-900) |
| `--foreground` | `#374151` (gray-700) | `#e5e7eb` (gray-200) |
| `--card` | `#ffffff` | `#1f2937` (gray-800) |
| `--secondary` | `#f3f4f6` | `#1f2937` |
| `--muted` | `#f9fafb` | `#374151` |
| `--muted-foreground` | `#6b7280` | `#9ca3af` |
| `--accent` | `#f9fafb` | `#374151` |
| `--destructive` | `#b91c1c` | `#ef4444` |
| `--border` | `#e5e7eb` | `rgba(255,255,255,0.1)` |
| `--input` | `#e5e7eb` | `rgba(255,255,255,0.15)` |
| `--ring` | `#3b82f6` (blue-500) | `#3b82f6` |

### Charts

Escala sequencial monocromática de azul, do claro ao escuro:
`--chart-1` `#93c5fd` → `--chart-2` `#3b82f6` → `--chart-3` `#2563eb` →
`--chart-4` `#1d4ed8` → `--chart-5` `#1e40af`.

### Sidebar

Tokens dedicados (`--sidebar`, `--sidebar-primary`, `--sidebar-accent`,
`--sidebar-border`, `--sidebar-ring`) espelham os semânticos; em produção a
sidebar usa fundo escuro (`bg-slate-800`/`bg-slate-900`) mesmo no light mode.

### Regras de uso

- Cor forte só para estado real: `--destructive` para atraso/erro, âmbar para
  aviso; o restante da UI descansa em azul e cinza.
- Contraste mínimo WCAG AA (4.5:1) — atenção especial a `--muted-foreground`
  sobre `--muted` no dark mode.

## Typography

Fontes carregadas via Google Fonts em `client/index.html`:

| Família | Pesos | Papel |
|---------|-------|-------|
| **Inter** | 400–700 | Corpo e UI (padrão do sistema) |
| **Pacifico** | 400 | Logotipo "Sal Vita" — só marca, nunca UI |
| **Barlow Condensed** | 400–800 | Números grandes e displays (painel TV, métricas) |
| **JetBrains Mono** | 400, 700 | Dados tabulares/código quando necessário |
| **Outfit** / **Cormorant Garamond** | vários | Landing page (`/sal-vita`) — registro brand |

- Idioma: `pt-BR` (`<html lang="pt-BR">`); datas e números em formato local.

## Shape & Spacing

- Radius base: `--radius: 0.65rem` (`rounded-lg`), com `md = radius − 2px` e
  `sm = radius − 4px` — cantos suaves, consistentes em cards, inputs e botões.
- Container central com padding lateral de `1rem`.
- Alvos de toque ≥ 44px no mobile (bottom nav e ações rápidas).

## Components

- Biblioteca **shadcn/ui** (Radix primitives) em `client/src/components/ui/`
  — não editar diretamente; compor por cima.
- Layout do app em `AppShell.tsx`: sidebar escura (desktop), header mobile e
  bottom nav (mobile), ambos com safe areas iOS
  (`env(safe-area-inset-top/bottom)`).

## Layout

- Mobile-first: PWA instalado é o caso principal dos atendentes; bottom nav
  como navegação primária no mobile.
- Desktop (admin): sidebar fixa escura + área de conteúdo clara com cards.
- `viewport-fit=cover` obrigatório (tela cheia iOS).

## Motion

- Transições discretas (Tailwind defaults); nada decorativo em fluxo de
  trabalho.
- Respeitar `prefers-reduced-motion`.
