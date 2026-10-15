# Plano: follow-up pós-compra por e-mail (loja Premium)

Data: 15/10/2026 · Pedido do dono: manter contato com quem comprou e oferecer de novo, com
vários e-mails ao longo do tempo (ex.: a cada 30 dias). Canal: **só e-mail** (decisão de 15/10:
nada de WhatsApp em comunicação automática de pós-venda, para poupar o número não oficial).

## 1. O que já existe e será reaproveitado

| Peça | Onde | Estado |
|---|---|---|
| Motor de sequências (passos com `delay_days`, repetição a cada N dias, condição por abertura/clique, idempotência, cota, descadastro) | `server/email/sequenceEngine.ts` (banco do Premium) | pronto, **não roda sozinho** |
| Tela "Automatizar" no painel (criar, ligar/desligar, excluir sequência; "rodar agora") | `premiumEmailMarketing` + `SalVitaEmailMarketing.tsx` | pronto, **sem editar texto** |
| Descadastro (link `{unsubscribe}`, supressão global LGPD) | `/api/unsubscribe`, `email_suppressions` | pronto |
| Abertura e clique por e-mail | webhook do Resend → `email_events` | pronto |
| Cupom ativo de recuperação | `getActiveRecoveryCouponCode()` | pronto |
| Lembrete de recompra pelo **WhatsApp** aos 45 dias | `processReorderReminders` em `api/index.ts` | ativo; **será desligado** (substituído pelo e-mail) — decisão do dono |

## 2. Lacunas a fechar (código)

1. **Rodar as sequências do Premium no cron diário** (`/api/cron/abandoned-cart`, 12h BRT), isolado em
   `runIsolated`, com teto de envios de marketing por dia (ver §5).
2. **Inscrever compradores automaticamente** (no mesmo cron, sem tocar no fluxo de pagamento):
   pedido pago, com e-mail, não cancelado, entregue (`status='delivered'`) **ou** pago há ≥ 10 dias
   (fallback se o Melhor Envio não informar entrega) → inscreve na sequência **"Pós-compra"**.
   Um pedido inscreve uma vez (marca em `shipping_events`, evento `followup-enrolled`, sem coluna nova).
3. **Recompra reinicia o ciclo**: se o cliente fizer pedido novo, cancelar as inscrições ativas
   dele (Pós-compra e Relacionamento) e a nova compra inscreve de novo do zero — ninguém recebe
   "hora de repor?" dias depois de comprar.
4. **Passar de "Pós-compra" para "Relacionamento mensal"** quando a primeira terminar.
5. **Tempo de recompra pelo tamanho do pacote**: o motor usa atraso fixo por passo; o
   tamanho entra no momento da inscrição, deslocando `next_send_at` do passo de recompra
   (1 kg ≈ 30 dias, Trio 3 kg ≈ 75 dias, Caixa 10 kg ≈ 150 dias após a compra).
6. **Editar texto de passo no painel** (assunto e corpo), para o dono ajustar sem programador.
7. **Variáveis no texto**: além de `{nome}`, `{unsubscribe}`, aceitar `{link_loja}` (com UTM) e
   `{cupom}` (cupom de recuperação ativo; some a frase se não houver cupom).
8. **Desligar** `processReorderReminders` (WhatsApp) — ou deixar atrás de uma variável
   `REORDER_WHATSAPP=off` por padrão.

## 3. As sequências (criadas **desligadas**; o dono revisa o texto e liga no painel)

Regras de texto (ESTADO-DO-PROJETO §4, obrigatórias): sem alegação de saúde, de minerais, de
pureza ou de benefício; sem "melhor do Brasil"; preços e prazos só os reais; "Sal Integral" pode
aparecer (decisão do dono). Tom: produtor de sal do RN falando com quem já comprou. Um link
principal por e-mail, com `utm_source=email&utm_medium=posvenda&utm_campaign=<passo>`.

### A) "Pós-compra" (todo comprador, uma vez por pedido)

| # | Quando | Assunto (rascunho) | Conteúdo |
|---|---|---|---|
| 1 | dia 0 (entrega, ou 10 dias após pagar) | "Chegou bem, {nome}?" | Agradece, como guardar (zip lock fechado, local seco), convite para responder se algo veio errado. Sem oferta. |
| 2 | +12 dias | "Três jeitos de usar o Sal Vita na cozinha" | Ideias reais de uso (preparo, finalização, churrasco). Link para a loja discreto. |
| 3 | no tempo de recompra do pacote (30/75/150 dias da compra) | "Hora de repor o sal?" | Lembrete direto + botão para comprar; `{cupom}` se houver cupom ativo. |
| 4 | +7 dias, **só se não abriu o 3** (`if_not_opened`) | "A caixa de 10 kg sai a R$ 14,99 o quilo" | Comparação de preço por kg real (1 kg R$ 29,90 · Trio R$ 24,97/kg · Caixa R$ 14,99/kg). |

Ao terminar → inscreve em "Relacionamento mensal".

### B) "Relacionamento mensal" (repete a cada 30 dias, até descadastro ou nova compra)

6 e-mails, 30 dias entre eles; ao fim recomeça (`repeat=true`, `repeat_interval_days=30`).
Alternam conteúdo e oferta, nunca dois de oferta seguidos:

1. Da salina à sua mesa (como o sal é feito em Mossoró) — conteúdo
2. Lembrete de reposição com preço por kg — oferta
3. Ideias para o churrasco / fim de ano (sazonal genérico) — conteúdo
4. Indique para alguém (sem prêmio, só o link) — relacionamento
5. Caixa 10 kg para quem cozinha muito — oferta
6. "Ainda quer receber nossos e-mails?" — pergunta direta com o link de descadastro em destaque
   (limpa a base e protege a reputação do domínio)

## 4. Quem entra

- Compradores novos: automaticamente, como em §2.2.
- **Base antiga** (decisão do dono): opção de inscrever de uma vez quem comprou nos últimos
  12 meses direto em "Relacionamento mensal" (não em "Pós-compra", que fala de entrega recente),
  espalhando a primeira mensagem ao longo de 7 dias para não estourar a cota.
- Nunca: e-mail suprimido (descadastro, bounce, reclamação), domínio bloqueado, pedido cancelado
  ou reembolsado.

## 5. Cota e entregabilidade

- O plano gratuito do Resend dá 100 e-mails/dia **compartilhados** com os transacionais
  (confirmação, envio, entrega). Teto de marketing por dia: **40** (variável `FOLLOWUP_DAILY_CAP`),
  sobrando espaço para os transacionais. O motor já devolve a cota e tenta no dia seguinte.
- Recomendado ao dono: conta gratuita no Brevo (300/dia) como transbordo — o motor já suporta
  (`BREVO_*`), só falta a chave.
- Todo e-mail com link de descadastro e cabeçalho List-Unsubscribe (o `layout` já faz).

## 6. Privacidade (LGPD)

Cliente que comprou pode receber comunicação da loja sobre produtos semelhantes com base no
legítimo interesse, desde que possa sair a qualquer momento. Atualizar `Privacidade.tsx` para
dizer isso e como sair (link em todo e-mail). Sem compra = sem inscrição.

## 7. Como medir

Painel "Resultados" já mostra envios/aberturas/cliques. Acrescentar: pedidos com
`utm_medium=posvenda` nos últimos 30/90 dias e receita atribuída.

## 8. Decisões do dono (15/10/2026) — valem sobre o resto deste plano

1. **Recompra em 30 dias para todos os pacotes** (sem prazo por tamanho): o passo 3 de "Pós-compra"
   sai 30 dias após a compra para qualquer pacote. O §2.5 não se aplica.
2. **Sem cupom** nos e-mails: não implementar a variável `{cupom}`; só `{link_loja}` (com UTM).
3. **WhatsApp de recompra desligado**: `processReorderReminders` deixa de rodar (fica atrás de
   `REORDER_WHATSAPP=on`, desligado por padrão).
4. **Só compradores novos**: sem inscrição da base antiga (§4, segundo item, não se aplica).
## 9. Execução (agente)

Uma sessão Sonnet: §2 (código + testes sem rede), §3 (sequências criadas desligadas via
migração idempotente no `ordersMigrate.ts`, versão nova + `schema:lock`), §6 e §7. Publica após
`check` + `test`; o dono revisa os textos no painel e liga cada sequência.
