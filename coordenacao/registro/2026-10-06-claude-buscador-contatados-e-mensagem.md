# Buscador: contatados em ordem cronológica + mensagem padrão com saudação e modelo próprio

- **Quem:** Claude · **Quando:** 2026-10-06 · **Pedido:** Analice (sugestões 1 e 2)
- Contatados: aba "Contatados" ordena pelo contato mais recente (`sortByContactedDesc`),
  sem agrupar por município; ao contatar em "Para contatar" o cartão vai para o topo
  de "Contatados" (o balde já mudava; agora a posição é cronológica).
- Mensagem padrão: "Olá, {saudacao}! Aqui é {nome} da empresa Sal Vita de Mossoró-RN,
  tudo bem? Temos uma carreta indo {regiao} ..." — saudação pela hora (bom dia <12h,
  boa tarde <18h, boa noite), nome em minúsculas com inicial maiúscula.
- Modelo próprio por atendente: botão "Minha mensagem" (MessageTemplateDialog) edita o
  texto com campos {saudacao} {nome} {regiao} {sacos}, prévia e "Restaurar padrão".
  Salvo em `app_settings` chave `radar_msg_template:<userId>` — sem tabela/coluna nova,
  sem mexer em SCHEMA_VERSION. Procedures: prospectingRadar.messageTemplate / setMessageTemplate.
- LeadCard: texto = override manual/IA ?? padrão (acompanha o modelo salvo). CarteiraList idem.
- Testes: tests/contact-message.test.ts (+7). Gates: check, 429 testes, build ok.
