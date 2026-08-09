# Relatório de Varredura — Sal Vita Premium (loja)

**Data:** 09/08/2026
**Escopo:** EXCLUSIVAMENTE o subsistema de e-commerce `premium.salvitarn.com.br` — landing, checkout e gestão de pedidos.
**Fora de escopo:** CRM de lembretes (`lembretes.salvitarn.com.br`), e-mail marketing, routers `tasks`/`sellers`/`clients`/`reminders`/`ai`/`knowledge`/`workSessions`/`tv`.

Este documento é a continuação do `RELATORIO-AUDITORIA-PREMIUM.md` (02/07/2026). Ele faz duas coisas:
1. **Confere o que daquela auditoria foi de fato corrigido** (verificado no código atual, não no que foi planejado).
2. **Registra 12 achados novos** que aquela auditoria não cobriu — a maioria com impacto direto em receita ou segurança.

Arquivos analisados: `api/index.ts`, `server/routers/shipping.ts`, `server/routers/recovery.ts`, `server/db/ordersDb.ts`, `server/db/schema.ts`, `server/lib/orderConfirmation.ts`, `client/index.html`, `client/src/pages/SalVitaLanding.tsx`, `client/src/pages/TrackOrder.tsx`, `client/src/pages/SalVitaAdmin.tsx`, `vercel.json`, `vps-wa-patch.sh`. Evidência de produção: painel Vercel (`sal-vita-vendas`, erros de runtime dos últimos 7 dias).

---

## Sumário executivo

| Severidade | Novos | Herdados em aberto | Total |
|---|---|---|---|
| 🔴 Crítico | 3 | 0 | 3 |
| 🟠 Alto | 4 | 3 | 7 |
| 🟡 Médio | 3 | 2 | 5 |
| 🔵 Baixo | 2 | — | 2 |

**Os três críticos, em uma linha cada:**
1. A chave da API do WhatsApp está publicada no GitHub — qualquer pessoa pode enviar mensagem pelo número da Sal Vita.
2. O valor do frete é enviado pelo navegador e o servidor aceita sem reconferir — dá para comprar com frete R$ 0,00.
3. O cron roda 1× por dia processando no máximo 3 carrinhos — e em 07/08 ele quebrou inteiro, zerando o dia.

---

## 🔴 CRÍTICOS (novos)

### N1. Chave da API do WhatsApp exposta em repositório público

- **Onde:** `vps-wa-patch.sh:88` (também linha 4: IP da VPS, usuário SSH e caminho da chave).
- **Verificado:** o arquivo foi baixado anonimamente, sem autenticação, de
  `raw.githubusercontent.com/tarcyoalves/sal-vita-vendas/main/vps-wa-patch.sh`. **O repositório é público.**
- **O que vaza:**
  - `apikey` do wa-server em texto puro, junto com o endpoint `https://evolution.salvitarn.com.br/send` e o formato exato do payload — ou seja, um exemplo pronto de uso.
  - IP da VPS Oracle, usuário SSH (`ubuntu`) e o caminho local da chave privada.
  - Um número de telefone real no exemplo de teste.
- **Impacto:** qualquer pessoa envia WhatsApp pelo número comercial da Sal Vita. Isso significa phishing em nome da marca contra a sua própria base de clientes, spam em volume e, na prática, **banimento do número pelo WhatsApp** — o que derruba de uma vez a recuperação de carrinho, a confirmação de pedido e o aviso de rastreio.
- **Exposto desde:** pelo menos 08/07/2026 (commit `767565a`; pode ser anterior — o clone foi raso).
- **Correção, nesta ordem:**
  1. **Rotacionar a `WA_API_KEY` na VPS e no Vercel agora.** Enquanto a chave antiga valer, o resto não adianta.
  2. Fechar `evolution.salvitarn.com.br` para o mundo: restringir por IP de origem ou exigir um segundo fator no header. As funções da Vercel não têm IP fixo no plano atual, então o caminho realista é uma chave longa e rotacionada + rate limit no próprio wa-server.
  3. Remover o segredo do arquivo (trocar por `$WA_API_KEY`) e **reescrever o histórico** (`git filter-repo`) — apagar só no HEAD não resolve, o blob antigo continua acessível.
  4. Trocar a chave SSH da VPS, já que o caminho e o usuário estão publicados.
  5. Avaliar tornar o repositório privado. Ele contém a lógica completa de precificação, cupons e antifraude do checkout.

> Este é o único achado com prazo. Os outros podem entrar na fila; este não.

---

### N2. O cliente define o valor do frete e o servidor aceita

- **Onde:** `server/routers/shipping.ts:144,164,167` (`createOrder`).
- **Problema:** `shippingPrice` chega do navegador e a única checagem é de faixa:
  ```ts
  const shipping = input.shippingPrice ?? 0;
  if (input.shippingPrice !== undefined && (input.shippingPrice < 0 || input.shippingPrice > 200)) { ... }
  ```
  O valor **nunca é reconferido** contra a cotação real (`meCalculate`/`staticCalc`). O `total` gravado é `subtotal + shipping`, e é esse total que vai para o Mercado Pago. A validação antifraude do webhook compara o pagamento com esse mesmo total adulterado — então ela **confirma normalmente**.
- **Exploração:** um POST em `/api/trpc/shipping.createOrder` com `shippingPrice: 0` gera um pedido legítimo com frete zero. Não precisa de login (é `publicProcedure`), não dispara nenhum alerta, e o pedido chega ao admin indistinguível de um pedido normal.
- **Impacto:** perda de R$ 14 a R$ 68 por pedido (tabela `STATIC_REGIONS`), e mais nos multipacks. Some com o N4/N5/N6 e o frete vira prejuízo estrutural.
- **Correção:** recotar no servidor dentro do `createOrder` e usar **o valor do servidor**, ignorando o do cliente:
  ```ts
  const quote = await meCalculate(input.postalCode, input.quantity)
             ?? staticCalc(input.state.toUpperCase(), input.quantity);
  const chosen = quote.find(o => String(o.serviceId) === String(input.shippingServiceId));
  if (!chosen) throw new TRPCError({ code:'BAD_REQUEST', message:'Serviço de frete inválido.' });
  const shipping = chosen.price;   // nunca input.shippingPrice
  ```
  Manter `input.shippingPrice` apenas como conferência: se divergir mais que alguns centavos, logar e seguir com o valor do servidor.

---

### N3. Vazão do cron: 1× por dia, 3 carrinhos por vez — e sem tolerância a falha

Três problemas que se multiplicam entre si.

**(a) Frequência.** `vercel.json:10` agenda `/api/cron/abandoned-cart` em `0 15 * * *` — **uma vez por dia**. Na sessão de 25/05 esse cron rodava a cada 5 minutos. A auditoria de julho pediu `0 11-23 * * *` (de hora em hora); foi implantado como diário.

**(b) Lotes.** Cada execução processa, no máximo:

| Rotina | Limite | Linha |
|---|---|---|
| Carrinhos abandonados | `LIMIT 3` | `api/index.ts:1164` |
| `reconcileAwaitingOrders` | `LIMIT 5` | `api/index.ts:1047` |
| `processReorderReminders` | `LIMIT 2` | `api/index.ts:1117` |

Os comentários justificam os limites com o "Hobby 10s budget", mas `vercel.json:6` define `maxDuration: 60`. **O orçamento real é 6× maior do que o que os limites assumem.**

Combinando (a) e (b): o teto do sistema é **3 mensagens de carrinho abandonado por dia** e **5 reconciliações por dia**. A automação agenda o primeiro toque para 30 min após o abandono — ele sai até ~24 h depois, quando já não recupera nada. E um pedido pago cujo webhook falhou pode ficar `awaiting` por mais de um dia, sem etiqueta e sem confirmação para o cliente.

**(c) Uma falha zera o dia.** Confirmado em produção:

```
2026-08-07T10:00:11Z  [cron] abandoned-cart error: NeonDbError: Server error (HTTP status 500):
"Failed to acquire permit to connect to the database. Too many database connection attempts are currently ongoing."
```

O erro estourou no primeiro `SELECT` do handler (`api/index.ts:1162`), antes de `processUnpaidFollowups`, `reconcileAwaitingOrders` e `processReorderReminders`. Todos ficaram sem rodar. Como só há uma execução por dia e **não existe retry**, o dia 07/08 passou sem nenhuma recuperação de carrinho e nenhuma reconciliação de pagamento.

- **Correção:**
  1. Subir a frequência. Se o plano Hobby limita a 2 crons diários, fazer o `email-daily` chamar internamente a rotina do abandoned-cart, ou acionar por serviço externo (`cron-job.org`) com o `CRON_SECRET` — o endpoint já aceita `POST` e `x-cron-secret`.
  2. Subir os lotes para ~15–20 agora que se sabe que o teto é 60 s, e atualizar os comentários que citam 10 s.
  3. Isolar cada rotina em seu próprio `try/catch`, para que a falha de uma não derrube as outras.
  4. Envolver as chamadas ao Neon em retry com backoff — o erro observado é de contenção e é transitório.

---

## 🟠 ALTOS

### N4. Peso de envio subdeclarado nos multipacks *(novo)*

`server/routers/shipping.ts:76` (cotação) e `:593` (etiqueta) usam a mesma fórmula `max(1.2, qty * 1.05)`. Confrontando com o peso real do catálogo (`SalVitaLanding.tsx:394-396`):

| Produto | `qty` | Peso calculado | Peso real (`weightKg`) | Diferença |
|---|---|---|---|---|
| 1kg | 1 | 1,20 kg | 1,2 kg | ok |
| Trio 3kg | 3 | 3,15 kg | 3,6 kg | **−0,45 kg** |
| Caixa 10kg | 10 | 10,50 kg | 12,0 kg | **−1,50 kg** |

Como a mesma fórmula alimenta a cotação e a etiqueta, o erro é consistente: cobra-se a menos do cliente **e** compra-se a etiqueta a menos. A diferença aparece na pesagem dos Correios — cobrança complementar ou recusa na postagem.

**Correção:** derivar o peso do catálogo do servidor, não de `qty * 1.05`. Depende do A3 (persistir o produto no pedido).

### N5. Dimensões de embalagem erradas para o trio *(novo)*

`shipping.ts:15` — `getPkg(qty) { return qty >= 10 ? PKG_10KG : PKG_1KG; }`. O trio (`qty = 3`) recebe as dimensões de **um** pacote de 1 kg (7×15×24 cm). Três pacotes não cabem nesse volume. O peso cúbico vai errado para os Correios, que podem reclassificar e cobrar a diferença. Precisa de um `PKG_3KG` próprio.

### N6. A tabela estática não escala o trio *(novo)*

`shipping.ts:64` — `const f = qty >= 10 ? 2.2 : qty >= 5 ? 1.4 : 1;`. Com `qty = 3`, o fator é **1**: no caminho de fallback (quando a API do Melhor Envio não responde), **o trio é cotado com o mesmo frete de uma unidade de 1 kg**. Faltou a faixa do trio. Sugestão: `qty >= 10 ? 2.2 : qty >= 5 ? 1.4 : qty >= 3 ? 1.25 : 1`, calibrando com a cotação real.

### N7. A credencial de acesso ao pedido viaja na URL *(novo)*

`shipping.ts:461-463` — as `back_urls` do Mercado Pago são montadas assim:

```
https://premium.salvitarn.com.br/meu-pedido?pedido=123&tel=7841&status=pago
```

`tel` são os 4 últimos dígitos do telefone — que é exatamente o segredo que o `trackOrder` exige para liberar os dados do pedido (A1). Ou seja, **a credencial de acesso está no query string**: ela passa pelo redirect do Mercado Pago, fica no histórico do navegador, vai no `Referer` para terceiros e entra em qualquer log de proxy no caminho. Isso transforma o A1 de "enumerável com esforço" em "vazado por padrão em todo pedido pago".

**Correção:** resolver junto com o A1 — trocar por um token opaco por pedido (`track_token`), que pode ir na URL sem esse problema.

### A1. IDOR no `trackOrder` — enumeração de dados de clientes *(HERDADO — em aberto)*

`shipping.ts:361-391`. Continua idêntico: posse verificada apenas por `phone.endsWith(inputPhone.slice(-4))`, com IDs sequenciais. 10.000 combinações por pedido devolvem nome, cidade, estado, valor, status e código de rastreio. Agravado pelo N7.

### A2. `createPayment` / `createPixPayment` / `pixStatus` sem verificação de posse *(HERDADO — em aberto)*

- `createPayment` (`shipping.ts:426`): `phone` continua `.optional()` — e a landing **não envia** (`SalVitaLanding.tsx:481` manda só `orderId`). Na prática a verificação nunca roda.
- `createPixPayment` (`shipping.ts:491`): nenhuma verificação.
- `pixStatus` (`shipping.ts:545`): nenhuma verificação.

Qualquer um com um `orderId` gera cobrança ou consulta o status de pedido alheio.

### A3. Produto e preço unitário não são persistidos *(HERDADO — em aberto)*

`createOrder` (`shipping.ts:200-225`) continua sem gravar `product` e `unitPrice`; valem os defaults do schema ("Sal Marinho Integral 1kg" / 29.90). Consequências ainda ativas:
- `createPayment:448` — título genérico no Mercado Pago.
- `generateLabel:629-633` — `name: 'Sal Marinho Integral 1kg'`, `unitary_value: 29.90` fixos. Uma caixa declara 10 × 29,90 = R$ 299,00 numa venda de R$ 149,90.

É também o pré-requisito do N4 (peso correto por produto).

---

## 🟡 MÉDIOS

### N8. A loja se apresenta como sistema interno *(novo)*

`client/index.html:14-15` — o mesmo `index.html` serve o CRM e a loja:

```html
<title>Sal Vita — Lembretes</title>
<meta name="description" content="Sistema interno de gestão de vendas e lembretes da Sal Vita." />
```

**Verificado em produção:** `premium.salvitarn.com.br` responde com esse título hoje. Numa página de venda que recebe tráfego pago, isso significa: o Google indexa a loja como "sistema interno de gestão", e todo link compartilhado no WhatsApp ou no Facebook — inclusive os das próprias mensagens de recuperação de carrinho — mostra essa descrição na prévia. Não há `og:title`, `og:image` nem dados estruturados de produto.

**Correção:** definir título e metas por host no `index.html` (ou servir um `index.html` próprio para a loja), com `og:title`, `og:description`, `og:image` e JSON-LD de `Product`.

### N9. O cron de carrinho abandonado é fail-open *(novo)*

`api/index.ts:1151-1156`:
```ts
if (secret && provided !== secret) { res.status(401)... }   // abandoned-cart
```
Se `CRON_SECRET` não estiver definido, **o endpoint fica aberto**. O `email-daily` (`:1254`) faz o certo: `if (!secret || provided !== secret)`. Hoje a variável está configurada, mas basta ela cair num redeploy para expor um endpoint que dispara WhatsApp e e-mail. Padronizar pelo comportamento do `email-daily`.

### N10. Fallback silencioso para o banco do CRM *(novo)*

`server/db/ordersDb.ts:5` — `process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL!`. Se a variável de pedidos sumir, a loja passa a **escrever pedidos no banco do CRM** sem erro nenhum, e o problema só aparece quando alguém notar que o admin está vazio. Falhar explicitamente é melhor: se `ORDERS_DATABASE_URL` não existir em produção, derrubar na inicialização.

### M1. Corrida no `usedCount` do cupom *(HERDADO — em aberto)*

`shipping.ts:178-197` verifica `usedCount < maxUses` na criação, mas o incremento só ocorre na confirmação. N pedidos pendentes com o mesmo cupom passam todos e todos confirmam, estourando o `maxUses`. Correção continua sendo o incremento atômico condicional.

### M2. PIX cria uma cobrança nova a cada clique *(HERDADO — em aberto)*

`shipping.ts:522` — `'X-Idempotency-Key': \`pix-${order.id}-${Date.now()}\``. O `Date.now()` anula a idempotência: cada clique gera um QR novo. O cliente pode pagar um QR antigo, ou pagar PIX **e** cartão — a segunda confirmação é ignorada (`paymentStatus` já é `confirmed`) e não há estorno automático.

---

## 🔵 BAIXOS

### N11. Estorno duplicado devolve o cupom duas vezes *(novo)*

`api/index.ts:384-388` — `wasConfirmed` é lido do `order` carregado **antes** do update, e o update é incondicional. Duas notificações de `refunded`/`charged_back` para o mesmo pagamento (o Mercado Pago reenvia) fazem `bumpCouponUsage(code, -1)` rodar duas vezes. Mesmo padrão de update condicional do C3 resolve.

### N12. `api/bundle.js` versionado *(novo)*

`api/bundle.js` e `sallog/api/bundle.js` estão no controle de versão, mas são gerados pelo `buildCommand` do `vercel.json`. São dezenas de milhares de linhas de diff a cada build, que poluem o histórico e escondem mudanças reais na revisão. Devem ir para o `.gitignore`.

---

## O que a auditoria de julho pediu e **foi** corrigido

Verificado no código atual:

| Item | Situação |
|---|---|
| **C2** — reconcile confirmava sem validar valor | ✅ Corrigido (`api/index.ts:1075-1081`) |
| **C3** — corrida webhook × reconcile | ✅ Corrigido nos dois caminhos com `UPDATE ... WHERE paymentStatus='awaiting' RETURNING` (`:358-370`, `:1086-1096`) |
| **C1** — cron não agendado | ⚠️ Parcial: agendado, mas 1×/dia — virou o N3 |
| Janela do reconcile | ✅ Ampliada de 3 para 30 dias (`:1042`) |
| Etiqueta para pedido não pago | ✅ Bloqueado (`shipping.ts:577-579`) |
| Idempotência do webhook | ✅ Pedido já confirmado retorna cedo (`:344`) |
| Estorno devolve uso do cupom | ✅ Implementado (`:388`) — com a ressalva do N11 |

**Pendência de 25/05 resolvida:** o endpoint da Evolution API não era um bug. A VPS roda um wa-server próprio (Baileys) com rota `/send` recebendo `{phone, message}`, exatamente o que o código chama. O `vps-wa-patch.sh` ainda adicionou resolução de JID para o nono dígito. Item encerrado — mas foi esse arquivo que trouxe o N1.

---

## Ordem de execução sugerida

| Fase | Itens | Por quê primeiro |
|---|---|---|
| **0 — hoje** | **N1** | Segredo ativo em repo público. Rotacionar a chave antes de qualquer outra coisa. |
| **1** | N2, N3 | Dinheiro saindo agora: frete zerável e recuperação de carrinho praticamente parada. Backend isolado, risco baixo. |
| **2** | A3 → N4, N5, N6 | Encadeados: persistir o produto destrava peso e dimensões corretos. Pedidos antigos seguem com os defaults. |
| **3** | A1 + N7 + A2 | Muda o contrato frontend↔backend. Backend, landing, `TrackOrder` e links dos templates **no mesmo commit**. |
| **4** | M1, M2, N9, N10, N11 | Correções pontuais, risco baixo. |
| **5** | N8, N12 | N8 exige um build de teste (metas por host); N12 é limpeza. |

## Verificação após cada fase

1. `npx tsc --noEmit` e `node node_modules/vite/bin/vite.js build client -c vite.config.ts`.
2. Fluxo real em `premium.salvitarn.com.br`: criar pedido → gerar PIX → conferir em `/sal-vita-admin`.
3. Painel Vercel → Runtime Logs, filtrando `[cron]` e `[mp-webhook]`.
4. Para o N2, especificamente: repetir o POST com `shippingPrice: 0` e confirmar que o total gravado usa a cotação do servidor.

---

> Gerado em 09/08/2026. Achados N1–N12 verificados no código do commit `939418f` e, quando indicado, contra o comportamento de produção (painel Vercel e resposta HTTP do domínio). Os itens marcados *HERDADO* foram reconferidos linha a linha no código atual — não foram copiados do relatório anterior.
