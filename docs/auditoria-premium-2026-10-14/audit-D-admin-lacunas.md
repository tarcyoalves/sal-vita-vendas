# Auditoria D — Lacunas do painel admin (loja Sal Vita Premium)

Data: 2026-10-14. Revisão apenas de leitura: nada foi implementado. Base: `server/routers/{shipping,recovery,premiumEmailMarketing,b2b,catalog}.ts`, `server/db/schema.ts` (`siteOrders`) e o que `SalVitaAdmin.tsx`, `SalVitaRecovery.tsx` e `SalVitaEmailMarketing.tsx` realmente chamam.

Legenda: esforço P (até 0,5 dia), M (1-2 dias), G (mais de 2 dias). Prioridade: A (dói no dia a dia ou dá prejuízo), B (melhora), C (futuro).

## O que já existe e funciona
Lista de pedidos com busca/aba/período, CSV, editar dados, confirmar pagamento manual, gerar etiqueta (individual e lote até 25), rastreio, WhatsApp de rastreio, cancelar com reembolso MP, excluir não pago, carrinhos abandonados, cobrança de não pagos, templates, automação, cupons (listar/criar), e-mail marketing (campanhas, sequências, regras, contatos, supressões), leads B2B.

## Lacunas

| # | O que falta | Backend existe? | Esforço | Prio |
|---|---|---|---|---|
| 1 | **Cupons: desativar, excluir e definir o cupom padrão de recuperação.** A tela só lista e cria; o dono não consegue desligar um cupom vazado ou vencido. Também não edita tipo (% ou fixo), mínimo, limite e validade: o formulário só envia código e valor. | Sim: `recovery.toggleCoupon` (496), `deleteCoupon` (1214), `setRecoveryCoupon` (507); `createCoupon` já aceita `minOrderValue`, `maxUses`, `expiresAt`, `discountType`. A tela não usa. | P | A |
| 2 | **Detalhe do pedido com histórico** (linha do tempo: criado, pago, etiqueta, enviado, quem confirmou à mão, tentativas de pagamento, notas). Hoje o cartão mostra só o estado atual. | Parcial: `siteOrders` tem `notes`, `createdAt`, `updatedAt`, UTM, `mpPaymentId`. Não há tabela de eventos/histórico. | G | A |
| 3 | **Logs de pagamento [REVISAR]**: pedidos com nota `[REVISAR]` (pagamento aprovado em pedido cancelado, divergência de valor) não aparecem em nenhuma aba/filtro; o dono só descobre abrindo o texto de `notes`. Falta aba "A revisar" e ver o status real no Mercado Pago. | Parcial: o webhook grava `[REVISAR]` em `notes` (api/index.ts, `appendReviewNote`). `recovery.getPaymentInfo` (671) devolve PIX/boleto; nenhuma procedure lista eventos do MP. | M | A |
| 4 | **Reenviar confirmação de pedido/pagamento** (e-mail e WhatsApp) e **reenviar o link de rastreio do cliente** (`/meu-pedido?...&t=`). Quando o e-mail cai no spam não há como reenviar. | Parcial: `shipping.sendTrackingWhatsApp` (1125) manda só rastreio; `orderConfirmation.ts` (server/lib) monta a confirmação, mas sem procedure admin que a dispare de novo. | M | A |
| 5 | **Nota fiscal**: nenhum campo, status ou anexo de NF-e no pedido; despacho sem NF pode barrar no Melhor Envio/Correios conforme o serviço. Pelo menos: número/chave/link da NF no pedido e exibição no cartão. | Não: sem coluna em `siteOrders` (exigiria schema + migração + `schema:lock`). Integração com emissor é maior ainda. | M (campo manual) / G (emissão) | A/B |
| 6 | **Estoque**: nenhum controle de saldo por pacote (1kg, Trio, Caixa). A loja pode vender o que não tem; não há alerta de pouco estoque nem baixa automática por pedido pago. | Não: não há tabela de estoque; `catalog.ts` é de conteúdo/specs (documentos, imagens), não de saldo. | G | B (A se o estoque é curto) |
| 7 | **Relatório de vendas por período e por pacote**: KPIs são só do total carregado; não há série por dia/semana/mês, nem quebra por produto (`product`, `quantity`), por cidade/UF, por cupom ou por origem (`utmSource`/`utmCampaign` já gravados). A "Análise IA" gera texto, não tabela. | Parcial: dados existem em `siteOrders`; `shipping.analyzeOrders` (505) devolve resumo fixo (receita, pagos, ticket, 7 dias). Falta agregação por período/pacote (query nova ou cálculo no cliente sobre `listOrders`). | M | A |
| 8 | **Filtro por data personalizado** (de/até). Só há Hoje/7 dias/Mês/Tudo; fechar o mês passado ou conferir um dia específico não é possível. O CSV segue o filtro, então herda o limite. | Não precisa: filtra no cliente sobre `listOrders` (que traz tudo, sem paginação). | P | B |
| 9 | **Paginação / carga do `listOrders`**: devolve todos os pedidos de uma vez e a tela renderiza todos. Com crescimento fica lenta no celular. | Sim, mas sem limite/cursor: `shipping.listOrders` (491) aceita só `status`. | M | B (A após ~500 pedidos) |
| 10 | **Clientes recorrentes / recompra**: não há visão "quem comprou 2+ vezes", valor por cliente, ou lista dos que passaram do tempo de recompra. | Parcial: existe `reorderRemindedAt` em `siteOrders` (lembrete de recompra) mas sem tela nem procedure de listagem; o agrupamento por telefone/CPF seria query nova. | M | B |
| 11 | **Carrinhos abandonados com taxa de conversão**: a tela mostra lista e botões, mas não mostra quantos carrinhos viraram pedido, quanto foi recuperado em R$, nem qual mensagem/cupom converteu. O card "Conversão Est. 18.4%" da aba IA era número fixo inventado (removido neste lote). | Parcial: `abandonedCarts` tem `recovered`, `convertedAt`, `recoverySentAt`; falta agregação (procedure `recoveryStats`) e atribuição por cupom. | M | A |
| 12 | **E-mail marketing do Premium**: o painel usa `premiumEmailMarketing`, mas não expõe `createSequence`/`toggleSequence`/`deleteSequence`, `createAutomationRule`/`deleteAutomationRule`, `createTemplate`/`deleteTemplate`, `addContact`, `runSequencesCronNow`. Ou seja, a tela lista sequências, regras e templates sem poder criar nem desligar. | Sim, todas existem em `premiumEmailMarketing.ts` (linhas 200-335); a tela não chama. | M | B |
| 13 | **Busca por cliente/telefone/nº do pedido**: existe; era frágil (telefone e CPF só por texto cru). Corrigido neste lote para comparar só dígitos. Falta busca por e-mail em Recuperação/B2B e busca global entre pedidos, carrinhos e leads de um mesmo cliente. | Cliente apenas. Busca global exigiria procedure nova. | P (local) / M (global) | C |
| 14 | **Exportar CSV**: existe só para pedidos. Faltam exportar carrinhos abandonados, cupons com uso e leads B2B; CSV de pedidos exporta CPF sem aviso (LGPD) e usa status em inglês técnico. | Cliente apenas (dados já carregados). | P | B |
| 15 | **Devolução/troca e reembolso parcial**: só cancelar com reembolso total. Sem registro de devolução, extravio ou reenvio. | Parcial: reembolso total em `cancelOrder` (1036); parcial/registro não existem. | G | C |
| 16 | **Configurações do frete e preços** (valor do pacote, frete grátis acima de X, CEPs atendidos) editáveis sem deploy. | Não: preços e regras ficam em código (`shipping.ts`, `calculate`). | G | C |
| 17 | **Alertas operacionais**: WhatsApp caído, token Melhor Envio/MP expirado, webhook falhando, cron de e-mail parado. Só há o badge do WhatsApp na aba Recuperação. | Parcial: `recovery.waStatus` (770). Resto não existe. | M | B |
| 18 | **Pedido manual (venda por WhatsApp/telefone)**: o dono não consegue cadastrar um pedido fora do site para gerar etiqueta e controlar. | Parcial: `shipping.createOrder` (307) é público para o checkout; faltaria versão admin sem pagamento. | M | B |

## Sugestão de ordem
1. Cupons completos (1) e aba "A revisar" (3): backend pronto ou quase, retorno imediato.
2. Reenvio de confirmação/rastreio (4) e conversão de recuperação (11).
3. Relatório por período/pacote (7) + filtro de data (8) + exportações (14), tudo sobre dados que já existem.
4. Nota fiscal manual (5) e estoque (6): precisam de schema (seguir o checklist de migração do `AGENTS.md`).

## Observações encontradas durante o lote 4 (fora do escopo do cliente)
- `shipping.deleteOrder` já recusa pedido pago no servidor; a tela agora esconde "Excluir" para pago e orienta a cancelar.
- `batchGenerateLabels` limita a 25 pedidos e 45 s; a tela agora bloqueia acima de 25.
- `listOrders` ignora o input `status`; qualquer filtragem no servidor depende de mudar o router.
