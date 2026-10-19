# Plano — Campanhas de reativação (WhatsApp + e-mail) com IA

Status: **especificação, nada implementado**. Autor: orquestração Claude, 19/10/2026.
Pedido do dono: dar uma ordem em português ("clientes com última compra antes de 17/09,
pergunte como estão de sal") e o sistema executar nos contatos via WhatsApp Web e e-mail,
**sem tomar banimento**.

---

## 1. Decisão de arquitetura (o que muda em relação à sugestão do ChatGPT)

| Ponto | Sugestão recebida | Decisão |
|---|---|---|
| Onde mora a lista de clientes | Extensão lê os contatos do WhatsApp ("CLIENTE" no nome) | **O CRM é a fonte da verdade.** Já tem clientes, telefone, `last_contacted_at`, tarefas, atendente, pedidos. O nome do contato no celular é frágil e não traz data confiável. |
| Quem interpreta a ordem | IA com acesso ao navegador | **IA só traduz a ordem em um filtro estruturado** (JSON validado por zod). Quem seleciona os clientes é uma query do CRM. A IA nunca envia nada. |
| Quem envia no WhatsApp | Extensão clica sozinha, com intervalos | **Envio assistido:** a pessoa aperta Enter em cada mensagem (fase 1–2). Envio 100% automático só pela **API oficial** (fase 3). |
| E-mail | — | Reaproveitar o motor de e-mail marketing que já existe (Brevo/Resend, cota, descadastro). |

**Por quê.** Automação que envia sozinha pelo WhatsApp Web (extensão que clica, Evolution/Baileys,
"Claude in Chrome" saindo disparando) **viola os Termos do WhatsApp**. Não existe intervalo que
garanta ausência de banimento: o WhatsApp avalia denúncias, bloqueios, volume de conversas novas
e padrão de envio. O que reduz risco de verdade é: mandar só para quem é cliente e conversa com
você, pouco volume, texto pessoal, opção de sair, e um humano apertando enviar — ou usar a API
oficial, que existe exatamente para isso.

> O que foi feito hoje com o Claude na extensão (envio automático em sequência) é da mesma
> categoria de risco. Em volume baixo costuma passar; não repita em massa.

---

## 2. Fases

### Fase 1 — Campanha assistida dentro do CRM (sem extensão) — **recomendada para começar**
Risco de banimento: o mesmo de você mandar à mão. Custo: zero (só a IA, que já está no Free).

Fluxo:
1. Tela nova **Campanhas** (admin/gerente). Campo: "O que você quer fazer?"
   Ex.: *"Clientes ativos sem contato desde 17/09, pergunte como estão de sal."*
2. **IA → filtro.** A cadeia de IA já existente (Groq → Cerebras → NVIDIA → OpenRouter) devolve
   JSON no formato abaixo, validado por zod. Se não validar, a tela pede para reformular.
   ```json
   {
     "publico": { "status": ["ativo"], "semContatoDesde": "2026-09-17",
                  "cidades": [], "uf": [], "atendenteIds": [], "tags": ["compra_muito"] },
     "canal": "whatsapp",            // whatsapp | email | ambos
     "mensagemBase": "Boa tarde, {primeiroNome}, tudo bem? Como estão de sal por aí?",
     "variacoes": 3                   // IA gera 3 variações do texto, você escolhe/edita
   }
   ```
3. **Prévia obrigatória:** lista de quem vai receber, quem foi excluído e por quê (sem telefone,
   pediu para sair, contatado nos últimos N dias, duplicado), contagem total, texto final.
   Nada sai sem clicar "Aprovar campanha".
4. **Fila de envio assistido:** a tela mostra um cliente por vez com botão
   **"Abrir no WhatsApp"** → `https://web.whatsapp.com/send?phone=55DDDNUMERO&text=<texto>`
   (ou `wa.me/...` no celular). O WhatsApp abre com o texto pronto; **você aperta Enter**.
   Volta ao CRM e clica "Enviado" / "Pular" / "Número inválido". Atalho de teclado para ir rápido.
5. Ao marcar "Enviado": grava `campaign_recipients.status = sent`, atualiza
   `clients.last_contacted_at` e cria/fecha a tarefa de follow-up (aparece no funil e no ranking).
6. **E-mail** (se canal = email/ambos): entra no motor de e-mail marketing existente, com a cota e o
   descadastro que já funcionam. Envio automático é aceitável aqui (descadastro + cota).

### Fase 2 — Extensão "copiloto" no WhatsApp Web (opcional, depois da fase 1 rodar)
Ganha velocidade sem perder o humano no envio.
- Chrome Manifest V3, painel lateral dentro do WhatsApp Web.
- Puxa **a fila já aprovada** do CRM (rota tRPC autenticada por token pessoal da extensão;
  só quando você clica "Próximo" — sem polling, por causa da cota do Neon).
- Abre a conversa, **cola o texto na caixa e para**. Enter é sempre seu. A extensão
  **não tem código que clique em enviar** (regra testável).
- Depois do Enter, a extensão confirma no CRM ("Enviado").
- Opcional: ler a última mensagem recebida do cliente na conversa aberta e sugerir resposta com IA
  (só sugestão).
- Manutenção: o WhatsApp Web muda o HTML com frequência; seletores ficam num arquivo único e a
  extensão falha "fechada" (se não achar a caixa de texto, não faz nada).

### Fase 3 — API oficial (WhatsApp Business Platform / Cloud API) para automação real
Quando o volume justificar enviar sem ninguém apertando Enter.
- Número dedicado verificado na Meta (não o seu pessoal).
- Mensagens fora da janela de 24 h só com **modelos aprovados** (categoria marketing ou utilidade),
  cobrados por mensagem conforme a tabela da Meta para o Brasil (confirme o valor atual).
- Respostas chegam por webhook no CRM e viram tarefa para o atendente.
- O motor de fila da fase 1 continua igual: só troca o "executor" (humano → API).

**Não fazer:** envio automático pelo WhatsApp Web, Evolution/Baileys para prospecção, listas
compradas, número novo disparando no primeiro dia, contornar limites "humanizando" cliques.

---

## 3. Regras de proteção (valem em todas as fases)

Política interna da Sal Vita (não são garantia contra banimento; reduzem risco):
1. **Só clientes** do CRM com telefone e histórico de conversa/compra. Nunca contato frio.
2. **Teto diário** de conversas iniciadas por campanha: começar com **30/dia por número**,
   subir devagar só se não houver bloqueios/denúncias. Configurável.
3. **Horário:** seg–sex 08–18h, sáb 08–12h (America/Fortaleza). Fora disso a fila não libera.
4. **Ritmo:** a fila não libera o próximo contato antes de um intervalo mínimo (ex.: 60–120 s).
   Não é truque anti-detecção: é ritmo de gente.
5. **Não repetir:** cliente contatado nos últimos 14 dias (qualquer canal) é excluído.
   Uma mensagem por cliente por campanha.
6. **Texto:** personalizado com o nome, curto, **sem link na primeira mensagem**, variações
   escolhidas por você. Linha de saída: *"Se preferir não receber essas mensagens, é só responder SAIR."*
7. **Descadastro:** "SAIR"/"PARAR"/pedido explícito → tabela `contact_optouts`
   (WhatsApp e e-mail separados). O filtro sempre exclui. LGPD: interesse legítimo para clientes
   ativos + direito de oposição atendido.
8. **Freio automático:** se 3 números da campanha derem "inválido/bloqueado" seguidos, ou se o
   WhatsApp mostrar aviso de restrição, a campanha **pausa** e avisa o admin.
9. **Auditoria:** guarda a ordem original, o filtro gerado pela IA, a lista aprovada, quem aprovou
   e o resultado de cada envio.

---

## 4. Modelo de dados (banco do CRM; seguir CLAUDE.md: migrate.ts + SCHEMA_VERSION + schema:lock)

```
campaigns            id, created_by, ordem_original text, filtro jsonb, canal,
                     mensagem text, status (rascunho|aprovada|em_andamento|pausada|concluida),
                     limite_diario int, aprovada_por, aprovada_em, created_at
campaign_recipients  id, campaign_id, client_id, canal, telefone/email snapshot,
                     texto_final, status (pendente|aberto|enviado|pulado|invalido|respondeu|optout),
                     motivo_exclusao, enviado_por, enviado_em, updated_at
                     unique (campaign_id, client_id, canal)
contact_optouts      id, client_id null, telefone null, email null, canal, motivo, created_at
```
Reserva do próximo da fila: `FOR UPDATE SKIP LOCKED` em SQL raw (mesmo padrão do e-mail — não
reescrever no query builder). Sem polling: a fila só consulta quando a pessoa clica "Próximo".

## 5. Backend (tRPC, router `campanhas`)
- `interpretar({ordem})` → IA devolve o filtro (zod). Prompt de sistema fixa o schema e proíbe
  inventar campos; resposta inválida = erro amigável. Registra custo/modelo usado.
- `previa({filtro})` → aplica o filtro no banco, devolve incluídos/excluídos com motivo.
- `gerarVariacoes({mensagemBase})` → 3 variações curtas, sem link.
- `aprovar({campanhaId, mensagem, limiteDiario})` → congela a lista (snapshot).
- `proximo({campanhaId})` → respeita horário, teto diário, intervalo mínimo; reserva 1 destinatário.
- `marcar({recipientId, status})` → enviado/pulado/inválido/optout; atualiza `last_contacted_at`.
- `pausar/retomar/concluir`.
- Permissão: `staffProcedure` (admin e gerente).

## 6. IA
- Usar a cadeia existente em `server/lib/llm.ts`. Tarefas pequenas (texto → JSON, 3 variações):
  cabem folgado nos planos gratuitos.
- A IA **não** recebe telefones nem dados pessoais além do primeiro nome quando gera variações.
- Temperatura baixa no `interpretar`; testes com 10–20 ordens reais em português.

## 7. Testes mínimos
- Filtro: datas (sem deslocar um dia — string de data pura), exclusões (optout, 14 dias,
  sem telefone, duplicado).
- Fila: horário, teto diário, intervalo, SKIP LOCKED (dois cliques simultâneos não pegam o mesmo).
- Texto: sem link, com linha de saída, `{primeiroNome}` substituído.
- Extensão (fase 2): teste de código-fonte garantindo que não existe disparo de clique/tecla Enter
  no botão de enviar.

## 8. Ordem de implementação sugerida
1. Fase 1 sem IA (filtro por formulário) → valida fila, regras e o fluxo "Abrir no WhatsApp".
2. Liga a IA no `interpretar` e nas variações.
3. E-mail no mesmo fluxo.
4. Uma semana rodando com teto 30/dia; medir respostas, bloqueios e tempo gasto.
5. Decidir: extensão copiloto (fase 2) ou API oficial (fase 3).

## 9. Perguntas em aberto para o dono
- Os telefones dos clientes estão completos no CRM (com DDD)? Quantos sem telefone?
- Qual número envia: o seu pessoal, o da empresa, ou um por atendente?
- O "CLIENTE" no nome do contato no celular corresponde a clientes que já estão no CRM?
- Teto diário inicial: 30 está bom?
