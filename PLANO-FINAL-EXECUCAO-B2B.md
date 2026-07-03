# PLANO FINAL — EXECUÇÃO CONTROLADA DA MÁQUINA DE PROSPECÇÃO B2B SEGURA

**Projeto:** Sal Vita Premium  
**Arquivo sugerido:** `PLANO-FINAL-EXECUCAO-B2B.md`  
**Objetivo:** orientar o agente executor a implementar a máquina B2B em fases seguras, começando pela fundação, inbound e correções críticas antes de qualquer automação de outbound/IA.

## 1. Contexto

Este documento é o plano final de execução para transformar o projeto atual da Sal Vita Premium em uma máquina B2B segura, escalável e orientada por IA assistiva.

O projeto atual já possui:

- e-commerce/funil de vendas;
- integração com Mercado Pago;
- envio de e-mails via Resend;
- hospedagem na Vercel;
- banco Neon;
- Evolution API/WhatsApp para fluxos existentes;
- confirmação de pedidos por e-mail e WhatsApp;
- geração de etiquetas via Melhor Envio;
- sistema interno de pedidos/admin.

O documento estratégico principal já está no repositório:

- `PLANO-PROSPECCAO-B2B.md`

O relatório de auditoria operacional também deve ser considerado:

- `RELATORIO-AUDITORIA-PREMIUM.md`

Este plano final NÃO substitui esses documentos. Ele define a ordem segura de execução para o agente Sonnet ou outro agente executor.

## 2. Princípio central

A Sal Vita não deve vender sal B2B como commodity.

A tese correta é:

> Sal comum é insumo. Sal Vita Premium deve ser vendido como posicionamento com recompra.

O B2B precisa focar em segmentos onde o produto agrega valor de prateleira, experiência, margem, narrativa e diferenciação.

Prioridade comercial:

1. Empórios, lojas naturais, casas de temperos e mercados premium.
2. Parrillas, churrascarias premium, casas de carne e restaurantes com finalização à mesa.
3. Peixarias premium e restaurantes especializados.
4. Distribuidores somente depois de validação real de recompra.

Regra importante:

> Distribuidor só deve ser abordado depois de existir prova de giro, idealmente 10+ empórios/clientes B2B recomprando.

## 3. Modelo operacional desejado

O modelo correto não é IA vendendo sozinha.

O modelo correto é:

> IA encontra, organiza, qualifica, prioriza, escreve rascunhos, resume respostas e sugere próximos passos. Humano aprova, negocia e fecha os melhores leads.

A IA deve atuar como SDR assistivo, não como robô de spam.

## 4. Regras absolutas de segurança

Estas regras são obrigatórias e não podem ser violadas por implementação, prompt ou automação.

### 4.1. Domínio principal protegido

O domínio principal `salvitarn.com.br` NÃO deve ser usado para cold outbound.

Motivo: proteger reputação do domínio usado para transacional, checkout, confirmação de pedidos, recuperação de carrinho e comunicação com clientes reais.

Para outbound B2B frio, usar domínio secundário dedicado.

Exemplos aceitáveis:

- `salvitapremium.com.br`
- `salvitab2b.com.br`
- `salvitapro.com.br`
- `salvitarevenda.com.br`

O domínio secundário deve ter:

- SPF;
- DKIM;
- DMARC;
- configuração no Resend ou provedor escolhido;
- reply-to monitorado;
- warmup gradual;
- limites diários baixos no início.

### 4.2. WhatsApp protegido

Não implementar cold WhatsApp automatizado.

A Evolution API existente deve continuar protegida para fluxos legítimos como:

- confirmação de pedido;
- recuperação de carrinho;
- suporte;
- pós-venda;
- handoff humano quando houver interesse real.

Proibido no MVP:

- disparo frio automático via WhatsApp;
- raspagem de números e contato em massa;
- cadências automáticas agressivas;
- mensagens para números pessoais sem contexto comercial.

### 4.3. Compliance e LGPD

A operação deve usar apenas dados empresariais/comerciais publicados publicamente ou fornecidos pelo próprio lead.

Obrigatório:

- registrar fonte pública do dado;
- registrar consentimento quando houver inbound;
- permitir opt-out/supressão;
- manter `suppression_list`;
- manter `audit_logs`;
- não enriquecer dados pessoais sensíveis;
- não usar dados pessoais de sócios para contato frio;
- não comprar listas;
- não fazer scraping agressivo.

### 4.4. Claims de saúde

Não usar mensagens de outbound com promessas de saúde.

Evitar copy agressiva como:

- “cura”;
- “melhora saúde”;
- “mais saudável”;
- “trata”;
- “previne”.

Preferir:

- sal marinho não refinado;
- origem em Mossoró/RN;
- minerais naturalmente presentes;
- produto premium nacional;
- diferenciação de mix;
- embalagem zip-lock;
- margem de revenda;
- experiência na finalização.

## 5. O que NÃO implementar no primeiro sprint

Mesmo que esteja previsto no documento estratégico, NÃO implementar ainda:

- Scout automático;
- Enricher automático;
- Google Places API em produção;
- scraping de Instagram/TikTok/Google;
- NVIDIA NIM;
- Groq/Cerebras/Gemini router;
- `llmRouter`;
- outbound por e-mail;
- Resend webhook para outbound;
- Copywriter agent;
- Conversation Analyst;
- Revenue Analyst;
- WhatsApp 1-clique;
- cadências;
- automação de follow-up;
- painel avançado de analytics;
- integração completa de concorrência;
- motor geográfico completo;
- motor de scoring completo.

O primeiro sprint é fundação, não escala.

## 6. Escopo obrigatório do primeiro sprint

O primeiro sprint deve implementar somente:

1. Correções críticas do `RELATORIO-AUDITORIA-PREMIUM.md` relacionadas a:
   - cron/reconcile;
   - confirmação automática de pagamento;
   - race condition ou falhas que impeçam pedido pago de ser refletido corretamente.
2. Schema B2B mínimo.
3. Tabelas essenciais de compliance e CRM B2B.
4. Página pública `/atacado`.
5. Endpoint de inbound B2B.
6. Registro de leads inbound.
7. Consentimento do formulário.
8. Audit log.
9. Suppression list básica.
10. Admin B2B simples para visualizar leads inbound.
11. Notificação interna quando lead B2B entrar.

## 7. Arquivos de referência obrigatórios

Antes de codar, o agente executor deve ler:

1. `CLAUDE.md`
2. `RELATORIO-AUDITORIA-PREMIUM.md`
3. `PLANO-PROSPECCAO-B2B.md`
4. Este arquivo: `PLANO-FINAL-EXECUCAO-B2B.md`

O agente deve seguir os padrões já existentes do projeto, especialmente para:

- estrutura de rotas;
- autenticação/admin;
- banco Neon;
- criação/garantia de tabelas;
- envio de e-mail;
- variáveis de ambiente;
- logs;
- tratamento de erros;
- deploy Vercel.

## 8. Plano técnico antes de codar

Antes de qualquer implementação, o agente executor deve responder com um plano técnico curto contendo:

1. Arquivos que serão criados.
2. Arquivos que serão alterados.
3. Tabelas exatas que serão criadas.
4. Rotas/endpoints que serão adicionados.
5. Como será feita a migração/garantia de schema.
6. Como será testado.
7. Quais áreas do sistema atual NÃO serão tocadas.
8. Confirmação explícita de que Scout, IA, outbound e WhatsApp frio não serão implementados no sprint.

Somente depois desse plano o agente deve codar.

## 9. Tabelas MVP recomendadas

O schema final deve respeitar o documento estratégico, mas o MVP deve ser pequeno.

### 9.1. `companies`

Representa empresas B2B.

Campos recomendados:

- `id`
- `name`
- `trade_name`
- `segment`
- `subsegment`
- `cnpj`
- `company_validation_status`
- `website`
- `instagram_url`
- `city`
- `state`
- `country`
- `source_type`
- `source_url`
- `pipeline_type` (`inbound` ou `outbound`)
- `pipeline_stage`
- `status`
- `created_at`
- `updated_at`

Valores sugeridos para `company_validation_status`:

- `unverified`
- `cnpj_valid`
- `cnpj_inactive`
- `duplicate`
- `invalid`

### 9.2. `contacts`

Representa contatos comerciais da empresa.

Campos recomendados:

- `id`
- `company_id`
- `name`
- `role`
- `email`
- `phone`
- `whatsapp`
- `channel_type`
- `is_public_business_contact`
- `source_url`
- `created_at`
- `updated_at`

Regra:

> Contato frio só pode usar canal comercial publicado, nunca dado pessoal sensível ou dado pessoal de sócio coletado de forma indireta.

### 9.3. `public_sources`

Registra origem dos dados.

Campos recomendados:

- `id`
- `company_id`
- `source_type`
- `source_url`
- `captured_at`
- `raw_excerpt`
- `confidence`

### 9.4. `consent_records`

Registra consentimento inbound.

Campos recomendados:

- `id`
- `company_id`
- `contact_id`
- `form_name`
- `consent_text`
- `consented_at`
- `ip_hash`
- `user_agent`

### 9.5. `suppression_list`

Lista de bloqueio/opt-out.

Campos recomendados:

- `id`
- `email`
- `phone`
- `domain`
- `company_id`
- `reason`
- `source`
- `created_at`

### 9.6. `audit_logs`

Auditoria operacional.

Campos recomendados:

- `id`
- `entity_type`
- `entity_id`
- `action`
- `actor_type`
- `actor_id`
- `metadata_json`
- `created_at`

### 9.7. `lead_scores` opcional no MVP

Pode ser criada no MVP se o admin já exibir uma pontuação inicial simples.

Campos recomendados:

- `id`
- `company_id`
- `fit_score`
- `intent_score`
- `geo_score`
- `readiness_score`
- `risk_score`
- `priority_score`
- `data_confidence`
- `score_version`
- `created_at`

No Sprint 1, esses campos podem ser preenchidos manualmente ou por regra simples, sem IA.

## 10. Pipeline separado: inbound e outbound

Separar claramente inbound e outbound.

### 10.1. Pipeline inbound

Lead que chega pelo formulário `/atacado` deve entrar como quente.

Fluxo sugerido:

```text
form_submitted → qualified → human_handoff → negotiating → won/lost
```

Regra:

> Lead inbound nunca entra em cadência fria. Lead inbound entra direto em SLA comercial.

### 10.2. Pipeline outbound futuro

Outbound só será implementado em sprint posterior.

Fluxo futuro:

```text
discovered → enriched → scored → approved_for_outreach → outreached → engaged → qualified → handoff
```

Não implementar esse fluxo no Sprint 1, apenas deixar o schema preparado se fizer sentido.

## 11. Página `/atacado`

A página `/atacado` é a prioridade máxima de aquisição.

Ela deve comunicar:

- Sal Vita Premium para revenda e food service;
- produto premium nacional;
- sal marinho não refinado de Mossoró/RN;
- embalagem zip-lock;
- diferenciação para prateleira/finalização;
- possibilidade de compra B2B/atacado;
- atendimento humano para tabela e condições.

Evitar promessas de saúde.

### 11.1. Campos do formulário

Campos mínimos:

- Nome da empresa
- Nome do responsável
- E-mail comercial
- WhatsApp comercial
- Cidade
- Estado
- Segmento
- Volume estimado ou interesse
- Mensagem opcional
- Checkbox de consentimento para contato comercial

Segmentos sugeridos:

- Empório / loja natural
- Casa de temperos
- Mercado premium
- Parrilla / churrascaria
- Casa de carnes
- Restaurante
- Peixaria
- Distribuidor
- Outro

### 11.2. Consentimento

Texto sugerido:

> Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.

O consentimento deve ser salvo em `consent_records`.

## 12. Endpoint inbound

Criar endpoint para receber o formulário.

Nome sugerido:

```text
/api/b2b/inbound
```

Responsabilidades:

1. Validar dados.
2. Normalizar e-mail/telefone.
3. Verificar `suppression_list`.
4. Criar/atualizar `company`.
5. Criar/atualizar `contact`.
6. Registrar consentimento.
7. Registrar audit log.
8. Definir `pipeline_type = inbound`.
9. Definir `pipeline_stage = qualified` ou equivalente.
10. Enviar notificação interna.
11. Retornar resposta amigável ao usuário.

## 13. Admin B2B simples

Criar tela administrativa simples para listar leads B2B inbound.

Campos para exibir:

- empresa;
- responsável;
- segmento;
- cidade/UF;
- e-mail;
- WhatsApp;
- data de entrada;
- estágio;
- mensagem/interesse;
- status de contato.

Ações mínimas:

- visualizar detalhe;
- marcar como contatado;
- marcar como qualificado;
- marcar como perdido;
- adicionar observação simples, se o padrão do projeto permitir.

Não precisa implementar CRM avançado no Sprint 1.

## 14. Notificação interna

Quando um lead `/atacado` entrar, o sistema deve notificar internamente.

Pode ser por:

- e-mail interno via Resend;
- painel admin;
- log/admin notification existente.

A notificação deve incluir:

- empresa;
- nome;
- e-mail;
- WhatsApp;
- segmento;
- cidade/UF;
- volume/interesse;
- link para abrir no admin.

Não enviar WhatsApp automático para o lead no Sprint 1, salvo se já existir padrão seguro de confirmação transacional e o usuário autorizar depois.

## 15. Correções críticas antes de escala

Antes de gerar ou importar leads B2B, corrigir os críticos do `RELATORIO-AUDITORIA-PREMIUM.md`, especialmente qualquer problema que afete:

- confirmação de pagamento;
- reconciliação de pedidos;
- status pago não refletido;
- cron quebrado;
- race condition;
- inconsistência de pedido.

Regra:

> Não adianta gerar lead B2B para um checkout onde pagamento não confirma sozinho.

## 16. Variáveis de ambiente

No Sprint 1, não adicionar variáveis de IA.

Podem ser necessárias variáveis para:

- e-mail interno de notificação;
- feature flag B2B;
- configurações do formulário;
- domínio/canonical se aplicável.

Não adicionar ainda:

- NVIDIA keys;
- Groq keys;
- Google Places API key;
- Cerebras keys;
- Gemini keys;
- chaves de scraping.

## 17. Testes obrigatórios

O agente executor deve testar:

1. Build/typecheck.
2. Criação/garantia das tabelas.
3. Submissão válida do formulário `/atacado`.
4. Submissão inválida do formulário.
5. Consentimento obrigatório.
6. Registro em `companies`.
7. Registro em `contacts`.
8. Registro em `consent_records`.
9. Registro em `audit_logs`.
10. Bloqueio por `suppression_list`, se aplicável.
11. Visualização no admin B2B.
12. Notificação interna.
13. Garantia de que checkout, CRM atual, email marketing atual e frete não foram quebrados.

## 18. Áreas que não devem ser tocadas sem necessidade

Não alterar, salvo para os críticos expressamente autorizados:

- checkout;
- Mercado Pago;
- Melhor Envio;
- CRM de lembretes existente;
- fluxos de e-mail marketing existentes;
- Evolution API existente;
- recuperação de carrinho;
- confirmação de pedido;
- páginas principais do funil;
- lógica de frete;
- lógica de pedidos.

Se alguma alteração for necessária nessas áreas, o agente deve justificar antes.

## 19. Commits pequenos

O agente deve trabalhar em commits pequenos.

Sugestão:

1. `fix: stabilize payment reconciliation critical issues`
2. `feat: add b2b core schema and audit tables`
3. `feat: add wholesale inbound endpoint`
4. `feat: add atacado landing page`
5. `feat: add b2b admin inbound leads view`
6. `test: validate b2b inbound flow`

Não fazer um commit gigante.

## 20. Definition of Done do Sprint 1

O Sprint 1 só está pronto quando:

- críticos operacionais do relatório foram corrigidos;
- `/atacado` está acessível;
- formulário funciona;
- lead entra no banco;
- consentimento é registrado;
- audit log é registrado;
- lead aparece no admin;
- notificação interna funciona;
- build/typecheck passa;
- nenhuma automação fria foi implementada;
- domínio principal não foi usado para outbound;
- WhatsApp não foi usado para cold outreach;
- o agente documentou o que foi feito e o que ficou para depois.

## 21. Sprint 2 — organização comercial

Somente depois do Sprint 1 validado.

Objetivo: transformar lead inbound em pipeline comercial simples.

Possíveis entregas:

- status mais refinados;
- tarefas de follow-up manual;
- human handoff;
- observações por lead;
- filtros por segmento/cidade/UF;
- campos de volume estimado;
- campos de potencial de recompra;
- upload/link de tabela comercial;
- modelo manual de resposta.

Ainda sem outbound em massa.

## 22. Sprint 3 — prospecção assistida manual

Objetivo: trabalhar 50–100 leads com alta qualidade antes de automatizar.

Possíveis entregas:

- import manual/CSV;
- deduplicação;
- classificação simples por segmento;
- score determinístico básico;
- campo de gap de mix manual;
- rascunho de copy manual ou semiassistido;
- aprovação humana antes de qualquer envio.

Regra:

> Antes de automatizar, validar manualmente segmento, oferta, copy, preço, frete e objeções.

## 23. Sprint 4 — IA e outbound seguro

Somente depois de validação manual.

Possíveis entregas:

- `llmRouter`;
- fallback Groq/NVIDIA NIM/Cerebras/Gemini;
- `agent_runs`;
- `prompt_versions`;
- Copywriter agent;
- Resend com domínio secundário;
- opt-out;
- bounce handling;
- caps diários;
- warmup;
- suppression;
- aprovação humana antes de envio.

Regra:

> Mensagem sem insight de concorrência/gap não sai no lote automático.

## 24. Sprint 5 — inteligência comercial avançada

Possíveis entregas:

- Motor de Concorrência;
- gap de mix;
- Inteligência Geográfica;
- Commercial Readiness Score;
- outcome reasons;
- ciclo de aprendizado;
- Conversation Analyst;
- Revenue Analyst.

Não antecipar isso no Sprint 1.

## 25. Tarefas humanas paralelas

Enquanto o agente executa Sprint 1, o humano deve cuidar de:

1. Comprar domínio secundário para outbound.
2. Configurar SPF/DKIM/DMARC.
3. Configurar domínio no Resend.
4. Preparar e-mail de reply-to.
5. Criar ou revisar tabela B2B.
6. Preparar PDF simples de revenda/food service.
7. Preparar fotos comerciais do produto.
8. Preparar política de amostras.
9. Preparar régua de preço sem hardcode no sistema.
10. Criar chave Google Places API somente com budget alert e restrição.

## 26. Política de preço

Não hardcodar preço em copy, templates ou agentes.

Qualquer preço deve vir de fonte controlada:

- tabela de preços;
- configuração admin;
- variável/registro no banco;
- documento comercial versionado.

Exemplos de mensagem devem usar placeholders:

```text
R$ [preco_atual]
[prazo_estimado]
[condicao_comercial]
```

## 27. Política de amostras

Não distribuir amostra sem critério.

Regra recomendada para futuro:

- apenas para ICP forte;
- decisor identificado;
- fit alto;
- cidade/frete viável;
- limite semanal;
- aprovação humana.

Sugestão futura de tabela:

```text
sample_policy
- segment
- min_fit_score
- min_geo_score
- max_samples_per_week
- requires_human_approval
```

Não implementar no Sprint 1, apenas considerar na modelagem futura.

## 28. Ativos comerciais mínimos

Antes de outbound, preparar:

- PDF de revenda;
- PDF food service;
- ficha técnica;
- fotos em alta;
- mini catálogo;
- tabela B2B;
- política de amostras;
- argumentos por segmento;
- objeções e respostas;
- prova social inicial quando houver.

Sem esses ativos, IA pode gerar lead, mas humano fica sem munição para fechar.

## 29. Prompt para o agente Sonnet executor

Copiar e colar para o agente executor:

```text
Leia obrigatoriamente:
1. CLAUDE.md
2. RELATORIO-AUDITORIA-PREMIUM.md
3. PLANO-PROSPECCAO-B2B.md
4. PLANO-FINAL-EXECUCAO-B2B.md

Não implemente o plano inteiro.

Primeiro sprint: execute somente a fundação B2B e os críticos operacionais.

Escopo permitido:
1. Corrigir os 3 críticos do RELATORIO-AUDITORIA-PREMIUM.md relacionados a cron/reconcile/race condition/confirmação automática de pagamento.
2. Criar o schema B2B mínimo conforme PLANO-FINAL-EXECUCAO-B2B.md.
3. Criar as tabelas MVP essenciais:
   - companies
   - contacts
   - public_sources
   - consent_records
   - suppression_list
   - audit_logs
   - lead_scores, se necessário para admin inicial
4. Criar ensureB2bTablesExist() seguindo o padrão existente do projeto.
5. Criar endpoint /api/b2b/inbound para receber formulário de atacado.
6. Criar página pública /atacado.
7. Criar admin B2B básico para visualizar leads inbound.
8. Criar audit log para toda entrada via /atacado.
9. Criar suppression básica.
10. Garantir que nada do CRM de lembretes, email marketing existente, frete, Melhor Envio, Evolution API ou checkout seja alterado fora dos críticos autorizados.

Não implementar ainda:
- Scout
- Enricher
- Google Places API
- NVIDIA NIM
- Groq/Cerebras/Gemini
- llmRouter
- outbound por e-mail
- Resend webhook de outbound
- Copywriter
- WhatsApp manual 1-clique
- Conversation Analyst
- Revenue Analyst
- automação de prospecção
- scraping

Antes de codar, entregue um plano técnico curto contendo:
1. arquivos que serão criados;
2. arquivos que serão alterados;
3. tabelas exatas;
4. rotas/endpoints;
5. estratégia de schema/migration;
6. testes que serão rodados;
7. confirmação explícita das áreas que não serão tocadas.

Depois implemente em commits pequenos.
Rode typecheck/build antes do push.
Ao final, entregue resumo do que foi feito, arquivos alterados, testes executados e próximos passos.
```

## 30. Erros fatais a evitar

1. Implementar IA antes do inbound.
2. Fazer outbound pelo domínio principal.
3. Automatizar WhatsApp frio.
4. Construir Scout/Enricher antes de validar manualmente o funil.
5. Hardcodar preço nas mensagens.
6. Usar claims de saúde.
7. Ignorar opt-out/suppression.
8. Comprar listas.
9. Escalar envio antes de corrigir checkout/reconcile.
10. Tentar vender para distribuidor antes de provar recompra.
11. Fazer um commit gigante.
12. Mexer em áreas críticas sem justificativa.
13. Deixar Places API sem budget alert.
14. Deixar IA decidir score final sem fórmula determinística.
15. Deixar mensagem sair sem gap/insight comercial no futuro.

## 31. Decisão final

O projeto deve avançar, mas com disciplina.

A primeira vitória não é ter um robô prospectando.

A primeira vitória é:

> Um lead B2B real preencher `/atacado`, entrar limpo no CRM, gerar notificação, ser atendido por humano e virar conversa comercial sem quebrar checkout, domínio, WhatsApp ou compliance.

Depois disso, automatizar fica muito mais seguro.

**Ordem final:**

```text
Corrigir críticos → /atacado → schema B2B → inbound → admin → validação manual → prospecção assistida → IA → outbound seguro → escala
```

Este é o caminho recomendado.
