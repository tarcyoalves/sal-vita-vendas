# PROMPT COMPLETO — Continuar criação da Landing Page Sal Vita Premium

> **Use este arquivo em um novo chat do Claude Code.**
> Copie tudo abaixo e cole como primeira mensagem.

---

## CONTEXTO DO PROJETO

Estou construindo uma **landing page one-page premium** para o produto **SAL VITA PREMIUM — Sal Integral de Mossoró** dentro do repositório `sal-vita-vendas`.

O projeto usa:
- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS 3.4**
- **Framer Motion 11** (já instalado)
- **Wouter** (roteamento)
- **tRPC** (backend)

---

## O QUE JÁ FOI FEITO

### 1. Google Fonts adicionados em `client/index.html`
Fontes já incluídas no `<head>`:
- **Fraunces** (display, variable: opsz, weight, italic)
- **Cormorant Garamond** (serif editorial)
- **Inter Tight** (sans UI/corpo)

### 2. CSS responsivo adicionado em `client/src/index.css`
Classes CSS criadas ao final do arquivo para responsividade da landing:
```
.lp-hero-grid         → grid 2 colunas (quebra em 900px para 1 coluna)
.lp-origin-grid       → grid 2 colunas (quebra em 768px)
.lp-flavor-grid       → grid 3 colunas (quebra em 768px para 1 coluna)
.lp-purchase-grid     → grid 1fr / 1.4fr (quebra em 900px para 1 coluna)
.lp-stats-row         → flex row (quebra em 768px com wrap)
.lp-nav-links         → flex (oculto em 768px)
.lp-hero-img          → container da imagem do produto
.lp-ritual-scroll     → scroll horizontal sem scrollbar visível
```

### 3. O que ainda NÃO foi criado (sua tarefa)
- [ ] `client/src/pages/LandingPage.tsx` — **página principal a criar**
- [ ] `client/src/App.tsx` — **adicionar rota `/` para LandingPage e `/entrar` para login existente**
- [ ] Commit + push para branch `claude/sal-vita-website-c9WbI`

---

## IMAGEM DO PRODUTO

A imagem da embalagem deve ser colocada em:
```
client/public/embalagem.png
```
O código deve referenciar `/embalagem.png` e ter um fallback CSS elegante caso a imagem não exista.

---

## CONCEITO CRIATIVO — "Cristal do Atlântico"

Definido pelo planejamento Opus. Resumo executivo:

### Paleta de Cores
```
--abismo:        #0A1B3D   (azul profundo — fundo principal)
--noite-marinha: #0F2A57   (azul intermediário)
--ouro-lume:     #C9A04A   (dourado mate — acento principal)
--ouro-claro:    #E8C77A   (dourado highlight/hover)
--branco-mineral: #F4EFE6  (off-white quente — seções claras)
--sombra-salina:  #061027  (azul quase preto — fundo profundo)
```

### Sistema Tipográfico
| Variável | Fonte | Uso |
|---|---|---|
| Display | `'Fraunces', serif` | Headlines grandes, números editoriais |
| Serif | `'Cormorant Garamond', serif` | Citações, textos cinematográficos, assinaturas |
| Sans | `'Inter Tight', sans-serif` | Corpo, UI, preços, botões, labels |

### Assinatura de Marca
> **"O sal que o mar levou um ano para escrever."**

---

## ESTRUTURA DA PÁGINA (7 seções obrigatórias)

### SEÇÃO 1 — NAV (sticky)
- Transparente → sólido ao rolar (scroll Y > 80px)
- Logo: `<img src="/sal-vita-logo.svg" />` com filtro branco
- Badge "Premium" ao lado do logo em dourado
- Links de navegação âncora: Origem, Usos, Comprar
- Botão CTA "Comprar" em dourado
- No mobile: links ocultos (`.lp-nav-links`), somente logo + botão

---

### SEÇÃO 2 — HERO cinematográfico
**Layout:** Grid 2 colunas (`.lp-hero-grid`). Esquerda: texto. Direita: produto.

**Fundo:** `radial-gradient(ellipse at 75% 50%, #0F2A57 0%, #0A1B3D 55%, #061027 100%)`

**Grain overlay:** SVG noise base64 com `mix-blend-mode: overlay, opacity: 0.4`

**Partículas de cristal:** 18–25 `<motion.span>` com posição aleatória, animação `y: [-15, 15]` e `opacity: [0, 0.4, 0]` em loop infinito com `Framer Motion`

**Coluna esquerda (texto):**
```
Badge: "── MOSSORÓ, RN · SAL MARINHO INTEGRAL"  (dourado, uppercase, tracking 0.25em)

Headline (Fraunces, 96px desktop / 56px mobile, weight 300):
  "O mar não tem pressa.
   Por isso tem sabor."
  (último verso em itálico dourado)

Subheadline (Cormorant Garamond italic, 22px):
  "Sal integral colhido nas salinas do Rio Grande do Norte.
   Não refinado, não branqueado, não apressado."

CTAs:
  Primário: "Levar para minha cozinha"  → background #C9A04A, cor #061027
  Secundário: "Conhecer a origem"       → border rgba(244,239,230,0.25), texto rgba(branco,0.6)
```

**Coluna direita (produto):**
- Glow radial dourado atrás (`radial-gradient(circle, #C9A04A22, transparent)`)
- `<img src="/embalagem.png" />` com `filter: drop-shadow(0 32px 64px rgba(10,27,61,0.8))`
- `<motion.div>` com `initial={{ opacity:0, scale:0.88, y:20 }}` e `animate` ao montar
- Fallback CSS quando imagem não carrega (div estilizado com as cores da marca)

**Scroll indicator:** seta animada + "DESCOBRIR" em mono pequeno

**Animações:**
- Nav: `initial={{ y: -72 }}` → `animate={{ y: 0 }}`
- Textos: `whileInView` com `fadeUp` variant (stagger 0.1s entre elementos)
- Imagem do produto: mola suave ao entrar + flutuação leve em loop
- Paralax: `useScroll + useTransform` no container da imagem (imgY) e texto (textY)

---

### SEÇÃO 3 — POSICIONAMENTO
**Fundo:** `#F4EFE6` (branco mineral)

**Layout:**
- Linha vertical dourada (1px, 120px altura) à esquerda com `scaleY: 0 → 1` ao entrar
- Headline: **"Não é um tempero. É uma origem."** (Fraunces italic, 72px)
- Parágrafo: "O Sal Vita Premium não passa por refinaria, branqueamento ou aditivos..."
- 3 stats em linha (`.lp-stats-row`):
  - `+80` / Minerais naturais preservados
  - `0` / Aditivos ou branqueadores
  - `100%` / Sal marinho de Mossoró, RN
- Números em Fraunces dourado, labels em Inter Tight uppercase pequeño

---

### SEÇÃO 4 — ORIGEM: MOSSORÓ
**Layout:** Grid 2 colunas (`.lp-origin-grid`)

**Coluna esquerda — visual atmosférico:**
```css
background: linear-gradient(135deg, #C9A04A33 0%, #0F2A57 40%, #061027 100%)
```
- Glow solar radial (topo-centro, dourado difuso)
- 5 linhas horizontais finas douradas com `scaleX: 0 → 1` staggered
- Gradiente de "reflexo de salina" na metade inferior
- Coordenadas geográficas fixas no canto inferior esquerdo:
  `5°11′S 37°20′W · Mossoró, RN` (mono, dourado suave)

**Coluna direita — texto:**
```
Label: "── TERRITÓRIO DE ORIGEM"
Headline: "Onde o semiárido encontra o oceano." (Fraunces, 56px)
          → "encontra o oceano." em itálico dourado

Texto abertura (Cormorant Garamond italic, 21px):
  "Mossoró fica numa esquina improvável do Brasil: terra seca,
   sol implacável, vento que não descansa..."

Corpo (Inter Tight, 16px, opacity 0.6):
  "Evapora devagar. Concentra. Cristaliza. O que sobra, no fim
   do ciclo, é o que você tem em mãos..."

Divisor dourado (linha horizontal animada)

Assinatura final (Cormorant italic, dourado):
  "O sal que o mar levou um ano para escrever."
```

---

### SEÇÃO 5 — POR QUE O SABOR MUDA
**Fundo:** `#0A1B3D`

**Layout:** 3 colunas (`.lp-flavor-grid`) com linha dourada fina no topo de cada coluna

**Header:**
```
Label: "DIFERENÇA SENSORIAL"
Título: "Três coisas acontecem quando o sal é integral."
```

**3 Cards:**
| Número | Título | Corpo |
|---|---|---|
| `01` | O grão tem geometria. | Cristais irregulares quebram em momentos diferentes na boca, criando camadas de sabor onde o sal refinado entrega só uma nota. |
| `02` | O paladar percebe minério. | Mais de 80 minerais residuais conferem ao Sal Vita uma assinatura levemente mineral — algo que o sal de cozinha comum perdeu há décadas. |
| `03` | Você usa menos. | Como cada grão libera mais sabor, a mão fica mais leve. O prato ganha definição sem ficar excessivamente salgado. |

**Números:** Fraunces 108px, `color: transparent`, `WebkitTextStroke: 1px #C9A04A66` (outline dourado)

**Animação:** ao entrar no viewport, stagger 200ms entre colunas (`whileInView`)

---

### SEÇÃO 6 — TRANSPARÊNCIA
**Fundo:** `linear-gradient(160deg, #0F2A57 0%, #061027 100%)`

**Layout:** centralizado, max-width 800px

**Estrutura:**
```
Aspas decorativas: Fraunces 140px, cor #C9A04A, opacity 0.15

Label: "SEM PROMESSAS DE MARKETING"

Headline: "Vamos ser honestos com você."

Texto (Cormorant Garamond italic, 23px):
  "Sal Vita Premium não cura nada, não emagrece ninguém e não
   substitui acompanhamento médico. O que fazemos é simples:
   trazemos para a sua cozinha o sal mais íntegro que Mossoró
   é capaz de produzir..."

Linha dourada animada

Rodapé: "Menos milagre de marketing. Mais origem, sabor e verdade."
         (Inter Tight uppercase, tracking 0.15em, opacity 0.4)
```

---

### SEÇÃO 7 — RITUAL DE USO
**Fundo:** `#F4EFE6`

**Header:**
```
Label: "RITUAL DE USO"
Título: "Seis lugares onde ele faz diferença." (Fraunces italic)
```

**Carrossel horizontal** (`.lp-ritual-scroll`):
- CSS: `overflow-x: auto`, `scroll-snap-type: x mandatory`, sem scrollbar
- 6 cards, cada um: `width: clamp(260px, 30vw, 320px)`, `scroll-snap-align: start`
- Estilo do card: fundo `#0A1B3D`, borda `rgba(201,160,74,0.12)`, faixa dourada no topo (3px)
- `whileHover={{ y: -6 }}` no card
- Número em outline dourado (Fraunces 64px)

**6 Cards de ritual:**
| # | Label | Descrição |
|---|---|---|
| 01 | Churrasco | Finalize a carne fora do fogo, com os cristais maiores. Eles estalam. |
| 02 | Saladas | Quebre o cristal com os dedos sobre tomates maduros e azeite. É outra salada. |
| 03 | Grelhados | Pulverize antes de selar o peixe; a crosta forma textura própria. |
| 04 | Massas | Uma pitada na água do cozimento, outra na finalização. A massa ganha contorno. |
| 05 | Finalização | Sobre ovo cozido mole, abacate, manteiga gelada, chocolate amargo. |
| 06 | Dia a dia | Substitua o sal refinado. O feijão e o arroz vão te contar a diferença. |

---

### SEÇÃO 8 — COMPRA + FRETE
**Fundo:** `#0A1B3D`

**Header (centralizado):**
```
Label: "ESCOLHA SEU RITUAL"
Título: "Você não está comprando um pacote de sal." (Fraunces italic)
Subtítulo: "Está comprando 365 dias de sol, vento e oceano — colhidos nas salinas,
            embalados em Mossoró, entregues na sua porta."
```

**Grid de produtos** (`.lp-purchase-grid`):

**Card 1kg** (borda sutil, sem destaque especial):
```
Label:    "Cristal · 1 kg"
Preço:    R$ 29,90  (Fraunces 64px, "R$" sobrescrito menor)
Subtítulo: "Para começar a conversa." (Cormorant italic)
Divisor dourado
Features:
  ── Embalagem premium azul e dourado
  ── Rendimento médio de 2–3 meses
  ── Fechamento hermético
Divisor dourado
Seletor de quantidade: [ − | 1 | + ] + "Total: R$ XX,XX"
Botão: "Levar 1 kg" (border dourado, texto dourado, hover fill)
```

**Card 10kg — DESTAQUE** (borda `#C9A04A`, fundo `gradient marinha→abismo`, glow):
```
Selo: "MELHOR ESCOLHA" (badge dourado colado no topo, cor sombra)
Label:    "Caixa Cristal · 10 kg"
Preço:    R$ 149,00  (Fraunces 64px, dourado mais brilhante)
Subtítulo: "Para quem já não volta atrás." (Cormorant italic)
Callout de economia:
  "Equivale a R$ 14,90/kg — metade do preço avulso"
  "Economia de R$ 150,00 vs. 10 unidades"
  (box com borda dourada 33%, fundo dourado 18%)
Divisor dourado
Features:
  ── Caixa colecionável azul abismo
  ── Estoque para o ano inteiro
  ── Frete otimizado por volume
  ── Garantia de origem Mossoró
Divisor dourado
Seletor de quantidade + "Total: R$ XX,XX"
Botão: "Reservar minha caixa" (fundo #C9A04A, cor #061027, bold, hover #E8C77A)
```

**Componente QtySelector:**
```tsx
// Três elementos em linha: botão −, input número, botão +
// Border: 1px solid #C9A04A44
// Hover nos botões: background #C9A04A22
// Atualiza preço total em tempo real
// min: 1, max: 99
```

**Calculadora de Frete** (abaixo dos cards, full-width até max-width 900px):
```
Título:    "CALCULAR FRETE"
Subtítulo: "Quanto custa trazer Mossoró até você? Digite seu CEP."

Input CEP:   máscara 00000-000, placeholder "00000-000"
             estilo: fundo transparent, borda #C9A04A44, texto branco, 180px width
Botão:       "Calcular" → disabled durante loading
             cor #061027, fundo #C9A04A

UX States:
  idle     → só o input + botão
  loading  → botão com texto "Calculando..." + disabled
  success  → 3 opções em cards selecionáveis:
               Mini Envios  R$ 18,50   10–15 dias úteis
               PAC          R$ 24,90   8–12 dias úteis
               SEDEX        R$ 49,90   3–5 dias úteis
  error    → mensagem em vermelho suave

Nota de rodapé: "Despachamos em até 2 dias úteis a partir de Mossoró/RN.
                 Integração via Melhor Envio."
                 (Inter Tight 11px, opacity 0.3)

OBS: O endpoint de frete é MOCK por enquanto (setTimeout 1400ms).
     Formato da resposta: Array<{ name: string; price: string; days: string }>
     Salvar CEP em localStorage key: 'salvita.cep'
```

---

### SEÇÃO 9 — FRASE FINAL
**Fundo:** `#061027`

**Partículas de cristal flutuando** (Framer Motion, igual ao hero)

**Estrutura:**
```
Label: "SAL VITA PREMIUM · MOSSORÓ, BRASIL" (mono uppercase, dourado opacity 0.5)

Headline (Fraunces italic, 72px desktop):
  "O mar levou um ano.
   Você leva um instante."  ← segunda linha em dourado

CTA: "Trazer o mar para a mesa"
     (fundo #C9A04A, cor #061027, padding 18px 48px)
```

---

### FOOTER
```
Fundo: #061027
Borda topo: 1px solid rgba(201,160,74,0.12)
Padding: 32px horizontal

Esquerda: "© 2025 Sal Vita Premium · Todos os direitos reservados"
           (Inter Tight 11px uppercase, opacity 0.27)

Direita: "Mossoró, Rio Grande do Norte, Brasil"
          (Cormorant Garamond italic, 14px, dourado opacity 0.48)
```

---

## UTILITÁRIOS INTERNOS DO COMPONENTE

### `Reveal` wrapper
```tsx
// Framer Motion whileInView com fadeUp
// Props: children, d (delay, default 0), className
const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.85, delay: d, ease: [0.16, 1, 0.3, 1] }
  }),
};
```

### `GoldLine`
```tsx
// Linha horizontal dourada com animação scaleX 0→1
// linear-gradient(90deg, transparent, #C9A04A, transparent)
// transformOrigin: left
```

### `Particles`
```tsx
// Props: count (default 20)
// Refs de posições aleatórias (useMemo ou useRef para evitar rerenders)
// motion.span com animate: { y: [-15, 15, -15], opacity: [0, 0.4, 0] }
// transition: repeat Infinity, ease: easeInOut, duration variável (8–18s)
```

### `QtySelector`
```tsx
// Props: value: number, onChange: (n: number) => void
// Layout: flex, border 1px solid #C9A04A44
// Três partes: botão −, div com valor, botão +
// Hover nos botões: background #C9A04A22
```

### `ShippingCalculator`
```tsx
// States: cep, loading, results, error
// formatCep: máscara 00000-000
// calculate(): valida 8 dígitos, await setTimeout(1400), seta resultados mock
// Persistência: localStorage 'salvita.cep'
```

### Grain overlay (SVG inline base64)
```html
<!-- Aplicar como div absoluta em seções escuras -->
background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' 
  xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E
  %3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' 
  stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' 
  filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")
mix-blend-mode: overlay
opacity: 0.4
pointer-events: none
```

---

## ATUALIZAÇÃO DO App.tsx

Adicionar rota para a landing e mover login para `/entrar`:

```tsx
// Importar
import LandingPage from "./pages/LandingPage";

// No Router():
<Route path={"/"} component={LandingPage} />            // NOVO: landing page
<Route path={"/entrar"} component={Home} />              // MOVER: login (era "/")
// ...restante das rotas mantidas igual
```

**ATENÇÃO:** O componente `Home.tsx` (login) redireciona users autenticados para o dashboard. Isso continua funcionando normalmente na rota `/entrar`. Não é necessário alterar `Home.tsx`.

**Ocultar FloatingChat na landing:** O `FloatingChat` no `App.tsx` aparece em todas as rotas. Para ocultá-lo na landing, adicionar verificação de rota dentro do componente `FloatingChat` ou usar conditional no `App.tsx`:
```tsx
// Em App.tsx, antes de <FloatingChat />:
const [location] = useLocation();
// Renderizar somente se não for a landing
{location !== '/' && <FloatingChat />}
```

---

## ARQUIVO DA IMAGEM DO PRODUTO

Copiar a imagem da embalagem (PNG com fundo transparente ou branco) para:
```
client/public/embalagem.png
```
A tag `<img>` usa `onError` para ativar o fallback CSS caso o arquivo não exista.

---

## GIT

Branch de trabalho:
```bash
git checkout -b claude/sal-vita-website-c9WbI
# ou se já existir:
git checkout claude/sal-vita-website-c9WbI
```

Ao finalizar:
```bash
git add client/src/pages/LandingPage.tsx client/src/App.tsx client/index.html client/src/index.css
git commit -m "feat: landing page premium Sal Vita Premium — Cristal do Atlântico"
git push -u origin claude/sal-vita-website-c9WbI
```

---

## CHECKLIST FINAL

- [ ] `client/index.html` — Fontes Google adicionadas ✅ (já feito)
- [ ] `client/src/index.css` — Classes responsive `.lp-*` adicionadas ✅ (já feito)
- [ ] `client/src/pages/LandingPage.tsx` — **CRIAR** (tarefa principal)
- [ ] `client/src/App.tsx` — **ATUALIZAR** rotas (`/` → LandingPage, `/entrar` → Home)
- [ ] `client/public/embalagem.png` — Copiar imagem da embalagem manualmente
- [ ] Commit + push para `claude/sal-vita-website-c9WbI`

---

## REGRAS INEGOCIÁVEIS DE COMUNICAÇÃO

1. **Não usar alegações médicas** — jamais dizer que é mais saudável, previne doenças, etc.
2. **Evitar clichês** — proibido: "transforme sua rotina", "qualidade que você merece", "desperte seu potencial"
3. **Foco em**: origem, sabor, textura, ritual, procedência, autenticidade, desejo
4. **Tom**: sofisticado, sensorial, elegante, brasileiro com refinamento internacional

---

## COPY DE REFERÊNCIA COMPLETA

### Headlines principais (3 opções — use a #1 como padrão)
1. *"O mar não tem pressa. Por isso tem sabor."*
2. *"Mossoró, em cristal."*
3. *"Um ano de sol em cada grão."*

### Subheadlines (3 opções)
1. "Sal integral colhido à mão nas salinas do Rio Grande do Norte. Não refinado, não branqueado, não apressado."
2. "Mais de 80 minerais que o Atlântico depositou — e que nenhuma indústria removeu."
3. "O tempero que o seu prato esperava sem saber."

### CTAs (5 opções)
1. "Levar para minha cozinha" ← **primário recomendado**
2. "Provar Mossoró"
3. "Conhecer o cristal"
4. "Reservar minha caixa" ← **card 10kg**
5. "Trazer o mar para a mesa" ← **frase final**

---

## DIREÇÃO CRIATIVA ALTERNATIVA (versão mais ousada)

Se quiser uma versão **"Silêncio Mineral"** (extremamente minimalista):
- Paleta: `#EDE7DA` (base), `#1A1A1A` (texto), `#B08A3E` (acento único)
- Abandona o azul da embalagem — cria identidade digital paralela editorial
- Headline: *"Sal. E nada mais."*
- Uma frase por seção. Scroll = virar página.
- Preços como números editoriais soltos (Fraunces 200px), sem botão visível até hover

---

*Documento gerado em: 01/05/2026 | Projeto: sal-vita-vendas | Branch: claude/sal-vita-website-c9WbI*
