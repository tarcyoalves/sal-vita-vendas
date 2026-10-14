# Auditoria B - Funcional da loja Premium (14/10/2026)

Escopo lido: `client/src/pages/SalVitaLanding.tsx` (inteiro, 1962 linhas), `components/SalVitaChat.tsx`, `App.tsx` (rotas), `index.html` (Pixel), e no servidor `routers/shipping.ts` (calculate, createOrder, createPayment, createPixPayment, pixStatus), `routers/recovery.ts` (trackCart, validateCoupon, chat, prompts), `api/index.ts` (limiters), `lib/shippingFilter.ts`. Somente leitura; nada foi editado nem executado no navegador (análise de código). Tudo abaixo foi confirmado lendo o código; o que depende de comportamento externo (ViaCEP, Mercado Pago, WebViews) está marcado "provável".

Regressão dos itens corrigidos em 07/10: NÃO regrediram. O poll do PIX segue `POST` em `shipping.pixStatus` (mutation, servidor linha 852); o token não vai ao Pixel (`index.html` desliga o Pixel em `/meu-pedido`); cupom de link sobrevive ao `openBuy` (linha 462); a chave de idempotência do PIX é estável (servidor 821); não há `alert()`; as alegações removidas não voltaram (exceto a foto, ver F-17).

## Contagem
P0: 0 | P1: 6 | P2: 13 | P3: 10 (total 29)

---

## P1 (corrigir antes de ligar anúncios)

### F-01 [P1] `trackCart` dispara sozinho na abertura da página para quem já tem dados salvos, sem nenhuma ação e antes de qualquer consentimento
- `SalVitaLanding.tsx:355-359` restaura nome/telefone/e-mail do localStorage na montagem; `:403-414` tem um efeito que, com nome >= 3 letras e telefone >= 11 dígitos, faz `POST recovery.trackCart`.
- Servidor `recovery.ts:265-345`: grava `abandoned_carts` e agenda a cadência `abandoned_t1` (30 min) e `abandoned_t3` (24 h, com cupom).
- Cenário: cliente que comprou ou começou um pedido há 20 dias volta pelo anúncio, só olha a página e sai. Sem clicar em nada, o telefone e o nome dele são enviados e ele recebe WhatsApp de "carrinho abandonado" 30 min depois. Gera reclamação/denúncia de spam no número da loja e LGPD (envio sem ação do titular; a Política `/privacidade` item 3 fala de "carrinhos não concluídos", mas aqui não houve carrinho).
- Correção: disparar `trackCart` só depois de `showCheckout` (passo 2 aberto) ou de `selProd` definido, e só por edição do campo (não por restauração). Guardar `cartTrackRef.current = true` na restauração.

### F-02 [P1] Erro de validação do servidor chega ao cliente como JSON bruto de Zod
- `SalVitaLanding.tsx:671-675` mostra `Não foi possível registrar o pedido: ${apiMsg}`. O tRPC (`server/trpc.ts:107`, sem `errorFormatter`) entrega em `message` o array de issues do Zod serializado (`[ { "code": "invalid_string", "validation": "email" ...`).
- Cenários reais: `joao@gmail` (o `type=email` do navegador aceita, o `z.string().email()` do servidor `shipping.ts:311` recusa); nome de 1 letra (`:309` min 2); número do endereço > 20 caracteres; cidade/bairro de 1 caractere; telefone com 21+ caracteres colados.
- Resultado: o cliente vê um bloco de JSON em inglês no rodapé e desiste.
- Correção: `errorFormatter` que troque `ZodError` por mensagem em português por campo, e no cliente validar e-mail com a mesma regra, nome >= 2 letras visíveis (trim), antes de enviar. Não exibir `apiMsg` se começar com `[` ou `{`.

### F-03 [P1] Limitadores devolvem `{error: "texto"}` e o cliente mostra mensagem errada ("confira os dados")
- `api/index.ts:1027-1043` (storeLimiter, orderLimiter, paymentLimiter, chatLimiter) respondem `429 {"error":"Muitas ..."}`. O cliente lê `data?.error?.json?.message ?? data?.error?.message` (`SalVitaLanding.tsx:672, 727, 808`); com `error` sendo string, o resultado é `undefined`.
- Cenário (CGNAT móvel, tráfego de anúncio, 30 pedidos/15 min por IP): 429 em `createOrder` aparece como "Erro ao registrar o pedido. Confira os dados e tente novamente." O cliente revisa os dados e tenta de novo, sem saber que precisa esperar. No `calculate` (30/15 min, compartilhado com `trackOrder`) o erro é engolido (`:571`) e o cliente cai silenciosamente na tabela "Estimativa".
- Correção: helper único `apiError(res, data)` que trate `res.status===429`, string em `data.error`, e envelope tRPC; mensagem "Muitas tentativas. Aguarde alguns minutos ou chame no WhatsApp".

### F-04 [P1] Enter no campo de cupom envia o pedido sem aplicar o cupom; cupom digitado e não "Aplicado" é descartado em silêncio
- `:1791-1801` o campo de cupom está dentro do `<form id="checkout-form">`; o botão "Aplicar" é `type="button"`. Enter no campo submete o formulário (`handleCheckout`).
- `:643` só envia `couponCode` se `couponState?.valid`. Quem digita o código e clica direto em "Ir para pagamento" (ou aperta Enter) cria o pedido sem desconto, sem aviso.
- Pior: cupom de link (`?cupom=`) validado de forma assíncrona (`:371-376`); o botão "Ir para pagamento" não fica desabilitado enquanto `couponLoading` (`:1716`), então o clique rápido cria o pedido sem o desconto prometido pelo link de recuperação.
- Correção: `onKeyDown` Enter no cupom chama `validateCoupon` e `preventDefault`; em `handleCheckout`, se houver `couponCode` preenchido e `couponState` nulo, validar antes (ou bloquear com "Clique em Aplicar para usar o cupom"); desabilitar o submit durante `couponLoading`.

### F-05 [P1] Corrida no cálculo de CEP: resposta atrasada sobrescreve o CEP corrigido
- `lookupCep` (`:522-581`) não cancela nem identifica a requisição; o campo e o botão "Calcular" não bloqueiam o Enter durante `loadingCep` (`:1882` não checa `loadingCep`).
- Cenário (rede lenta/ViaCEP lento): cliente digita CEP errado, vê "Calculando…", percebe o erro, corrige o CEP. A resposta do CEP antigo chega depois e executa `setCepData`, `setShipping`, `setSelShip` e `setCheckoutForm({postalCode: antigo, city, state...})` (`:529-530, 578`). A tela mostra no campo o CEP novo, mas cidade/frete/postalCode são do antigo; `goStep2` segue com o CEP antigo. O servidor re-cota por `postalCode` (antigo) e o pedido sai para o endereço/região errados com frete de outra região (sem erro visível).
- Mesmo problema ao fechar e reabrir o modal (`openBuy` não invalida o lookup) ou ao trocar o pacote.
- Correção: contador de requisição (`lookupReq.current`) comparado após cada `await`, `AbortController`, e ignorar resposta se `c !== cep` atual; desabilitar o Enter enquanto `loadingCep`.

### F-06 [P1] Com `FB_CAPI_TOKEN` ausente, a compra só chega ao Meta se o cliente ficar na tela do PIX; PIX pago no app do banco e aba fechada = compra invisível
- `ESTADO-DO-PROJETO.md:284` confirma token ausente em produção; `orderConfirmation.ts:142` só registra um aviso.
- O único Purchase do navegador está no poll (`SalVitaLanding.tsx:761-771`), que roda só com o diálogo aberto e aba ativa; quem copia o código, vai para o app do banco e fecha ou deixa a aba suspensa não gera Purchase (no cartão, depende de voltar a `/meu-pedido`). Otimização de campanha por "compra" e ROAS ficam subestimados, e a Meta aprende com pouquíssimos eventos.
- Correção: configurar o token (item do dono), e no cliente disparar uma checagem imediata em `visibilitychange`/`focus` (ver F-15). Na verificação do dono: conferir o pareamento Servidor/Navegador no Gerenciador de Eventos.

---

## P2

### F-07 [P2] Campo "Número" com teclado numérico impede "S/N" e "12A"
- `:1761` `inputMode="numeric"` num campo obrigatório de texto livre (servidor aceita até 20 caracteres, `shipping.ts:315`). Em celulares o teclado numérico não tem letras/barra; clientes de zona rural/interior do RN (sem número, "S/N", "Km 5", "12A") não conseguem preencher.
- Correção: `inputMode="text"` com `enterKeyHint`, e dica "S/N se não houver número".

### F-08 [P2] ViaCEP direto do navegador, sem timeout e sem plano B: se cair, ninguém compra
- `:527` `fetch('https://viacep.com.br/...')` sem timeout, sem checar `r.ok`. Falha cai em `catch` -> "Erro de conexão. Tente novamente." (`:579`); o servidor já sabe cotar sem o ViaCEP do cliente, mas o cliente não chega lá.
- Em rede lenta o botão fica em "Calculando…" indefinidamente (nenhum fetch do arquivo tem timeout: `:395, 408, 544, 598, 633, 711, 750, 791`).
- Correção: `AbortSignal.timeout(8000)` em todos os fetch; usar ViaCEP e, em falha, BrasilAPI (`/api/cep/v2`) ou rota própria do servidor; permitir continuar preenchendo o endereço à mão com cotação feita só pelo CEP.

### F-09 [P2] Dados pessoais salvos no aparelho nunca expiram para quem volta, contrariando a Política
- `:128-146, 363-366`: o efeito de persistência roda também logo após a restauração (a restauração faz `setCheckoutForm`), regravando `savedAt: Date.now()` a cada visita. A "expiração em 30 dias" (e `Privacidade.tsx:110` "por até 30 dias") vira janela deslizante infinita. Além disso, tudo (nome, telefone, e-mail, endereço) é gravado a cada tecla, sem o cliente pedir.
- Correção: gravar `savedAt` só quando o usuário editar de fato (ou preservar o `savedAt` original na restauração); oferecer "Limpar meus dados deste aparelho" (ou checkbox "lembrar dados").

### F-10 [P2] Copiar o código PIX falha em silêncio em WebViews (Instagram/Facebook, tráfego de anúncio) e o código não pode ser copiado à mão
- `copyPixCode` (`:816-823`): `catch {}` vazio; nada muda na tela se `navigator.clipboard` for negado/indisponível (HTTP, WebView, iOS antigo). A caixa do código tem `maxHeight:56; overflow:hidden` (`:1670`), cortando o texto: o cliente não consegue copiar à mão.
- Correção: fallback `document.execCommand('copy')` com textarea selecionável; no erro mostrar "Não foi possível copiar. Toque e segure no código abaixo" e exibir o código inteiro com `user-select: all` (ou `<textarea readonly>` com altura maior).

### F-11 [P2] Fechar o diálogo (Esc, toque no fundo, arrastar texto) no passo 3 mata o QR e o poll do PIX sem confirmação
- `Sheet` `:209` usa `onClick` no fundo; `:507` Esc chama `closeBuy` -> `resetPix` (`:421-425`). Clique que começa dentro do input e termina fora (seleção de texto) também gera `click` no fundo. Quem tinha o PIX aberto perde a tela e a verificação automática; precisa ir ao banner "Continuar pagamento" (que some quando o modal está aberto, e depende do localStorage).
- Correção: no passo 3 com `pixData` ativo, exigir confirmação ("Seu PIX continua válido, quer sair?") e ignorar clique no fundo; usar `onMouseDown` para checar a origem do clique.

### F-12 [P2] Total e cupom: o servidor pode não aplicar o cupom e o cliente só percebe pelo total
- `shipping.ts:421-440`: se o cupom ficou inválido entre a validação e a criação (expirou, esgotou, mínimo), o pedido é criado sem desconto, sem retorno (`couponApplied: null`). O cliente (`:676-692`) só trata mudança de frete, não de cupom: o resumo do passo 2 mostrava "Desconto", o passo 3 mostra um total maior sem aviso.
- Também: `validateCoupon` não cancela respostas antigas; se o cliente edita o código enquanto valida, `couponState` de um código fica valendo para outro (`:594-610, 1792`).
- Correção: comparar `couponApplied` retornado com o enviado e mostrar aviso ("O cupom X não pôde ser aplicado"); amarrar `couponState` ao código validado (`couponState.code`).

### F-13 [P2] "Frete atualizado" só aparece no passo de pagamento; cotação "Estimativa" diverge da do servidor
- `calcShipping` do cliente (`:29-36`, fator 2.4 para >=10 kg) difere de `staticCalc` do servidor (`shipping.ts:125`, fatores 2.2/1.25). Se o cálculo da API do cliente falhar (inclusive por 429, F-03), o cliente vê a estimativa, e o valor real é aplicado só depois de criar o pedido (aviso em `:685`).
- Pior: `calculate` não recebe a UF do cliente, e sem ViaCEP no servidor cai em `'RN'` (`shipping.ts:253`), cotando barato para destino distante; o `createOrder` corrige para cima depois. A promessa de "frete calculado pelo seu CEP antes de você pagar" (FAQ `:51`) falha nesse caminho.
- Correção: enviar `uf` a `calculate`; unificar a tabela (um módulo compartilhado); no passo 1, quando for "Estimativa", avisar "valor final confirmado no próximo passo".

### F-14 [P2] Texto de transportadora errado: o preço mais barato pode ser Jadlog/Azul/J&T, mas a loja diz "Correios via Melhor Envio"
- `ALLOWED_CARRIERS` (`shippingFilter.ts:7-12`) inclui Jadlog, Azul Cargo, J&T. FAQ `:51` ("Enviamos por Correios via Melhor Envio") e rodapé do passo 1 `:1939` ("Frete calculado via Melhor Envio") contradizem; o prompt do chat (`recovery.ts:101`) já diz as 4 empresas. Informação inconsistente entre página e chat.
- Correção: texto único ("Correios, Jadlog, Azul Cargo ou J&T, conforme o CEP; mostramos o valor e o prazo de cada opção"). Mostrar a transportadora no item (hoje só em `description`).

### F-15 [P2] Poll do PIX: sem checagem ao voltar do app do banco, sem estado "recusado/expirado" e janela de 30 min só no cliente
- `:738-782`: após 2 min o intervalo é 15 s; no celular o timer pode ficar suspenso e, ao voltar do banco, o cliente espera até 15 s sem feedback. Não escuta `visibilitychange`. O servidor devolve `status` (`shipping.ts:870`) mas o cliente ignora `cancelled/rejected/expired` e continua "Aguardando confirmação…" por 30 min.
- Texto/botão incoerentes: após `pixExpired` diz "gere um novo PIX", mas o botão "Gerar novo PIX" (`:1608`) só reseta e exige um segundo clique em "Pagar com PIX" (e o servidor reaproveita o mesmo PIX vivo, `shipping.ts:779-799`, que pode continuar pagável por até 24 h).
- Correção: tick imediato em `visibilitychange`/`online`; tratar `status` terminal; "Gerar novo PIX" chama `handlePixPay` direto; tirar a frase "PIX expirou" (o código MP segue válido).

### F-16 [P2] Eventos do Pixel com IDs de catálogo inconsistentes e eventos duplicados
- `ViewContent/AddToCart/InitiateCheckout` usam `salvita-1kg|3kg|10kg` (`:155`) e `Purchase` usa `salvita-001` (`:769, 804`), então campanhas de catálogo/remarketing não casam compra com produto.
- `AddToCart` dispara a cada `openBuy` (`:452`), `InitiateCheckout` a cada clique em "Comprar Agora" (`:590`), inclusive ao ir e voltar; `AddPaymentInfo` dispara na criação do pedido (`:693`), antes de o cliente escolher o meio de pagamento. Inflam o funil.
- Correção: um único ID de conteúdo coerente nos 5 eventos (e no CAPI); `AddToCart` uma vez por pacote por sessão; `InitiateCheckout` uma vez; `AddPaymentInfo` ao gerar o PIX ou o link do cartão.

### F-17 [P2] Dado/alegação ainda na tela
- `:1236` "Dezenas / Minerais traço do mar" em destaque numérico, enquanto o prompt diz "nunca citar número de minerais" (ESTADO §4 aprovou "dezenas" só como texto conservador do verso). Mostrar como "estatística" com a palavra "Dezenas" parece contagem. Rever com o dono.
- A foto do produto (`IMG.produto`, hero e og:image) ainda mostra o selo "+80 MINERAIS" (já registrado em ESTADO:302 como pendência do dono). Não é corrigível em código; só trocar a imagem.
- "mais de 95% do sal marinho brasileiro" (`:50, 1230`) sem fonte citada.

### F-18 [P2] Dialogo de checkout sem escopo de pacote: não dá para trocar pacote/quantidade dentro do modal; botões fixos abrem sempre 1 kg
- Barra fixa mobile (`:1581`), "Comprar" do menu (`:1070`) e CTA do hero abrem `PRODUCTS[0]`; quem quer Trio/Caixa tem de fechar e achar o cartão. Sem seletor de quantidade (2 trios, por exemplo), o cliente sai para o WhatsApp. O menu móvel "Comprar Agora" (`:1089`) só rola até `#preco` (comportamento diferente).
- Correção: seletor de pacote no passo 1 (3 opções) e padrão = pacote mais visto; ou ao menos o mesmo comportamento nos CTAs.

### F-19 [P2] Resumo do passo 3 mostra o valor do produto errado quando há cupom
- `:1636` `brl(orderDone.total - selShip.price)` rotula o resultado como pacote `packLabel(selProd)` (preço cheio), mas é o valor com desconto; ao retomar pedido (`resumePending`, `:481-491`) não há linha de desconto. Cliente vê "CAIXA... R$ 134,91" em vez de R$ 149,90 menos o cupom.
- Correção: mostrar `orderDone.total` com linhas "Produto", "Desconto" (do retorno do servidor, `couponDiscount`) e "Frete".

---

## P3

### F-20 [P3] Validação de CPF/telefone/e-mail só no cliente e fraca no servidor
- Servidor (`shipping.ts:310-312`): telefone `min(10)`, CPF `min(11).max(14).optional()` sem dígito verificador; o CPF vai ao Mercado Pago/Melhor Envio. Cliente valida CPF (`:88-99`) mas aceita DDD inexistente ("(00)", "(10)"), telefone com 10 dígitos que começam com 9 (celular sem 9 inicial). Um CPF inválido por chamada direta gera pedido que falha só no pagamento.
- Correção: `refine` do CPF e DDD (11-99) no Zod do servidor; avisar telefone de 10 dígitos que parece celular.

### F-21 [P3] Chat: erro genérico, resposta cortada e estado morto
- `SalVitaChat.tsx:57-59` mensagem fixa para qualquer falha (inclui 429 do limitador, `chatLimiter` 15/min); `max_tokens: 300` (`recovery.ts:1319`) corta respostas no meio sem aviso; `unread` nunca vira `true` (linhas 17, 164): ponto vermelho morto; sem `aria-modal` e sem captura de foco no `role="dialog"`; Enter em IME/teclado Android com composição pode enviar antes da hora; número do WhatsApp duplicado na linha 159 (e em Atacado, TrackOrder, Termos, Privacidade, Landing).
- Correção: extrair `WA_LINK` para `shared/`; checar `finish_reason==='length'` e acrescentar "..." ou subir `max_tokens`; mensagem diferente para 429.

### F-22 [P3] WhatsApp sem contexto
- Nenhum `wa.me?text=` leva número do pedido/nome nos links do passo 3 e dos rodapés (`:1448, 1831, 1549, 1556, 1560`), exceto o de atacado. Atendente não sabe de qual pedido se trata; Pixel não registra `Contact`/`Lead` no clique.
- Correção: no passo 3 e em "Acompanhar", `?text=Olá! Sobre o pedido #id`.

### F-23 [P3] Prazo "?" exibido ao cliente
- `shipping.ts:171` devolve `days: '?'` quando o Melhor Envio não dá `delivery_range`; o cliente vê "Econômico · ?" (`:1929`).
- Correção: omitir o prazo (`days: ''`) nesse caso.

### F-24 [P3] Rotas com barra final ou maiúscula caem na landing
- `App.tsx:150-168` compara `path === '/termos'` etc. exato; `/termos/` e `/Privacidade` renderizam a landing (soft 404), apesar do script do `index.html:104-107` aceitar barra final.
- Correção: normalizar `path.replace(/\/+$/,'').toLowerCase()`; 404 real para outros caminhos.

### F-25 [P3] Seleção de frete por `service` (nome), não por `serviceId`
- `:1909, 1912` `key`/`aria-checked` usam `opt.service`. Se duas empresas ofertarem o mesmo nome, as duas aparecem marcadas e a seleção vira a primeira. Hoje o filtro quase não gera colisão; é fragilidade.
- Correção: comparar `serviceId`.

### F-26 [P3] Cadência de carrinho com nome parcial e etapa mal classificada
- `:403-414` dispara com `customerName.length >= 3`; se o telefone foi digitado primeiro, o nome gravado é "Joa" e permanece até o próximo `trackCart`, e as mensagens de WhatsApp saem como "Olá Joa". O passo 1 do funil é gravado quando o cliente já passou do CEP (cliente novo nunca grava `stepReached:2` pelo `lookupCep`, `:532`, que exige nome/telefone), então ganha a cadência leve e não a completa.
- Correção: disparar no `onBlur` de nome/telefone e enviar `stepReached` real (2 no passo 2).

### F-27 [P3] Controles e A11y menores
- Gaveta do menu móvel sem captura de foco e sem Esc (`:1083`); `aria-hidden` com links focáveis dentro.
- Campos do passo 2 sem `maxLength` (nome 100, número 20, etc.) e sem `autoCapitalize`, ou `autoComplete="off"` no CPF/Número (`:1742, 1761`); erro de servidor no rodapé sem mover o foco.
- Banner de pedido pendente (`:1046`) não é `role="status"`; fica atrás do menu fixo (`padding:84px`).
- Na tecla Esc no passo 2 o diálogo volta ao passo 1 (`:507`), o que é consistente, mas a seta "alterar" do CEP faz o mesmo sem aviso de que o frete será refeito.

### F-28 [P3] Preços duplicados cliente x servidor
- `PRODUCTS` (`:113-117`) e `CATALOG` (`shipping.ts:47-49`) mantêm preços em dois lugares; se um mudar, o resumo do passo 2 mostra um valor e o passo 3 outro (só o frete tem aviso). Trava de teste que compare os dois evitaria.

### F-29 [P3] Idempotência do PIX presa a uma chave por pedido
- `shipping.ts:821` `X-Idempotency-Key: pix-<id>` retorna a mesma resposta do Mercado Pago em 24 h; se o primeiro PIX for cancelado/recusado, um novo pedido de PIX para o mesmo pedido devolve o mesmo pagamento morto, e o cliente vê um QR que não paga. Hoje improvável (PIX vive 24 h e o banner só 2 h), mas basta o admin/MP cancelar. Correção: incluir tentativa/`updatedAt` na chave quando o pagamento anterior não está vivo.

---

## Fluxos verificados sem achado relevante
- Duplo clique em "Ir para pagamento", "Pagar com PIX" e "Cartão": protegidos por estado e pelo reaproveitamento/idempotência do servidor.
- Retorno de pedido pendente: o banner só aparece com `trackToken`; limpa ao pagar (`:398`) e ao receber "cancelado/já pago" (`pedidoEncerrado`).
- Frete mais barato primeiro e pré-selecionado: correto (`:576-578`), selos "Mais barato/Mais rápido" corretos; teclas de seta no radiogroup funcionam.
- Links `/meu-pedido`, `/atacado`, `/privacidade`, `/termos`: existem nas rotas e no `vercel.json` para os dois hosts.
- Valores no centavo: o servidor recalcula tudo (preço, frete, cupom); não há confiança no cliente.
