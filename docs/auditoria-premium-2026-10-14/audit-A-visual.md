# Auditoria A (visual / "cara de IA") — loja Sal Vita Premium

Escopo lido: `client/src/pages/SalVitaLanding.tsx` (1962 linhas, inteiro), `client/index.html`, `client/src/index.css` (início/tokens), `components/SalVitaChat.tsx` (inteiro), regras de `ESTADO-DO-PROJETO.md` §4 e registro de 07/10.
Somente leitura. Nada foi editado. Linhas referem-se a `SalVitaLanding.tsx` salvo indicação.
Não repete o que 07/10 já corrigiu (partículas, órbita, marquee, CTA pulsando, prova social falsa, "+80 minerais" etc.).

## Placar (impeccable audit)

| Dimensão | Nota | Achado-chave |
|---|---|---|
| Acessibilidade | 3/4 | Base boa (dialog, foco, aria). Falta: texto minúsculo, chat com alvos < 44px, branco sobre #009ee3 = 3,0:1 |
| Performance | 2/4 | 6 famílias de fonte carregadas, só 2 usadas; reveals gateados por JS |
| Responsivo | 3/4 | Overflow mascarado por `overflow-x:hidden`; barra fixa cobre o rodapé; CNPJ nowrap apertado |
| Tema/tokens | 1/4 | Hex solto por todo lado, 3 azul-marinho diferentes, verde/azul Tailwind fora da paleta |
| Anti-padrões | 1/4 | Gradient text, glass, eyebrow em toda seção, grid 6 ícones, números 01–06 decorativos, bolhas de brilho |
| **Total** | **10/20** | Aceitável, precisa de trabalho significativo na identidade |

Contagem: **P0 0 · P1 9 · P2 17 · P3 9** (35 achados).

### Veredito anti-padrão: REPROVA (3–4 sinais fortes)
Não é um template genérico, a base tem fotos reais, marinho/dourado e dados verificáveis. Mas um leitor atento diz "IA fez" por: texto em gradiente (4x), blur/vidro em 5 lugares, cabeçalho de seção idêntico (eyebrow + fio dourado + h2 centralizado) 7x, grid 6x ícone-em-círculo-dourado numerado, números 01–06 decorativos, bolhas radiais desfocadas no hero, tipografia da lista "reflexo" (Cormorant Garamond + Outfit), chat azul-genérico com ✨.

---

## P1 — corrigir antes da próxima divulgação

**P1-1. Texto em gradiente dourado (`.shim-blue`)** — linhas 879, 1113, 1238, 1249. Ban absoluto do impeccable; o nome da classe (`shim-blue`) nem bate com o que faz. Em "Premium" e nos números "Dezenas / 95%" vira o selo visual de "feito por IA".
Correção: remover `background-clip:text` e usar cor sólida: `.shim-blue{color:var(--goldlt);}` (sobre escuro) e `color:var(--golddk)` no bloco claro de 1238 (gradiente dourado sobre branco também reprova contraste). Renomear a classe para `.gold-text`.

**P1-2. Linha do processo omite a iodação (copy incompleta, não só estética)** — linhas 1271, 1297, 47 (FAQ 1), 1233. "Apenas os processos essenciais: colheita, secagem e moagem" e "Processamento mínimo" contradizem o rótulo e §4 (processo real: seleção, moagem, **iodação** e embalagem). A página fala de iodo em outro lugar (1180, 1476), mas descreve o processo como se não houvesse etapa de adição.
Correção de copy: passo 3 vira "Moagem e iodação" — "O sal é moído e recebe o iodo exigido por lei (25 mg/kg). Nenhum mineral traço é retirado." FAQ 1: "…passa por colheita, secagem, moagem e iodação (obrigatória por lei no sal de mesa), sem o refino industrial que remove os minerais traço." Benefício 2 (1297): trocar "Processamento mínimo — colheita, secagem ao sol e moagem." por "Sem refino que remova os minerais traço. O sal é colhido, seco ao sol, moído e iodado."

**P1-3. Alegações de processo não comprovadas no repositório** — linha 1270 "sem fornos, sem calor industrial, sem pressa"; 1210 "Das maiores salinas do Brasil"; 1321 "cristalizado pelo vento do sertão"; 1325 "Processo de Cristalização Natural". Nada em §4 sustenta "sem fornos/sem calor industrial" ou "maiores salinas"; é dado técnico inventado (regra do AGENTS.md: nunca inventar dado técnico). "Sem pressa" é tríade de enfeite.
Correção: 1270 → "Evaporação solar: a água do mar vai secando ao sol nos tanques." 1210 → "Salinas de Mossoró, Rio Grande do Norte." 1321/1325 → ver bloco de copy (C-6). Confirmar com o produtor antes de qualquer afirmação sobre ausência de calor/forno.

**P1-4. Termo "Sal Integral" ainda em vários pontos** — linhas 1120 (hero), 1148 (alt), 1525 (rodapé), 1363 (eyebrow "Sal integral vs refinado"), `index.html` description/og. O registro de 07/10 adotou o nome da embalagem "Sal Marinho Não Refinado"; §4 cita a proibição de 07/08/2026 que atingiu "Sal Marinho Integral"/"Sal Integral Quanqton" (por falta de registro + alegação terapêutica, não pelo nome, mas o termo está na zona de atenção). Decisão do dono/regulatório; do lado de design, a inconsistência (dois nomes para o mesmo produto na mesma tela) já é defeito.
Correção: padronizar em "Sal Marinho Não Refinado" (nome da embalagem). 1120 → `Sal marinho não refinado · Mossoró/RN`. 1525 → `Sal Marinho Não Refinado, de Mossoró (RN).` 1363 → ver C-9.

**P1-5. H1 não diz o que o produto é** — linhas 1108-1121. H1 = "SAL VITA" (112px) + "Premium" (80px); a descrição do produto está num `<p>` de 14px caixa-alta com 62% de branco (1119). Na primeira dobra o visitante vê marca (já no logo do nav) e uma frase de efeito entre aspas, mas não "sal marinho não refinado de Mossoró". Hierarquia invertida e ruim para SEO/leitores de tela.
Correção: `<h1>` = "Sal marinho não refinado de Mossoró" (Cormorant, `clamp(2.6rem,6vw,4.5rem)`), "Sal Vita Premium" vira linha de marca menor acima (não precisa repetir o logo). Remover as aspas do slogan (1117): aspas dão cara de depoimento; a embalagem diz isso, então escrever "Muito mais sabor, em cada pitada." sem aspas, itálico, 1 linha.

**P1-6. Faixa verde "Direito de arrependimento" fora da paleta e repetida 4x** — linhas 1193-1201 (verde Tailwind `#f0fdf4/#bbf7d0/#15803d/#166534`, também 1651, 1830, 1896), mais 1197, 1436, 1831 e rodapé. É a primeira coisa depois do hero, num bloco verde-alerta que lê como mensagem de sistema. A obrigação legal aparece 4 vezes na mesma página.
Correção: manter UMA vez, no checkout (1830, já cumpre o dever de informar) e uma linha discreta na seção de preço (1436). Apagar a faixa 1192-1201 inteira. Se quiser manter a faixa, trocar para fundo `var(--saltmd)`, texto `var(--mid)`, sem verde.

**P1-7. Chat flutuante em outra identidade (azul genérico + ✨)** — `SalVitaChat.tsx:92,121,148-153,149,162-164,34`. Gradiente `#0C3680→#1a56c4` (azul-royal brilhante), chips `#eff6ff/#1d4ed8` (Tailwind blue-50/700), bolha cinza-ardósia, **emoji ✨ na saudação** (linha 34), balão do botão com `scale(1.1)`. É o único elemento fixo na tela o tempo todo e não tem nada de dourado nem do marinho da loja. Alvos: fechar 32x32 (l.124 area), enviar 38x38, chips ~30px de altura, link "Falar com uma pessoa" 12px.
Correção: botão e cabeçalho `background:#0b1d3a; border:1px solid rgba(201,162,39,.5)`; bolha do usuário `#0b1d3a`; bolha da IA `#f2f0ea`; chips `background:#fbfaf7;border:1px solid rgba(201,162,39,.45);color:#0b1d3a;min-height:44px`; fechar e enviar `width:44px;height:44px`; remover `scale(1.1)`; sem ✨. Aliás o link de WhatsApp do chat é o caminho humano: subir para botão visível (`min-height:44px`).

**P1-8. Estatísticas "hero-metric" com número que não é número** — linhas 1235-1242 e 1249. Três métricas grandes em gradiente: "Dezenas / Minerais traço do mar", "95% / do sal BR vem do RN", "Não Refinado / do oceano Atlântico". A terceira é incoerente ("Não Refinado do oceano Atlântico" não é métrica, e a origem "Atlântico" é dado novo). Além disso "Dezenas" ocupando 3,5rem sobre a foto (1249) enfatiza justamente a alegação de composição que §4 manda tratar com cautela ("dezenas" só como redação conservadora do verso).
Correção: tirar o trio inteiro. Deixar uma única frase com o dado verificável em corpo de texto: "Mossoró produz mais de 95% do sal marinho do Brasil." Remover o overlay "Dezenas" sobre a foto (1247-1251); a foto fala sozinha, legenda opcional "Salinas de Mossoró (RN)".

**P1-9. Seção "Sal integral vs refinado" não responde ao título** — linhas 1360-1380. Título: "O que o refinamento retira do seu sal?"; os 3 cards são "Sem refino industrial", "Origem: Mossoró/RN", "Embalagem zip lock" (a embalagem repete a frase do card). Promete comparação e entrega três cartões iguais com texto duplicado do título/benefícios. Fala de "refinamento retira" também faz comparação com o concorrente (permitido por §4: "o refino remove os minerais traço", sem atacar).
Correção: ou cortar a seção (o conteúdo já está em benefícios + timeline), ou transformar em 2 parágrafos reais. Sugestão (C-9). Recomendo cortar: remove 1 grid de 3 cards iguais e ~110px de rolagem.

---

## P2 — próxima rodada

**P2-1. Cabeçalho de seção idêntico em 7 seções (eyebrow + fio + h2 centralizado)** — 1261-1265, 1288-1292, 1336-1344, 1363-1365, 1386-1390, 1498-1499, e SheetHead 223 (eyebrow nos 3 modais). Eyebrow caixa-alta com tracking .26–.28em em .84rem (13px) é o "scaffold de IA" nº 1. Fios dourados decorativos duplicam (1262, 1289, `.gold-line` 974).
Correção: manter UM eyebrow só (hero, sobre a origem) e cortar os demais; h2 alinhado à esquerda em pelo menos 3 das 7 seções para quebrar a simetria (story já é; faça timeline e FAQ à esquerda). Apagar `.gold-line` e as `div` de 40px. Modais: trocar o `<p>` eyebrow por título direto ("Frete", "Seus dados", "Pagamento").

**P2-2. Grid 6 cartões ícone-em-círculo (Benefícios)** — 1294-1309, CSS 949-958. Seis células iguais: ícone SVG em círculo dourado + h3 + p, com número fantasma 01–06 (`.ben-num`, 956) que não indica sequência (não há ordem). Redundância de conteúdo: "zip lock" (1298) e "janela" (1299) são o mesmo item; "Mossoró" (1301) repete 1230; "Sal Não Refinado" e "Seco ao Sol" repetem a timeline logo acima (1269-1272).
Correção: reduzir a 3 itens que a timeline não cobre: (a) "Minerais traço naturais" (não removidos), (b) "Embalagem zip lock com janela" (fundir), (c) "Iodado conforme a lei, 25 mg/kg" (hoje enterrado no rodapé do preço). Em lista de 3 linhas com layout assimétrico (título à esquerda 1/3, texto à direita 2/3, separados por fio), sem ícone em círculo e sem numeração. Apagar `.ben-icon-wrap` e `.ben-num`.

**P2-3. Seção "Como usar": numeração 01–06 de lista que não é sequência** — 961-966, 1346-1355. Seis categorias de prato com número gigante (4,4rem a 35% de dourado, `rgba(201,162,39,.35)` sobre `#faf5ef`, ~1,6:1; decorativo, mas ocupa 70px da linha). Nome no menu "Como Usar" vs eyebrow "Na cozinha" vs h2 "O sal que combina com tudo" (3 rótulos para 1 seção). Descrições vazias: "Um toque de sal marinho para o prato", "Tempero leve para o dia a dia".
Correção: lista simples em duas colunas, sem número; título em Cormorant 1.2rem + 1 linha concreta (C-5). Nome único: "Na cozinha" no nav e no h2.

**P2-4. Bolhas radiais desfocadas no hero** — 1097-1098 (círculos 640px e 480px com `filter:blur(10px)`), mais `box-shadow` com triplo anel (1147). É o "orbe luminoso" clássico de template de IA. 07/10 tirou partículas/órbita, essas ficaram.
Correção: apagar as duas `div` 1097-1098; manter só o gradiente radial do `background` da própria seção (1096). Anel dourado da foto: ficar com 1 só (`0 0 0 1.5px rgba(201,162,39,.5)`), tirar o halo `0 0 0 10px`.

**P2-5. Vidro/blur decorativo** — nav 1061 (`blur(18px)`), `.mo` modal 912 (`blur(10px)`), drawer 979 (`blur(14px)`), sticky-bar 981 (`blur(16px)`), pílula do panorama 1212 (`blur(5px)` + borda dourada + fios laterais). O fundo dos quatro primeiros já é 85–96% opaco, o blur não agrega nada e custa GPU em celular fraco; o do panorama é puramente decorativo.
Correção: remover `backdrop-filter` de 912, 979, 981, 1061 (cores já opacas). Na pílula 1212: tirar blur, fios e borda; texto simples `Mossoró · Rio Grande do Norte` sobre a degradê escura que já existe em 1207.

**P2-6. Sombras e raios em tudo, escala de raio sem sistema** — raios usados: 10, 12, 14, 16, 18, 20, 22, 24, 26, 999 (botões 10/14/16, cartões 18/20/26, modal 24/26, inputs 12). Sombras do tipo `0 24px 70px rgba(0,0,0,.5)` (900), `0 30px 80px` (1245), `0 40px 120px` (913), `0 8px 30px` (970,1665). Tudo flutua.
Correção: 3 raios (`--r-sm:8px` inputs/botões, `--r-md:14px` cartões/modais, `999px` pílulas) e 2 sombras (`--sh-1:0 2px 12px rgba(11,29,58,.08)`, `--sh-2:0 12px 40px rgba(11,29,58,.18)` só no modal). Cartões de preço: borda 1px, sem sombra.

**P2-7. Três cartões de preço iguais, todos com fita dourada** — 1394-1427, 898-902. Grid de 3 cartões simétricos, cada um com a mesma fita dourada `top-right` (1396), então o "destaque" (caixa) não se destaca. `.pc:hover{translateY(-6px)}` (hover lift) em todos. Listas de benefício diferentes entre cartões (1411 vs 1412) sem critério.
Correção: fita só na caixa; os outros dois sem fita (a tag `Para experimentar`/`Ideal para a Família` vira texto cinza pequeno sob o nome). Remover `.pc:hover` lift; trocar por mudança de borda. Lista única e curta, igual nos três (ver C-4). Primeiro cartão (1 kg) já deve ser o primeiro CTA do mobile.

**P2-8. Cinza-azulado e três "brancos" alternados** — fundos: `white` (1221, 1495), `#fbfaf7` (1176, 1360), `#faf5ef` (1317, 1333; areia quente fora do token `--salt`). Entre eles seções escuras com o mesmo degradê+grão (1258 e 1285 consecutivas, quase idênticas, parecem uma seção só de 1.100px de altura).
Correção: dois fundos claros apenas (`--salt:#fbfaf7` e branco), apagar `#faf5ef` (1317 degradê final e 1333). Separar timeline (1258) e benefícios (1285): ou fundir (a timeline vira o conteúdo e os 3 itens do P2-2 entram abaixo, em claro), ou alternar claro/escuro.

**P2-9. Tokens duplicados e vazando** — o bloco `:root{--brand:#0b1d3a;--salt:#fbfaf7…}` (837-851) é injetado em runtime e sobrescreve `--brand:#0C3680`/`--salt:#F7F6F2` do `index.css` enquanto a página está montada; `SalVitaChat` usa `#0C3680` direto; `index.html` `theme-color` é `#0C3680`; `TrackOrder`/`Atacado` usam outro azul. Resultado: 3 marinhos diferentes na loja (`#0C3680`, `#0b1d3a`, `#060f20`) e dezenas de hex literais (ex.: 1047, 1061, 1096, 1258, 1285, 1520).
Correção: mover os tokens da loja para `index.css` sob `.lp{…}` (não `:root`) e usar nomes `--sv-navy-950/900`, `--sv-gold-500/300/700`, `--sv-salt`. `theme-color` → `#0b1d3a`. Trocar hex literais por var(). Isso destrava P1-7.

**P2-10. Tipografia: escala caótica e corpo pequeno** — a página usa ~30 tamanhos de rem diferentes entre .68 e 1.06 (ex.: .75, .76, .78, .8, .82, .84, .85, .86, .87, .88, .9, .92, .93, .94, .95, .96, 1, 1.02, 1.05, 1.06). Textos muito pequenos: badge de frete `.68rem` (1927, ≈11px), etapas `.75rem` (931), cabeçalho "Informações do produto" `.82rem` (1474), selo `.8rem` (1186, 1442, 1685). Informação obrigatória (ingredientes, 1476) em .95rem branco/65% ok, mas o rótulo "Informações do produto" em .82rem caixa-alta.
Correção: escala de 6 degraus: `--t-xs:.8125rem; --t-sm:.9375rem; --t-base:1.0625rem; --t-lg:1.25rem; --t-xl:clamp(1.6rem,3vw,2.2rem); --t-display:clamp(2.4rem,5.5vw,4rem)`. Mínimo 13px para qualquer texto informativo; 16px para corpo. Subir 1927 para .75rem.

**P2-11. Caixa-alta + peso 800 em todo botão e etiqueta** — CTAs 1070, 1089, 1132, 1137, 1421, 1581, 1852; `.inp-lbl` 938; `.step-lbl` 931; h4 do rodapé 1535; etiquetas 1396, 1474, 1901. Gritar em todo lugar remove hierarquia e prejudica leitura em português (acentos em caixa-alta com tracking).
Correção: CTAs em caixa-baixa, peso 700, `letter-spacing:.01em` ("Comprar 1 kg", "Quero provar"). Caixa-alta só no selo de origem do hero. Rótulos de formulário em `font-weight:600; text-transform:none; font-size:.875rem`.

**P2-12. Títulos acima do teto e fontes da lista "reflexo"** — h1 `clamp(3.4rem,9vw,7rem)` (1108, máx 112px; teto 96px) e "Premium" 5rem. Cormorant Garamond + Outfit são ambas fontes que o impeccable lista como reflexo de IA (brand.md linha 32); Cormorant em itálico decorativo também é "editorial genérico" para marca de sal. A identidade do dono é Cormorant, então: decisão de marca, não bug.
Correção mínima: limitar h1 a `clamp(2.6rem,6.5vw,4.5rem)`, usar Cormorant só em h1/h2 e preços (não em FAQ 1.25rem, passos 1.35rem, totais — Cormorant tem x-height baixo e perde legibilidade abaixo de ~1.5rem; usar Outfit 600). Se o dono aceitar trocar: pareamento sugerido de sans humanista para corpo (Source Sans 3) e manter Cormorant só no display; decidir antes de qualquer mudança.

**P2-13. Seis (na verdade sete) famílias de fonte carregadas, duas usadas** — `index.html:113`: Pacifico, Inter, Barlow Condensed, JetBrains Mono, Cormorant (7 estilos), Outfit (5 pesos). A loja só usa Cormorant (400/600/700, itálicos) e Outfit (400–700) (monospace do PIX é `monospace` genérico). Pacifico/Inter/Barlow/JetBrains são do CRM e bloqueiam a renderização da vitrine.
Correção: dividir o `<link>` por host (script já existe em 100-125 do index.html que detecta `lembretes.`): na loja carregar só `Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@400;500;600;700`, no CRM o resto. Remover peso 300 e 500 de Cormorant se não usados.

**P2-14. Revelações gateadas por JS (conteúdo nasce invisível)** — `.rev,.rev-l,.rev-r,.rev-s{opacity:0}` (884-887) e IntersectionObserver (309-316) em 12 blocos, com **5 entradas diferentes** (sobe 36px, entra da esquerda 48px, da direita 48px, escala .92, mais rotação nas palavras do hero 872). É "fade-in em tudo" e viola a regra "o padrão visível deve ser o estado final". Se o JS falhar/aba oculta, a seção fica em branco; `prefers-reduced-motion` só encurta a duração, o item continua `opacity:0` até cruzar o observador.
Correção: padrão visível, sem animação de entrada em seções de texto. Manter só o reveal do hero (carregamento) e o do cartão de preço. Implementação: `.rev{opacity:1}`; envolver o efeito em `@media (prefers-reduced-motion:no-preference){ .js .rev:not(.on){opacity:0;transform:translateY(16px)} }` e adicionar `document.documentElement.classList.add('js')` no `useEffect`. Reduzir para 1 direção, 16px, .5s.

**P2-15. Delay de hover nas células** — 1303 `transitionDelay:${i*.08}s` em `.ben-cell`, que só tem `transition: background .35s` (950): o hover de fundo atrasa até .4s nas últimas células. 1347 idem em `.use-row`.
Correção: remover `transitionDelay` inline de 1303 e 1347 (o stagger deve estar na classe `.rev`).

**P2-16. Barra de compra fixa cobre o rodapé no celular** — `.sticky-bar` fixo (981, 1020, 1576) sem `padding-bottom` correspondente em `.lp`/footer (1520 tem 32px). Últimas linhas (copyright, CNPJ, links) ficam atrás da barra.
Correção: `@media(max-width:768px){.lp{padding-bottom:calc(76px + env(safe-area-inset-bottom));}}`. Também esconder a barra enquanto `#preco` está na tela (IntersectionObserver já existe em 436).

**P2-17. Selos genéricos de "segurança" no checkout** — 1679-1690 ("Compra Segura", "Criptografia SSL", "Mercado Pago") com ícones verdes, e 1199/1435 "Pagamento seguro". "Criptografia SSL" é termo obsoleto (TLS) e "Compra Segura" é autodeclaração vazia (padrão de template).
Correção: apagar os três ícones. Deixar só "Pagamento processado pelo Mercado Pago" (1677, já existe e é verificável) e a linha "PIX · cartão em até 3× · boleto".

---

## P3 — polimento

- **P3-1.** Glifos `✦` como marcador (1126, 1415), `✓` (1439, 1897, 1954), `×` (227), `←`/`↓`/`→` (1140, 1714, 1891). Não são emoji, mas `✦` é o "sparkle" de IA. Trocar `✦` por travessão-ponto simples `·` ou nada nas listas; badges do hero (1124-1129) viram texto corrido numa linha: "Minerais traço naturais · Não refinado · Seco ao sol · Zip lock com janela", sem pílulas.
- **P3-2.** `.cta-gold{position:relative;overflow:hidden}` (880) sem efeito (brilho removido em 07/10); apagar. `.cta-gold:active{scale(.97)!important}` (881) e `.sopt:active{scale(.985)}` (907) — aceitável, mas padronizar.
- **P3-3.** `SalVitaChat.tsx:77 onMouseEnter scale(1.1)` — hover scale; remover (ver P1-7).
- **P3-4.** Hero: `minHeight:100vh` (1096) vira salto no iOS; usar `min-height:100svh`. No celular, a foto vem antes do H1 (`.hero-img-wrap{order:-1}` 1000) e empurra o título para ~y=480px.
- **P3-5.** Divisor SVG em dentes (1166-1172): é a única forma distintiva, manter, mas hoje termina em `#fbfaf7` e logo vem a faixa `#fbfaf7` (1176): a fronteira some; ok.
- **P3-6.** Rodapé repete CNPJ duas vezes (1531 e 1569) e preços do catálogo (1537) que já estão em 1394+. Cortar a lista "Produto" (1534-1541): e "Minerais Traço Naturais" ali é item de lista solto.
- **P3-7.** `.lp{overflow-x:hidden}` (855) mascara qualquer overflow; remover depois de corrigir: `price-grid` usa `minmax(300px,1fr)` (1393) e quebra abaixo de 348px de viewport se o override `@media(max-width:768px)` (1010) deixar de existir; trust-strip: o CNPJ `whiteSpace:nowrap` (1185) em coluna de ~144px a 375px (clamp 4.4vw=16.5px) fica no limite; reduzir para `font-size:clamp(.9rem,3.8vw,1.15rem)` ou deixar quebrar.
- **P3-8.** `#009ee3` com texto branco 800 (1597, 1609, 1616) dá 3,0:1 (passa como texto grande, no limite). Se for mexer, `#0083c0` dá 4,5:1; o azul do PIX/Mercado Pago aparece ao lado do marinho/dourado e é a única cor de 3ª família no checkout; considerar marinho `var(--brand)` + texto branco como nos outros botões.
- **P3-9.** Fundo do botão desabilitado `#9bb3d0` (1616, 1717) é azul-claro fora da paleta; usar `opacity:.55` no próprio botão marinho.

---

## Responsividade 375px (resumo)

Bom: modal vira bottom sheet, botão fechar 44px, hamburguer 44px, links do rodapé 44px, inputs 16px (sem zoom iOS), grids passam a 1 coluna via `!important`.
Falhas: barra fixa cobre rodapé (P2-16); chat com alvos 32–38px e chips ~30px (P1-7); trust-strip CNPJ no limite (P3-7); título do hero abaixo da foto (P3-4); selo de frete `.68rem` (P2-10); `Ou fale pelo WhatsApp` ok (44px).
Contraste (checado por cálculo): `--muted #5f6f86` sobre branco ≈ 5,0:1 e sobre `#fbfaf7` ≈ 4,8:1 (passa); `--golddk #8a6a0c` sobre branco ≈ 5,0:1 (passa); branco/70% sobre marinho passa; `#009ee3`+branco 3,0:1 (P3-8); numerais `.ben-num` e `.use-big-num` são decorativos (aria-hidden) e não contam, mas ver P2-2/P2-3.

---

## Reescrita de copy (produtor de sal do RN, sem alegação nova)

Regras seguidas: nada de mineral contado/listado, nada de saúde, nada de "100% natural", "puro", "sem aditivos", "não empedra"; iodo sempre como "adicionado conforme a lei"; fatos só os de §4 e da embalagem.

**C-1 Hero (substitui 1105-1121)**
- Linha pequena (única caixa-alta): `Salinas de Mossoró · Rio Grande do Norte`
- H1: **Sal marinho não refinado de Mossoró**
- Sub: *Muito mais sabor, em cada pitada.* (slogan da embalagem, sem aspas)
- Apoio (1 frase, corpo 18px): "Secado ao sol nas salinas do Rio Grande do Norte, sem o refino industrial que tira os minerais traço do sal."
- Botões: `Comprar 1 kg` · `Ver tamanhos`

**C-2 Origem (substitui 1224-1234)**
- h2 (sem eyebrow): **Do tanque ao pacote, aqui em Mossoró**
- P1: "Mossoró produz mais de 95% do sal marinho do Brasil. O sol forte, o vento constante e o ar seco daqui fazem a água do mar secar nos tanques e virar sal." (todo o conteúdo já está no FAQ 4)
- P2: "O Sal Vita Premium não passa pelo refino industrial que retira os minerais traço. Ele é colhido, seco ao sol, moído, iodado como manda a lei e embalado em zip lock com janela."
- Sem as três "estatísticas".

**C-3 Linha do processo (substitui 1264, 1269-1272)**
- h2: **Como o sal chega ao seu pacote** (sem eyebrow "O caminho do sal")
- 1 Colheita — "A água do mar entra nos tanques e vai secando ao sol até formar o sal."
- 2 Secagem ao sol — "A evaporação solar faz o trabalho; o sal é colhido já cristalizado."
- 3 Moagem e iodação — "O sal é moído e recebe o iodo exigido por lei, 25 mg/kg. Nenhum mineral traço é retirado."
- 4 Embalagem — "Zip lock de 1 kg com janela para você ver o sal."

**C-4 Preço (substitui 1386-1390, tags, 1402, 1411-1412)**
- h2: **Escolha o tamanho** — sub: "Frete calculado pelo seu CEP. Entregamos em todo o Brasil."
- Tags: 1 kg → *(sem tag)*; Trio → "3 pacotes de 1 kg"; Caixa → "Menor preço por kg".
- Linha da caixa: "R$ 14,99 por kg na caixa. O pacote avulso custa R$ 29,90." (aritmética verificável; apaga `10 × … = R$ 299,00`)
- Lista única nos três cartões: `Sal marinho não refinado` · `Zip lock com janela` · `Iodado conforme a lei (25 mg/kg)` · `Produzido em Mossoró (RN)`. Sem "Ideal para casa, churrasco e cozinha".

**C-5 Na cozinha (substitui 1338, 1342 e USES 59-66)**
- h2: **Na cozinha** — sem subtítulo.
- Itens (1 linha cada, sem alegação):
  - Carnes e aves — "Para temperar antes de ir ao fogo ou na hora de servir."
  - Peixes e frutos do mar — "Na marinada ou por cima do prato pronto."
  - Saladas e legumes — "Uma pitada por cima, na hora."
  - Massas e risotos — "Na água do cozimento ou na finalização."
  - Sopas e caldos — "Durante o preparo, provando aos poucos."
  - Pães e massas — "Na massa, conforme a receita."

**C-6 Faixa de foto (1321, 1325)**
- Frase: "Mossoró, Rio Grande do Norte." (legenda, sem citação inventada) ou, se quiser tom: "Sol, vento e água do mar. É assim que o sal nasce aqui." Legenda pequena: remover "Processo de Cristalização Natural".

**C-7 Benefícios (se mantiver, ver P2-2) — substitui h2 1291 "Feito para quem valoriza o que come"**
- h2: **O que vem no pacote**
- Itens: (a) "Minerais traço naturais — O sal não passa por refino industrial, então os minerais traço não são retirados." (b) "Zip lock com janela — Abre e fecha quantas vezes precisar; a janela redonda deixa ver o sal." (c) "Iodado — 25 mg/kg, dentro da faixa que a lei exige para o sal de mesa."

**C-8 FAQ (substitui 47-52, remove o item 2 que só explica o slogan)**
1. "O sal é iodado?" — "Sim. O iodo é adicionado, como a lei exige para sal de mesa: 25 mg/kg."
2. "O que tem no pacote?" — "Cloreto de sódio, iodato de potássio e antiumectante INS-535 (ferrocianeto de sódio), como está no rótulo."
3. "O que é sal marinho não refinado?" — "É o sal que não passa pelo refino industrial que retira os minerais traço. Aqui ele é colhido, seco ao sol, moído e iodado."
4. "Por que o sal de Mossoró?" — (manter resposta atual)
5. "Como funciona o frete?" — "Enviamos pelos Correios, com rastreamento. O valor e o prazo aparecem pelo CEP antes de você pagar."
6. "Posso falar com alguém?" — "Pode: WhatsApp (84) 2140-8212."
- Eyebrow "Tire suas dúvidas" → remover; h2 "Perguntas frequentes" (minúsculo após a primeira).

**C-9 "Sal integral vs refinado" (1363-1365, 1369-1371) — se for mantida**
- h2: **Refinado e não refinado, qual a diferença?**
- Texto: "O refino industrial tira os minerais traço do sal e deixa, na prática, só o cloreto de sódio. O nosso sal não passa por esse refino. Os dois são iodados, porque a lei exige iodo no sal de mesa." (cumpre §4: "o refino remove"; não ataca antiumectante; admite iodo nos dois)
- Apagar os 3 cartões.

**C-10 Navegação e rótulos** — nav 831: `Produto · Origem · Na cozinha · Preço · Rastrear pedido` (troca "Benefícios", palavra que o leitor liga a saúde, por "Origem"); ids `#beneficios` → `#origem`. Drawer 1090 "Comprar Agora" → "Comprar".

**C-11 Chat (SalVitaChat.tsx:34, 113-118, 49)**
- Saudação: "Oi! Aqui é o atendimento automático da Sal Vita. Posso ajudar com produto, frete, pagamento ou pedido. Se preferir falar com uma pessoa, é só tocar no link do WhatsApp aqui em cima." (sem ✨, sem "assistente virtual do Sal Vita Premium")
- Erro (l.49): "Não consegui responder agora. Tente de novo ou chame a gente no WhatsApp: (84) 2140-8212."
- Chips: `Como faço o pedido?` · `Quanto tempo leva a entrega?` · `Aceita PIX?` · `O sal é iodado?` (troca "Qual a diferença do sal refinado?", que convida a resposta comparativa pela IA).

**C-12 Checkout** — 1626 "Finalize seu pagamento" ok; 1621 "Cartão em até 3× ou boleto (Mercado Pago)" ok; 1855 "Comprar Agora" dentro do modal de frete → "Continuar" (a ação não compra ainda); 1686 remover "Compra Segura / Criptografia SSL".

### Travessões e tríades a limpar
Travessão como pausa em 47, 1271 ("— sem fornos, sem calor industrial, sem pressa"), 1297, 1233, 1525, 1896; tríades: 1120, 1270, 1402, 1411. Regra: máx. 1 travessão por tela e nenhuma lista de 3 adjetivos.

---

## Ordem de execução sugerida (impeccable)

1. `/impeccable clarify` — C-1 a C-12 (P1-2, P1-3, P1-4, P1-5, P1-8, P1-9).
2. `/impeccable distill` — cortar faixa verde, seção comparativa, grid de benefícios, trust badges, número decorativo (P1-6, P1-9, P2-2, P2-3, P2-17).
3. `/impeccable quieter` — gradient text, bolhas, blur, sombras, raios, hover lift, ribbon (P1-1, P2-4 a P2-7, P3-1).
4. `/impeccable colorize` + `extract` — tokens `.lp`, chat na identidade, paleta única (P1-7, P2-8, P2-9, P3-8, P3-9).
5. `/impeccable typeset` — escala, caixa-alta, h1, famílias carregadas (P2-10 a P2-13).
6. `/impeccable adapt` — barra fixa, trust-strip, hero mobile (P2-16, P3-4, P3-7).
7. `/impeccable polish` — final.

Todos os textos propostos devem passar por conferência com a embalagem antes de ir ao ar; o dado de "25 mg/kg", "95%", ingredientes e CNPJ vêm de §4 e do código atual, nada novo foi inventado. Itens que dependem do produtor: P1-3 (calor/forno no processo), P1-4 (nome comercial).
