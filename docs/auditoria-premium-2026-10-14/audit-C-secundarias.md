# Auditoria C: páginas secundárias da loja Premium (somente leitura)
Repo: svv-premium-ui. Escopo: TrackOrder, Atacado, Privacidade, Termos, SalVitaAdmin (+ Recovery/B2B por amostragem), StoreFallback e bloco isPremium do App.tsx.
Não repete o que o registro de 07/10 já corrigiu. O navegador não foi aberto: mobile 375px e contraste foram avaliados pelo código; "a confirmar em tela" marca o que depende de ver renderizado.

Contagem: P0 = 1 | P1 = 10 | P2 = 17 | P3 = 10

## P0

**P0-1. Nome proibido "Sal Marinho Integral" em mensagens ao cliente, item do pedido e admin.**
- Onde: server/routers/shipping.ts:47 (name do produto 1kg); server/routers/recovery.ts:191, 563, 574; server/email/resend.ts:157; server/db/ordersMigrate.ts:75, 240, 264; server/db/schema.ts:173 (default); SalVitaAdmin.tsx:91 e 453 (fallback); client/index.html:29 e :37 (meta description / og dizem "Sal Integral de Mossoró").
- Problema: ESTADO §4 cita "Sal Marinho Integral" como um dos 6 produtos proibidos pela ANVISA em 07/08/2026, e a embalagem se chama "Sal Marinho Não Refinado". WhatsApp e e-mail de recuperação enviados a clientes reais, o nome do item no Mercado Pago/etiqueta e a coluna `product` de todo pedido novo usam esse nome. A auditoria de 07/10 limpou a landing, não esses pontos.
- Correção: trocar por "Sal Marinho Não Refinado Sal Vita 1kg" (e variantes Trio/Caixa) em shipping.ts:47-49, recovery.ts, resend.ts, templates seed (ordersMigrate.ts:240/264 + UPDATE nos templates já gravados no banco), default do schema (migração + SCHEMA_VERSION + schema:lock, checklist do AGENTS.md) e fallbacks do admin. index.html:29/37: "Sal Integral de Mossoró" -> "Sal marinho não refinado de Mossoró".

## P1

**P1-1. Rastreio mostra "Enviado: A caminho de você" quando só existe etiqueta.**
- TrackOrder.tsx:13-16 (`label_generated` -> índice 2) e :4-9. Etiqueta gerada não é postagem; o cliente lê "A caminho" dias antes da coleta (afirmação falsa, CDC art. 37).
- Correção: mapear label_generated para o passo "Pago" com desc "Pagamento recebido, preparando o envio" ou criar o passo "Preparando envio". "Enviado" só com status === 'shipped'.

**P1-2. Meta Pixel carrega sem consentimento e a política não explica como recusar.**
- client/index.html:117-129 (PageView incondicional na loja), TrackOrder.tsx:52-65 e 168-189 (ensurePixel). Privacidade.tsx:99-106, 113 e 134 sustentam o Pixel em "legítimo interesse"; não há banner nem opt-out. Para rastreio publicitário de terceiros o entendimento corrente é consentimento.
- Correção: banner discreto Aceitar/Recusar que só injeta fbevents após aceite (localStorage) e ajuste de Privacidade §4/§7/§5 (base = consentimento, como revogar). Parecer jurídico do dono é necessário; o código não valida isso.

**P1-3. Purchase do Pixel dispara a cada visita ao /meu-pedido.**
- TrackOrder.tsx:171-189: `purchaseFired` é useRef e zera a cada carregamento. Quem reabre o link após 48h gera Purchase duplicado fora da janela de dedupe por eventID. O pixel é iniciado numa página com campo de telefone: o Advanced Matching automático da Meta pode ler inputs (a confirmar nas configs do Pixel).
- Correção: disparar só se `mpStatus === 'pago'` e gravar `sv-purchase-<id>` em localStorage; `autoConfig:false` no init.

**P1-4. Rota /sal-vita-email-marketing do admin não existe no App.**
- SalVitaAdmin.tsx:957 e :974 gravam esse path via replaceState; App.tsx:145 só reconhece /sal-vita-admin, -recovery e -b2b. F5, favorito ou link em outra aba mostra a LANDING PÚBLICA no lugar do painel (App.tsx:170-172), sem erro.
- Correção: aceitar o path em App.tsx:145 (ou `path.startsWith('/sal-vita-')` restrito à lista) e ver P2-1.

**P1-5. Erro ao carregar pedidos aparece como "Nenhum pedido encontrado".**
- SalVitaAdmin.tsx:691 (`listOrders` sem `error`) e :897-902. Sessão expirada ou 500 vira tela vazia com a dica "ajuste a aba ou a pesquisa"; o dono pode achar que não vendeu. Mesma falta em Recovery (SalVitaRecovery.tsx:181, `retry: 0`, sem estado de erro).
- Correção: ler `isError`, bloco "Não foi possível carregar os pedidos" + botão "Tentar de novo"; vazio só quando `!isError`.

**P1-6. Disparos em massa de WhatsApp sem confirmação nem contagem.**
- SalVitaRecovery.tsx:249-262 ("IA Processar Todos", "Executar Job Agora") e :565-568. Um clique envia a clientes reais, sem dizer quantos. Em :329-354 "IA Enviar", "+ Cupom" e "Recuperado" também sem confirmação (só o opt-out tem), e `sendMut.isPending` desabilita TODAS as linhas.
- Correção: diálogo "Enviar para N carrinhos?" antes dos botões em massa; desabilitar só a linha em andamento (`mutation.variables?.id === row.id`).

**P1-7. Ações caras/irreversíveis do admin com proteção insuficiente.**
- Etiquetas em lote (SalVitaAdmin.tsx:923) cobram no Melhor Envio; `selectedIds` não é limpo ao trocar filtro/período (:866, :849), então é possível gerar etiqueta de pedido cancelado/não pago que ficou selecionado fora da vista.
- "Excluir Pedido" (:575) é `window.confirm` simples e vale para pedido pago; "Cancelar Pedido" (:568) não informa o que será estornado/cancelado antes.
- Editar endereço (EditModal :245-342) após etiqueta gerada não avisa que a etiqueta impressa fica com o endereço antigo.
- Correção: limpar seleção ao filtrar; filtrar no front `pago && !cancelado && !meLabelUrl` e mostrar "Gerar N etiquetas"; bloquear exclusão de pedido pago (só cancelar); aviso no modal quando `meLabelUrl` existe.

**P1-8. "Confirmar Pgto Manual" confirma sem perguntar e anuncia sucesso antes do resultado.**
- SalVitaAdmin.tsx:468: `toast.success('Pagamento confirmado!')` imediato e `updateMut` (:366) sem `onError`; se falhar o dono vê sucesso e o pedido segue "Aguard. Pgto". Um clique libera expedição e entra na receita.
- Correção: diálogo "Confirmar que recebeu R$ X de Fulano?", toast só no onSuccess, `onError: toast.error`.

**P1-9. Consentimento do atacado sem link da política; Termos/Privacidade ausentes nas secundárias.**
- Atacado.tsx:51 e 261-266: o aceite não aponta para /privacidade; TrackOrder e Atacado não têm link para Termos/Privacidade.
- Correção: no consentimento "Veja a <a href=/privacidade>Política de privacidade</a>" e rodapé comum (Privacidade, Termos, WhatsApp) nas secundárias.

**P1-10. Cabeçalho do admin não cabe em 375px.**
- SalVitaAdmin.tsx:987-1034: logo + 4 abas com texto (~110px cada) + logout numa única linha `h-16` sem overflow. (a confirmar em tela; pelo CSS não cabe.) O dono provavelmente expede pelo celular.
- Correção: só ícones com `aria-label` no mobile, ou nav em segunda linha com `overflow-x-auto`; `aria-current` na aba ativa.

## P2

**P2-1. URL desconhecida no host premium renderiza a landing; barra final quebra as páginas.**
- App.tsx:145-171 compara por igualdade: `/meu-pedido/`, `/atacado/`, `/Termos` caem na landing (com o chat), sem 404. Link de e-mail com barra final mostra a loja em vez do pedido.
- Correção: `path.replace(/\/+$/,'').toLowerCase()` e um 404 sóbrio da marca para o resto (cuidar do status HTTP/noindex via vercel.json).

**P2-2. Três navies diferentes e nenhum dourado: as secundárias parecem outro site.**
- Landing: --navy #060f20, --navy2 #0a1830, ouro #c9a227, Cormorant (SalVitaLanding.tsx:838-852). StoreFallback App.tsx:41 usa #060f20; TrackOrder.tsx:196 e Atacado.tsx:103 usam gradiente #0a1628->#0d2347 (flash entre fallback e página); Privacidade.tsx:12 usa #060f20->#0a1830 com ouro e Cormorant. Track/Atacado usam azul-celeste #4a9eff, verde e #009ee3 (azul do Mercado Pago) e fonte Outfit nos títulos.
- Correção: tokens compartilhados (`--navy`, `--gold`, `--salt`), fundo chapado #060f20, Cormorant nos h1/h2, botão primário dourado com texto navy.

**P2-3. Sinais de "cara de IA" em TrackOrder e Atacado.**
- Emoji como ícone: TrackOrder.tsx:5-8, 221, 230, 242, 255, 270, 349, 375, 378, 437, 486-487, 499, 511; Atacado.tsx:151-153, 176, 194. Ícone em círculo com gradiente verde e glow: TrackOrder.tsx:408-417. Glassmorphism (`backdropFilter: blur`) em todo cartão: TrackOrder.tsx:267, 360, 389, 447; Atacado.tsx:157, 172. Botões com gradiente 135deg: TrackOrder.tsx:326, 466; Atacado.tsx:277. Pílula/eyebrow "SAL VITA PREMIUM · ATACADO" (Atacado.tsx:127-134) e rótulos MAIÚSCULOS espaçados em cada campo (TrackOrder.tsx:278, 301, 391, 449; Atacado.tsx:37). Grade de 3 cards iguais ícone+título+texto (Atacado.tsx:146-164). Raio 16-20px em tudo.
- Correção: sem emojis (SVG de traço fino como a landing ou nada), timeline como linha vertical dourada com pontos de 10px, cartões planos com borda 1px `rgba(201,162,39,.2)` e raio 8-10px, trio de cards vira lista de 3 linhas, rótulos em caixa normal.

**P2-4. Foco de teclado invisível nas secundárias.**
- `outline:'none'` inline sem substituto: TrackOrder.tsx:296, 318; Atacado.tsx:31 (todos os campos). Botões inline sem :focus-visible. O foco dourado da landing só vale dentro de `.lp` (SalVitaLanding.tsx:857). WCAG 2.4.7.
- Correção: CSS global `input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #e8c547;outline-offset:2px}`.

**P2-5. Contraste fraco em textos secundários e placeholders.**
- Atacado.tsx:290 (`rgba(255,255,255,.3)`, ~2.2:1), :120 (.35, ~2.7:1), labels :36 (.5, ~4:1), :202 (.5). Placeholders herdam o cinza padrão do navegador sobre fundo escuro (~3:1). TrackOrder.tsx:364-380 usa .6-.65, no limite.
- Correção: texto secundário mínimo `rgba(255,255,255,.72)`; `::placeholder{color:rgba(255,255,255,.6)}` e medir.

**P2-6. TrackOrder: validação silenciosa.**
- TrackOrder.tsx:158-166: pedido não numérico ("#42") ou telefone com menos de 10 dígitos só dá `return`, sem mensagem. `parseInt('#42')` = NaN (:92 com URL ruim cria query com orderId NaN).
- Correção: `replace(/\D/g,'')`, `aria-invalid` + mensagem "Informe o telefone com DDD (10 ou 11 números)" via `aria-describedby`; descartar `pedido` NaN em getUrlParams.

**P2-7. Mensagem técnica do servidor ao cliente no botão de pagar.**
- TrackOrder.tsx:124-125 mostra `data.error.message` cru (tRPC/zod/MP) ao cliente.
- Correção: mapear códigos conhecidos para frases fixas (como `friendlyError`) e fallback "Não foi possível gerar o pagamento. Tente de novo ou fale conosco no WhatsApp" com link.

**P2-8. Dado inferido/inventado na tela do pedido.**
- TrackOrder.tsx:375 sempre escreve "Sal Vita Premium 1kg" qualquer que seja o pacote; :378 `?? 'Correios'` inventa transportadora quando vazio.
- Correção: usar `order.product` (após P0-1) e omitir a transportadora quando nula.

**P2-9. Estados de pagamento duplicados e conflitantes no TrackOrder.**
- :219-259 três faixas coloridas e :478-516 outro bloco "Aguardando confirmação" com botão "Pagar agora": quem acabou de pagar por PIX vê "Estamos confirmando" e o botão de pagar juntos (risco de pagar duas vezes). :256 "boleto até 2 dias úteis" é prazo sem fonte no código.
- Correção: com `mpStatus==='pago'` esconder o botão Pagar; um único bloco de estado; confirmar o prazo do boleto com o dono.

**P2-10. Atacado: erro cru do servidor, sem foco no erro, grade apertada.**
- Atacado.tsx:89 mostra `data.error` do zod (api/index.ts:841 `issues[0].message`, pode vir técnico); :268-270 erro sem `role="alert"` nem foco; :215 e :225 grids `1fr 1fr` / `2fr 1fr` fixos apertam e-mail/WhatsApp a ~150px em 375px (a confirmar em tela); selects com `color:#000` nas options.
- Correção: mensagens em português fixas, `role="alert"` + focar o erro, grids de 1 coluna abaixo de 480px, "(opcional)" nos poucos opcionais em vez de asterisco nos obrigatórios.

**P2-11. Copy genérica no Atacado.**
- Atacado.tsx:135-142 e 151-153: "origem que conta uma história", "Coerência de posicionamento e finalização premium", "retornar em breve" (:181). H2 de 3 linhas repete a marca; h1 e h2 competem.
- Correção: dizer o que o lojista recebe (caixa de 10 embalagens de 1 kg zip lock com janela, nota fiscal, rastreio), prazo de resposta só se o dono confirmar, um único h1.

**P2-12. Admin: números que confundem.**
- SalVitaAdmin.tsx:817: "Receita Confirmada" soma `totalPrice` (inclui frete) e o "Ticket Médio" idem; KPI "Total Pedidos" (:814) inclui cancelados e aguardando; contagens das abas (:759-765) ignoram período e busca ("Todos (120)" com lista de 8). "Pendentes Envio" (:763, :816) conta só `label_generated`; pedidos pagos sem etiqueta (a ação mais urgente) não geram KPI. O resumo de IA tem outra "Receita Total" (:658) que pode divergir.
- Correção: rotular "Total cobrado (com frete)" ou separar frete; KPI "Pagos sem etiqueta" como urgente; contagens que respeitam período/busca.

**P2-13. "Salvar & Enviar" não envia e pode gravar estado inconsistente.**
- SalVitaAdmin.tsx:596-602: só salva o código e marca "shipped", com duas mutações em paralelo (se o rastreio falhar o status já virou Enviado). O envio real é outro botão (:530).
- Correção: rótulo "Salvar rastreio e marcar enviado", encadear com `mutateAsync` e oferecer "Avisar o cliente agora?".

**P2-14. Jargão técnico e emoji na UI do dono.**
- "Enviar WA (Servidor)", "WA Manual", "Etiqueta ME", "ME ID", "Powered by Groq · Llama 3.3" (SalVitaAdmin.tsx:530, 541, 485, 612, 640); toast "🚀 Rastreio disparado via WhatsApp do servidor!" (:384); "Análise Preditiva" (:639) e "Recuperação Preditiva com IA" (SalVitaRecovery.tsx:248) não fazem previsão; ícone `DollarSign` (:817) para real.
- Correção: "Avisar cliente no WhatsApp" / "Abrir no meu WhatsApp", "Etiqueta Melhor Envio", "Resumo de vendas (IA)", ícone neutro.

**P2-15. Admin: acessibilidade e alvos de toque.**
- Botões `text-xs py-1.5` (~28px) no OrderCard (:468-575); menu "..." sem `aria-label`/`aria-expanded`, sem fechar ao clicar fora ou Esc (:564-583); checkbox de seleção sem rótulo (:408); EditModal sem `role="dialog"`, Esc ou trap de foco (:269-342), labels sem `htmlFor`; login (:193, :204) sem `htmlFor` nem `autoComplete`.
- Correção: alvos >=40px no mobile, `aria-label="Mais ações do pedido #N"`, Dialog do Radix (já no projeto), `htmlFor/id`, `autoComplete="username|current-password"`.

**P2-16. Admin: atualização lenta e busca frágil.**
- Polling 5 min + staleTime 2 min (SalVitaAdmin.tsx:692-696): o toast "Novo pedido recebido" (:712) chega com até 5 min de atraso. Lista inteira renderizada sem paginação (:905); busca de telefone/CPF compara texto cru (:737-739), então "(84) 98620" não acha "84986207841"; id só por igualdade exata (:740).
- Correção: refetchInterval 60 s com aba visível; normalizar dígitos; "Mostrar mais".

**P2-17. Privacidade/Termos: lacunas diante do que o código faz.**
- Privacidade.tsx não traz prazo de retenção (pedidos, CPF, IP/UA, carrinhos abandonados, conversas do chat com a Groq) nem como eliminar; transferência internacional é citada só de forma genérica (§6); omite IP/UA gravados no consentimento do atacado; §3 promete "sequência" e "cupom" (confirmar que reflete a automação ativa).
- Termos.tsx não trata pedido não pago/PIX ou boleto expirado nem prazo do estorno. O aceite no checkout existe (Landing :1709).
- Correção: seção "Por quanto tempo guardamos" com prazos definidos pelo dono (não inventar) e revisão jurídica registrada em ESTADO-DO-PROJETO.

## P3

- P3-1. Logo SVG com texto Pacifico copiado 5 vezes (TrackOrder:203, Atacado:110, Privacidade:31, Admin:181 e 990), cada um com clipPath de id diferente; extrair `<BrandLogo/>` e unificar com a marca da landing.
- P3-2. `StoreFallback` (App.tsx:41) é só tela navy vazia, sem logo nem `aria-busy`; em rede lenta o cliente de /meu-pedido vê tela escura sem sinal.
- P3-3. App.tsx:141-173 repete 5 vezes a pilha `ErrorBoundary > ThemeProvider > TooltipProvider > Toaster > Suspense`; extrair `StoreShell` e tabela de rotas. `ThemeProvider defaultTheme="light"` na loja escura não tem efeito visual.
- P3-4. TrackOrder.tsx:223, 230, 243: "Pagamento aprovado!", "Não se preocupe" soam a script; texto direto: "Pagamento recebido. Estamos separando o seu pedido."
- P3-5. Travessões na copy ao cliente: Atacado.tsx:136, 138-141, 290; TrackOrder.tsx:234. Trocar por vírgula ou ponto.
- P3-6. KPI com `animate-ping` infinito (SalVitaAdmin.tsx:231) sem `motion-reduce`; os 4 KPIs seguem o molde ícone em quadrado arredondado + número grande.
- P3-7. EditModal: botão Salvar usa `flex-2` (SalVitaAdmin.tsx:340), classe inexistente no Tailwind (Salvar fica do tamanho do texto). Usar `flex-[2]`. UF sem `uppercase`, CEP sem máscara.
- P3-8. CSV (SalVitaAdmin.tsx:69-110): células que começam com `=+-@` viram fórmula no Excel; status em inglês técnico; exporta CPF sem aviso; `revokeObjectURL` imediato pode cancelar o download em alguns navegadores.
- P3-9. Login admin: placeholder `admin@salvitarn.com.br` (:199) expõe o e-mail do administrador; usuário logado sem papel admin vê o login de novo sem mensagem (:1060); `handleLogout` sem try/catch (:977).
- P3-10. Toasts com emoji e exclamação (🛍️ :712, 🎁 :458, "Exportados N pedidos em CSV!" :109): padronizar tom sóbrio.

## Verificado e OK
- Token do pedido removido da URL e guardado em sessionStorage (TrackOrder.tsx:25-47); /meu-pedido, admin e recovery sem Pixel por padrão (index.html:117-119).
- Preços, parcelamento em 3x e transportadoras de Termos/Privacidade batem com o código (shipping.ts:47-49, 732; Landing :114-116).
- Honeypot do atacado e tratamento de 429 (Atacado.tsx:82).
- Cancelar pedido tem `confirm` e mostra as ações feitas (SalVitaAdmin.tsx:568, 383).
- Landing linka Termos e Privacidade no rodapé e no checkout (Landing :1547-1548, :1709).
