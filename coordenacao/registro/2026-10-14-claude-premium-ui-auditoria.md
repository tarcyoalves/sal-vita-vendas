# Auditoria de UI da loja Premium: checkout, "cara de IA" e painel admin

- **Agente:** claude (Opus coordenando + 6 agentes Sonnet: 3 auditorias, 3 lotes de correção)
- **Início:** 2026-10-14 BRT
- **Fim:** 2026-10-14 BRT
- **Status:** concluído
- **Branch:** `premium-ui-audit` → `main`

## Objetivo

Pedido do dono: auditoria completa de UI/frontend da loja Premium, tirar a "cara de IA"
e revisar cada função, incluindo o painel admin e o que falta nele. Relatórios em
`docs/auditoria-premium-2026-10-14/` (A visual, B funcional, C secundárias, D lacunas do admin).

## Decisões do dono

- Lotes aprovados: 2 (checkout), 3 (cara de IA), 4 (painel admin) e banner de consentimento do Pixel.
- Lote 1 (conformidade) **não** aprovado: o nome "Sal Integral"/"Sal Marinho Integral" fica,
  mesmo com o precedente da ANVISA de 07/08/2026 (ESTADO-DO-PROJETO §4). Não renomeie sem pedido.
- "Seco ao sol, sem forno nem calor industrial": confirmado pelo dono como verdadeiro.

## Resultado

- **Checkout (lote 2):** carrinho abandonado não dispara mais para quem só abriu a página;
  erros do servidor/limitador em português junto ao campo; Enter no cupom aplica o cupom;
  corrida do CEP/frete; timeouts e endereço manual se o ViaCEP cair; Número aceita S/N;
  copiar PIX com alternativa; fechar o PIX pede confirmação; dados salvos expiram em 30 dias;
  `/meu-pedido` não diz "a caminho" só com etiqueta e o Purchase dispara uma vez por pedido.
- **Pixel:** só carrega depois de "Aceitar" no banner (`components/premium/ConsentBanner.tsx`);
  Privacidade atualizada. A API de Conversões do servidor segue sem depender do banner
  (base: legítimo interesse — pendente de confirmação do dono) e está desligada por falta de `FB_CAPI_TOKEN`.
- **Cara de IA (lote 3):** sem texto em gradiente, vidro, brilhos, ✦ e grades 01–06; um
  marinho e um dourado como tokens escopados em `html.sv-premium`; fontes carregadas por host;
  H1 "Sal marinho não refinado de Mossoró"; seção "Sal integral vs refinado" cortada; processo
  cita a iodação. Logo oficial (`components/premium/BrandLogo.tsx`) em loja, chat, rastreio,
  atacado, Privacidade e admin — o SVG redesenhado à mão saiu.
- **Admin (lote 4):** confirmação em pagamento manual, WhatsApp em massa, etiquetas em lote
  (cobram no Melhor Envio) e exclusão (digitar o nº do pedido); erro de carga com "Tentar de
  novo"; receita de produtos separada do frete; cabeçalho cabe em 375px; card "Conversão 18,4%"
  (número inventado) removido; rewrite de `/sal-vita-email-marketing` no `vercel.json`.

## Pendências

- Lacunas do admin em `audit-D-admin-lacunas.md` (cupons ativar/desativar, pedidos `[REVISAR]`
  sem aba, reenvio de confirmação, entre 18 itens).
- Link de rastreio do `/meu-pedido` só aponta para os Correios (frete pode ser Jadlog/Azul/J&T).
- F-12 (servidor descarta cupom sem avisar) exige mudança no servidor.
- Logo é carregada do WordPress (`salvitarn.com.br`); trazer para `client/public` se o dono quiser.
- `tests/smbi-multi-item-tool.test.ts` e `tests/smbi-envio-multiempresa.test.ts` falham só no
  Windows (CRLF do `core.autocrlf`); passam no build da Vercel.
