# Design system do CRM Sal Vita

Vale para todas as telas do CRM (`lembretes.salvitarn.com.br`). As telas do Premium
(`SalVita*`, `Atacado`, `TrackOrder`) têm identidade própria e ficam fora disto.

**Cena de uso.** Atendentes passam o expediente no CRM, num escritório claro, em
notebook e celular, fazendo follow-up, ligação e pedido. O admin confere faturamento
e equipe, muitas vezes pelo celular. Daí as decisões: tema claro, denso, calmo, uma
única cor de ação, nada que dispute atenção com o dado.

Fontes da verdade: `tailwind.config.js` (escalas), `client/src/index.css` (tokens),
`client/src/components/ui/*` (primitivos), `client/src/components/layout/Page.tsx`
(composição) e `client/src/components/StatusBadge.tsx` (status).

---

## 1. Cor

As escalas do Tailwind foram **remapeadas** em `tailwind.config.js`:

| Escrito no código | Vira | Uso |
|---|---|---|
| `slate`, `gray`, `zinc`, `neutral`, `stone` | um único neutro frio | texto, borda, fundo |
| `blue`, `indigo`, `sky`, `brand-*` | azul Sal Vita (`#0C3680` = 700) | ação primária, seleção, link, info |
| `green`, `emerald` | um verde | sucesso, concluído, recebido |
| `amber`, `yellow` | um âmbar | atenção, pendente, vence hoje |
| `red`, `rose` | um vermelho | erro, atrasado, excluir |
| `violet`, `purple` | um violeta | só quando precisa de uma 5ª categoria (ex.: IA) |
| `orange`, `cyan`, `teal` | Tailwind padrão | **evite** — use as de cima |

Regras:

- **Cor tem função.** Azul = ação/seleção. Verde/âmbar/vermelho = estado. Nada de
  cor para "enfeitar" ícone, card ou cabeçalho.
- Texto: `text-slate-900` (títulos, dado principal), `text-slate-700` (corpo),
  `text-slate-500` (secundário). **`text-slate-400` não é para texto** (contraste
  insuficiente) — só ícone decorativo, placeholder e borda.
- Superfícies: página `bg-background` (neutro frio); painel `bg-white` com
  `border-slate-200`; faixa/cabeçalho de tabela `bg-slate-50`; sidebar
  `bg-surface-sunken`.
- Fundo de estado: `bg-{green|amber|red|brand}-50` com texto `-700/-800` do mesmo matiz.
- **Proibido:** gradiente (`bg-gradient-*`), texto em gradiente, glassmorphism
  (`backdrop-blur`, `bg-white/80`), creme/areia como fundo.
- **Não use opacidade em cor de token** (`bg-primary/10`, `ring-ring/50`,
  `bg-muted/50`): com Tailwind 3 isso não gera CSS nenhum. Use a escala:
  `bg-brand-50`, `ring-brand-500/20`, `bg-slate-50`.

## 2. Tipografia

Uma família: **Inter** (já carregada). Escala de produto, sem fonte de display.

| Papel | Classe |
|---|---|
| Título da página (h1) | `text-xl font-semibold tracking-tight text-slate-900` — via `<PageHeader>` |
| Título de painel/seção (h2) | `text-sm font-semibold text-slate-900` — via `<PanelHeader>` |
| Corpo, células, inputs | `text-sm` (14px) |
| Rótulo, metadado, legenda | `text-xs text-slate-500` |
| Número de indicador | `text-xl font-semibold tabular-nums` — via `<Stat>` |
| Número em tabela | `tabular-nums` (já automático dentro de `<table>`) |

- **Nada de `text-2xl` ou maior** no CRM. Nada de `font-black`/`font-extrabold`.
- **Nada de eyebrow**: texto minúsculo `uppercase tracking-widest` em cima de seção.
  Cabeçalho de tabela é `text-xs font-medium text-slate-500`, sem caixa alta.
- `font-cond` (Barlow Condensed) e `font-mono` não são usados em dado do CRM.
- Sem emoji em interface (título, botão, rótulo, toast). Ícone lucide quando ajuda.

## 3. Espaço, raio, sombra

- Espaçamento em degraus de 4px. Respiro da página: `<Page>` (`px-4 py-4 md:px-6 md:py-6`,
  `space-y-5`). Dentro de painel: `px-4 py-3`. Entre campos de formulário: `space-y-4`.
- Raio: controles `rounded-md` (6px), painéis/diálogos `rounded-lg` (8px), badge
  `rounded-sm` (4px). `rounded-full` só para avatar redondo, ponto de status e switch.
  (As classes `rounded-xl/2xl/3xl` foram domadas na config, mas não escreva novas.)
- Sombra: **painel não tem sombra**, tem borda. Sombra só no que flutua:
  menus/popovers `shadow-lg`, diálogos `shadow-xl`.
- Hover de painel não "levita" (`hover:-translate-y`, `hover:shadow-*` são proibidos).

## 4. Componentes

### Composição (`components/layout/Page.tsx`)

```tsx
<Page>
  <PageHeader title="Tarefas" description="Follow-ups da equipe" actions={<Button>Nova tarefa</Button>} />
  <StatStrip>
    <Stat label="Atrasadas" value={12} tone="danger" />
    <Stat label="Para hoje" value={8} />
  </StatStrip>
  <Panel>
    <PanelHeader title="Pedidos aguardando" actions={…} />
    …tabela ou lista…
  </Panel>
</Page>
```

- No desktop o título vem do `<PageHeader>` (não há barra de topo). No celular o
  AppShell mostra o título na barra; o `<PageHeader>` continua (descrição/ações).
- **Indicadores numa `<StatStrip>`**, não um card por número. Máximo ~6 por tela;
  cada um precisa ajudar a decidir algo. Clicável quando filtra a lista.
- **Painel ≠ card.** Agrupe com painel quando há um conjunto (tabela, lista, formulário).
  Não aninhe painel dentro de painel. Uma lista de itens é **linhas com divisória**
  (`divide-y divide-slate-200`), não uma pilha de cards — card por item só no celular
  quando a tabela não cabe.

### Botões (`ui/button`)

| Variante | Quando |
|---|---|
| `default` | **uma** ação principal por área (Salvar, Nova tarefa, Enviar) |
| `outline` | ação secundária (Cancelar, Exportar, Filtros) |
| `ghost` | ação de linha/ícone, menos importante |
| `destructive` | excluir/encerrar — sempre com confirmação |
| `link` | navegação inline |

Tamanhos: `default` (36px), `sm` (32px; 40px no celular), `icon`/`icon-sm`.
Botão só-ícone precisa de `aria-label`. Nada de `w-full py-4 text-lg` no desktop.
Prefira `<Button>` a `<button className=…>` montado à mão.

### Status (`StatusBadge` / `ui/badge`)

`<Badge variant="success|warning|danger|info|neutral">` — fundo suave, texto escuro,
sem borda, `rounded-sm`. Para status de domínio use `<StatusBadge status="pending">`,
que mapeia o mesmo status para a mesma cor em toda tela. Um badge por informação;
não transforme todo metadado em pill.

### Formulários

- **Label sempre visível** (`<Label htmlFor>`), placeholder só como exemplo.
- Campos `ui/input`, `ui/select`, `ui/textarea` — altura 36px, borda `slate-300`,
  foco com anel azul. Mensagem de erro abaixo do campo em `text-xs text-red-700`.
- Agrupe por assunto; 2 colunas no desktop só quando os campos são curtos e
  relacionados. No celular, 1 coluna.
- Rodapé de formulário/diálogo: ações à direita, secundária antes da primária.

### Tabelas (`ui/table`)

- Cabeçalho `bg-slate-50 text-xs font-medium text-slate-500`, linha 40px, `px-3`.
- Número e dinheiro alinhados à direita, `tabular-nums`. Data curta (`07/10`).
- Ações de linha: botões `ghost` `icon-sm` à direita, ou menu `…`.
- Hover de linha `bg-slate-50`. Linha selecionada `bg-brand-50`.
- No celular: se a tabela não cabe, vire lista de linhas (não card com sombra).

### Diálogos, menus, confirmações

- `ui/dialog` (largura padrão `sm:max-w-lg`), título `text-base font-semibold`,
  botão fechar 32px, Esc fecha. Use diálogo para tarefa curta e focada;
  formulário longo vira painel/sheet.
- Confirmação: `ConfirmDialog` / `useConfirm` — nunca `window.confirm`.
- Menus: `ui/dropdown-menu`. Item destrutivo com `variant="destructive"`.

### Estados

- **Carregando:** `ui/skeleton` no formato do conteúdo (linhas de tabela, faixa de
  indicadores). Spinner só dentro de botão.
- **Vazio:** `<EmptyState title description action>` — diga o que está vazio e o que fazer.
- **Erro de carga:** `<QueryError onRetry>`.
- **Sucesso:** `toast.success` curto, sem exclamação em excesso.
- **Desabilitado:** `disabled` (opacidade 45%) + motivo em `title`/texto quando não é óbvio.

## 5. Movimento

150–200ms, `ease-out`, só para estado (hover, foco, abrir/fechar, feedback).
Proibido: `animate-bounce`, `animate-pulse` decorativo (ok em skeleton e no ponto
"trabalhando" do timer), entrada animada de página, `hover:scale`, `active:scale`.
`prefers-reduced-motion` já desliga tudo em `index.css`.

## 6. Acessibilidade

- Contraste ≥ 4.5:1 para texto (por isso `slate-500` é o mínimo para texto).
- Foco visível em todo controle (primitivos já têm; botão cru ganha outline global).
- Alvo de toque ≥ 40px no celular (`max-md:h-10` nos tamanhos pequenos).
- Botão só-ícone com `aria-label`; ícone decorativo com `aria-hidden`.
- Elemento clicável é `<button>`/`<a>`, não `<div onClick>`.

## 7. Checklist rápido de "cara de IA" (não pode aparecer)

`bg-gradient-*` · `backdrop-blur` · `shadow-lg+` em painel · `rounded-2xl/3xl` ·
`text-3xl+` · `font-black` · eyebrow uppercase · emoji em UI · card por KPI ·
card dentro de card · ícone colorido em quadradinho ao lado de todo título ·
"Bem-vindo ao seu dashboard" · `hover:-translate-y` · pill para todo metadado ·
borda lateral colorida de destaque (`border-l-4`) · cor sem função.
