# PLANO MESTRE — Máquina de Prospecção B2B Segura · SAL VITA PREMIUM

> Documento operacional. Público-alvo: o dono da operação + agente executor de engenharia.
> Regra de leitura: tudo marcado **[MVP]** entra nas primeiras 2 semanas. Tudo marcado **[F2+]** vem depois. Tudo marcado ⛔ é proibido.
> Infra assumida: Vercel free, Neon free, Resend free, Evolution API (VPS Oracle), cadeia de IA Groq→Cerebras→Gemini já existente no projeto.

---

# PARTE 1 — LEITURA BRUTAL DO MERCADO B2B

**A verdade incômoda primeiro:** sal é a commodity mais barata da cozinha. Sal industrial custa R$ 2–4/kg no atacado. Seu produto sai a R$ 14,99/kg na caixa. **Nenhum restaurante comum vai pagar 5× mais por um insumo invisível ao cliente dele.** Quem paga é quem **revende a história** (empório coloca seu pacote na prateleira com margem) ou quem **encena o produto** (parrilla finalizando a carne com sal premium à vista do cliente). O B2B do Sal Vita não é venda de insumo — é venda de **posicionamento com recompra**.

| Segmento | Urgência | Recompra | Ticket | Fricção | Canal de entrada | Veredito |
|---|---|---|---|---|---|---|
| Empórios / lojas naturais / casas de tempero | Alta (repõem prateleira todo mês) | Mensal | Caixa 10–30kg + reposição | Baixa (decisor = dono) | E-mail/WhatsApp publicado + visita | **PRIORIDADE A** |
| Churrascarias / parrillas / casas de carne | Média-alta (sal é insumo CENTRAL) | Mensal/quinzenal | 10–50kg/mês | Média (preço-sensível) | WhatsApp comercial publicado, indicação | **PRIORIDADE A** |
| Revendedores / distribuidores regionais | Baixa no início | Alta depois | O maior de todos | ALTA (esmaga margem, pede exclusividade, NF, prazo) | E-mail comercial, feiras | **PRIORIDADE B** — só com prova comercial de sell-out |
| Peixarias / rest. frutos do mar | Média (salga/finalização) | Mensal | 5–20kg | Média | WhatsApp/balcão | **PRIORIDADE B** |
| Restaurantes "proposta de qualidade" genéricos | Baixa | Média | 3–10kg | ALTA (sal invisível → não paga premium) | E-mail | **PRIORIDADE B−** — só vender o ângulo "sal de mesa/finalização com marca à vista" |
| Mercados independentes / hortifruti premium | Média | Mensal | Médio | Alta (exige EAN, NF, às vezes consignação) | Comprador da loja | **PRIORIDADE B** |
| Hotéis / pousadas gastronômicas | Baixa | Trimestral | Médio | Alta (compras centralizadas, ciclo lento) | E-mail formal | **PRIORIDADE C** |
| Zona cerealista / atacarejo de temperos | Média | Alta | Alto | Alta (guerra de preço pura) | Presencial | **PRIORIDADE C** — você perde no preço |

**Trade-offs duros:**
- **Empório é o melhor primeiro cliente**: compra a caixa de 10kg como *revenda* (10 pacotes de 1kg com sua marca), margem de ~100% para ele (compra a ~R$ 15/un equivalente, vende a R$ 29,90), recompra quando gira. Fricção quase zero: é uma decisão de R$ 150–300.
- **Parrilla compra volume mas negocia preço**: precisa de um SKU B2B (saco 5kg sem embalagem varejo) ou a conta não fecha. Se você só tem o pacote varejo de R$ 29,90, o argumento é "sal de finalização/mesa", não sal de preparo.
- **Distribuidor cedo demais é armadilha clássica**: ele pede 40–50% de desconto, exclusividade regional e prazo 30/60 dias — e você ainda não tem dados de giro para negociar. Adie.
- **Recompra > venda nova**: um empório que repõe 1 caixa/mês vale mais que 10 vendas B2C. A máquina inteira deve otimizar para a **segunda compra**.

# PARTE 2 — ICPs B2B REAIS

Mantidos 5 ICPs (descartados: hotéis, zona cerealista — fricção/preço matam o ROI agora).

### ICP-1 · Empório / Loja de produtos naturais / Casa de temperos — PRIORIDADE A
- **Perfil:** loja física ou insta-loja, 1–3 unidades, dono decide, vende granel/temperos/naturais, ticket médio do cliente final R$ 30–100. Cidades: capitais NE + SP/RJ/BH interior rico.
- **Dores:** prateleira precisa de novidade com margem; produtos naturais com boa embalagem e história vendem sozinhos; fornecedor pequeno some ou falha entrega.
- **Gatilhos:** cliente pedindo "sal rosa/sal grosso natural"; busca por produto regional autêntico; margem >80%.
- **Objeções:** "já tenho sal rosa do Himalaia" / "qual o giro?" / "tem NF? EAN?" / "preço vs granel".
- **Ticket provável:** R$ 150–450 (1–3 caixas). **Recompra:** mensal se girar.
- **Melhor canal inicial:** e-mail comercial publicado; WhatsApp comercial publicado (envio manual).
- **Argumento dominante:** "sal brasileiro premium de Mossoró, história real, margem de 100%, embalagem que se vende sozinha, pedido mínimo baixo (1 caixa)."
- **Risco operacional:** baixo. **Prioridade: A.**

### ICP-2 · Churrascaria / Parrilla / Casa de carnes premium — PRIORIDADE A
- **Perfil:** parrillas, steakhouses independentes, açougues boutique/dry aged. Decisor: chef/proprietário.
- **Dores:** diferenciação da experiência; sal parrillero importado caro; storytelling do prato.
- **Gatilhos:** cardápio menciona "sal de parrilla", cortes premium, dry aged; casa posta foto de finalização.
- **Objeções:** "meu sal grosso custa R$ 3/kg" / "qual a granulometria?" / "manda amostra".
- **Ticket:** R$ 150–600/mês. **Recompra:** mensal/quinzenal.
- **Canal inicial:** WhatsApp comercial publicado (manual) ou Instagram DM manual; e-mail se publicado.
- **Argumento dominante:** "sal de finalização de Mossoró — o cliente vê a marca na mesa; granulometria média/grossa perfeita p/ carne; amostra grátis para o chef testar."
- **Risco:** médio (preço-sensível; exige amostra). **Prioridade: A.**

### ICP-3 · Restaurante com proposta de qualidade — PRIORIDADE B
- **Perfil:** bistrôs, comida saudável, poke/mediterrâneo, menu autoral. 
- **Dores:** posicionamento saudável precisa de coerência até no sal; sal de mesa como item de marca.
- **Gatilhos:** cardápio fala "ingredientes selecionados/orgânicos/naturais"; moedor/sal na mesa.
- **Objeções:** preço vs invisibilidade; "sal é sal".
- **Ticket:** R$ 90–300. **Recompra:** mensal. **Canal:** e-mail.
- **Argumento:** "coerência de proposta: se o cardápio é natural, o sal também é — e o pacote na mesa/balcão vira conversa."
- **Risco:** médio-alto de não conversão. **Prioridade: B.**

### ICP-4 · Peixaria / Restaurante de frutos do mar — PRIORIDADE B
- **Perfil:** peixarias com balcão gourmet, restaurantes litorâneos de padrão médio-alto.
- **Dores:** salga e finalização em volume; narrativa "sal marinho + peixe do mar" é natural.
- **Gatilhos:** cardápio premium de pescado; venda de peixe salgado artesanal.
- **Objeções:** volume × preço; fornecedor local de sal grosso.
- **Ticket:** R$ 100–400. **Recompra:** mensal. **Canal:** WhatsApp publicado (manual).
- **Argumento:** "sal marinho de Mossoró para pescado — mesma origem, história redonda, granulometria para salga leve e finalização."
- **Risco:** médio. **Prioridade: B.**

### ICP-5 · Revendedor / Distribuidor / Food service — PRIORIDADE B (fase 3+)
- **Perfil:** distribuidores de naturais/gourmet regionais, reps comerciais, atacadistas de food service.
- **Dores:** portfólio precisa de itens com margem e giro comprovado.
- **Gatilhos:** "seja fornecedor" no site deles; catálogo com marcas artesanais.
- **Objeções:** desconto 40%+, exclusividade, prazo, logística, giro não provado.
- **Ticket:** R$ 1.500+ /pedido. **Recompra:** alta quando entra.
- **Canal:** e-mail comercial formal + tabela em PDF.
- **Argumento:** "sell-out provado em N empórios (dados reais da fase A), margem de canal, produto único de origem."
- **Risco:** alto de esmagar margem cedo. **Prioridade: B — ativar somente com ≥10 empórios recomprando.**

# PARTE 3 — O QUE NÃO FAZER

| ⛔ Prática | Por que parece boa | Por que é ruim | Risco |
|---|---|---|---|
| Cold WhatsApp em massa via Evolution API | "Grátis, direto, todo mundo lê" | Meta detecta padrão não-oficial + denúncias de spam = **ban do número em dias**. Evolution é não-oficial: tolerada para conversa, suicida para disparo frio | **CRÍTICO** — perda do canal + CPF/CNPJ associado |
| Disparar e-mail frio do domínio principal `salvitarn.com.br` | "Já tenho o domínio" | Uma leva de spam-report contamina o domínio que envia **e-mail transacional de pedido** — você quebra a operação B2C para tentar B2B | **CRÍTICO** |
| Comprar lista de e-mails/CNPJs | "Milhares de leads por R$ 99" | Dado sem base legal (LGPD), qualidade lixo, spam-traps que queimam domínio | **ALTO** — jurídico + reputação |
| Scraping massivo de Google Maps / Instagram | "IA raspa tudo sozinha" | Viola ToS, IPs bloqueados, dados desatualizados; custo de manutenção do scraper > valor. **Teoricamente possível, operacionalmente não-confiável** | ALTO |
| Automação de DM no Instagram/LinkedIn | "Onde os donos estão" | Detecção agressiva de automação = conta banida. Instagram é canal MANUAL | ALTO |
| Claims de saúde ("mais saudável", "menos sódio", "cura", "detox") | "Vende mais" | ANVISA/rotulagem: sal integral tem sódio ~igual. Claim falso = multa + processo de concorrente | **ALTO — jurídico** |
| Conversa 100% automatizada com lead B2B quente | "IA fecha sozinha" | Alucinação de preço/prazo em negociação = prejuízo real e reputação. IA sugere, humano envia | ALTO |
| Discador/robocall | — | Ilegal sem consentimento (telemarketing regulado), reputação péssima | ALTO |
| Vector store + RAG + orquestrador multi-agente no dia 1 | "Arquitetura impressionante" | Complexidade > retorno com <500 leads. Postgres + LLM resolve tudo nessa escala | MÉDIO — desperdício |
| Distribuidor como primeiro alvo | "Um pedido grande resolve" | Sem prova de giro você negocia de joelhos | MÉDIO — margem |

# PARTE 4 — GO-TO-MARKET B2B EM CAMADAS

| Camada | O quê | Automação | Humano |
|---|---|---|---|
| **1. Descoberta assistida por IA [MVP]** | Operador roda buscas guiadas (Google Places API + busca web); IA extrai, deduplica, classifica candidatos | IA extrai/organiza | Humano aprova a lista |
| **2. Enriquecimento + score [MVP]** | Worker visita site/página pública do lead, extrai sinais, calcula scores | 90% IA | Amostragem de auditoria |
| **3. Outbound seguro [MVP]** | E-mail de domínio secundário aquecido, 20–40/dia, copy por segmento gerada por IA, opt-out em tudo; WhatsApp SÓ manual 1-clique p/ números comerciais publicados | IA escreve, sistema envia e-mail | Humano aprova lotes; humano clica envio de WhatsApp |
| **4. Follow-up + qualificação [MVP simples]** | Respostas entram numa inbox; IA classifica intenção, sugere resposta, agenda follow-ups | IA classifica/sugere | Humano envia respostas sensíveis |
| **5. Handoff humano [MVP]** | Lead quente → resumo pronto + próxima ação sugerida → você fecha no WhatsApp/telefone | IA prepara o dossiê | Humano negocia e fecha |
| **6. Reativação + recompra [F2]** | Ciclo de reposição por segmento (30/45 dias), lembrete de recompra, tabela atualizada | IA agenda e redige | Humano aprova |

**Por que nessa ordem e não automação total:** (1) você ainda não sabe qual copy/segmento converte — automatizar antes de aprender é industrializar erro; (2) volume inicial é pequeno (centenas de leads) — o gargalo é qualidade, não braço; (3) os canais seguros exigem envio humano no WhatsApp de qualquer forma; (4) cada resposta real dos primeiros 100 contatos vale mais que 1.000 disparos — ela calibra o score e a copy das fases seguintes.

# PARTE 5 — FONTES DE LEADS: MATRIZ

| Fonte | Dado disponível | Sinal | Automação | Risco jurídico | Risco bloqueio | Custo | Utilidade | Observações |
|---|---|---|---|---|---|---|---|---|
| **Inbound do próprio site (/atacado)** | Nome, CNPJ, contato, interesse declarado | ★★★★★ | Total | Nenhum (consentimento) | Nenhum | R$ 0 | **A MELHOR** | Criar página /atacado com formulário. Lead já quente. |
| **Google Places API** | Nome, endereço, telefone, site, categoria, rating | ★★★★ | Alta (API oficial) | Baixo (dado público via API paga) | Nenhum | US$ 200 crédito/mês cobre ~3–5k lookups | **ALTA** | Rota legítima do "Google Maps". Text Search por "empório natural <cidade>". |
| Google Search (assistido) | Sites, notícias, "seja revendedor" | ★★★★ | Média (operador busca, IA extrai) | Baixo | Baixo em volume manual | R$ 0 | ALTA | Não automatizar crawling de SERP (ToS). |
| Sites institucionais + página de contato | E-mail comercial, WhatsApp, cardápio, catálogo | ★★★★★ | Alta (fetch de URL específica é ok) | Baixo (dado publicado p/ contato comercial = legítimo interesse) | Baixo | R$ 0 | **ALTA** | É o coração do enriquecimento. Respeitar robots.txt. |
| Páginas "seja revendedor" de CONCORRENTES | Lista de canais que compram a categoria | ★★★ | Manual | Baixo | — | R$ 0 | MÉDIA | Inteligência de mercado, não copie lista de clientes. |
| Diretórios comerciais públicos (associações, guias gastronômicos, Abrasel regional) | Nome + contato comercial | ★★★ | Média | Baixo | Baixo | R$ 0 | MÉDIA | Bom para churrascarias/restaurantes. |
| Marketplaces B2B (ex.: catálogos gourmet) | Presença da categoria | ★★ | Manual | Baixo | — | R$ 0 | BAIXA-MÉDIA | Mais útil como canal próprio futuro do que fonte. |
| Instagram comercial | Cardápio, posicionamento, WhatsApp no bio | ★★★★ | ⛔ SÓ MANUAL | Médio | ALTO se automatizar | R$ 0 | MÉDIA | Operador olha, IA nunca raspa. |
| WhatsApp comercial publicado | Canal direto | ★★★★ | ⛔ envio manual 1-clique | Médio (LGPD ok se comercial publicado + opt-out) | ALTO se automatizar | R$ 0 | ALTA c/ disciplina | Nunca em massa, nunca cold-first — preferir depois de e-mail sem resposta. |
| Formulários comerciais (do lead) | Canal oficial | ★★★ | Manual | Baixo | Baixo | R$ 0 | MÉDIA | Bom p/ hotéis/distribuidores. |
| E-mails comerciais publicados (contato@/comercial@) | Canal frio principal | ★★★★ | Alta | Baixo-médio (legítimo interesse B2B documentado + opt-out) | Baixo c/ domínio secundário aquecido | R$ 0 (Resend free 100/dia) | **ALTA** | Base do outbound. |
| Listas compradas | — | ★ | — | **ALTO** | ALTO | — | ⛔ NUNCA | — |

# PARTE 6 — SINAIS DE INTENÇÃO E FIT

**Fortes (+3):** página "atacado/revenda/seja parceiro" no site do lead; vende sal especial/temperos premium hoje; cardápio menciona sal de parrilla/finalização; pediu contato via formulário /atacado; catálogo com marcas artesanais correlatas; compra recorrente evidente (empório com reposição de granel).
**Médios (+2):** posicionamento "natural/saudável/artesanal" no site/bio; cortes premium/dry aged no cardápio; loja física com balcão de temperos; WhatsApp comercial dedicado; presença em guia gastronômico; múltiplas unidades.
**Fracos (+1):** rating alto no Maps (4.5+); fotos de pratos com finalização aparente; cidade em rota logística boa (NE, SP, RJ); Instagram ativo com produtos.
**Negativos (−2):** fast-food/delivery de baixo ticket; rede grande com compras centralizadas; atacarejo de preço; site fora do ar; sinal de porte MEI-instável (só perfil pessoal).
**Exclusão (kill):** CNPJ inativo; concorrente direto (salineira/marca de sal); já em suppression_list; pediu para não ser contatado; sem NENHUM canal comercial publicado (não force canal pessoal).

# PARTE 7 — SEGMENTAÇÃO INTELIGENTE

Cada lead recebe:

| Campo | Como é calculado |
|---|---|
| `segment` (icp1_emporio, icp2_carne, icp3_restaurante, icp4_pescado, icp5_distribuidor) | LLM classifica com rubrica fechada (few-shot) sobre nome+categoria Places+texto do site. Saída JSON com `segment` + `confidence`. |
| `subsegment` | Idem (ex.: icp1: granel / suplementos / temperos; icp2: parrilla / açougue / steakhouse) |
| `fit_score` 0–100 | Soma ponderada dos sinais da PARTE 6 (heurística determinística sobre flags booleanas extraídas pela IA — a IA extrai FATOS, a fórmula pontua. Nunca deixar o LLM "dar a nota" direto: não é reprodutível). |
| `urgency_score` 0–100 | Sinais de intenção ativa (página revenda, formulário respondido, resposta a e-mail) |
| `channel_score` 0–100 | Qualidade dos canais: e-mail comercial publicado (+40), WhatsApp comercial (+30), formulário (+15), só Instagram (+10) |
| `ease_score` 0–100 | Decisor acessível (negócio pequeno +), pedido mínimo compatível, cidade atendível |
| `repurchase_score` 0–100 | Por segmento (empório 90, parrilla 80, restaurante 60...) ajustado por porte |
| `risk_score` 0–100 (maior = pior) | Dado inferido sem confirmação (+), canal só pessoal (+), segmento preço-sensível (+), sinal de rede grande (+) |
| `data_confidence` 0–100 | % de campos com fonte pública verificada vs inferida; snapshot com URL de origem |

**Prioridade de fila** = `0.4*fit + 0.25*urgency + 0.15*channel + 0.1*repurchase + 0.1*ease`, filtrada por `risk_score < 60` e `data_confidence > 50`. Pesos são colunas em `followup_rules`, recalibráveis sem deploy.

---

# PARTE 7-B — MÓDULO DE INTELIGÊNCIA COMERCIAL (perfil profundo por segmento)

> O sistema não vende para "um lead" — vende para um COMPRADOR conhecido. O Enricher preenche este perfil tipado; o que não conseguir extrair fica `null` com `confidence`, nunca inventado.

### Perfil Empório / Loja Natural (`profile_emporio`)
| Campo | Tipo | Fonte | Uso comercial |
|---|---|---|---|
| `sku_range` (ex.: <100, 100–500, 500+) | enum | site/insta (estimado) | porte → tamanho do pedido inicial |
| `price_band` (econômico/médio/premium) | enum | preços visíveis no catálogo | argumento de margem vs posicionamento |
| `has_premium_products` | bool | catálogo | fit direto |
| `salt_mix` (rosa, flor de sal, kosher, marinho, grosso, Mossoró, nenhum) | array | catálogo/insta | **motor de concorrência (7-C)** |
| `sells_kits` | bool | catálogo | oferta de kit Sal Vita |
| `sells_online` | bool | site/marketplace | canal de reposição + prova de operação |
| `accepts_new_suppliers` | bool/null | página fornecedores | prontidão |
| `recent_launches` | bool | posts recentes | readiness (7-E) |
| `repurchase_probability` | derivado | segmento+porte+giro estimado | score de recompra |

### Perfil Parrilla / Casa de Carnes (`profile_carne`)
| Campo | Uso |
|---|---|
| `premium_cuts` (bool), `dry_aged` (bool), `argentine_cuts` (bool) | fit de finalização premium |
| `uses_flor_de_sal` / `uses_parrilla_salt` | concorrência + ângulo de upgrade |
| `avg_ticket_estimate` (R$), `capacity_seats` (estimado) | volume potencial mensal |
| `audience_class` (A/B/C) | willingness to pay |
| `active_social` (bool, freq. posts) | canal + vaidade gastronômica (chef que posta finalização compra sal bonito) |
| `gastronomic_differentiator` (texto curto) | personalização da copy |

### Perfil Food Service / Revenda (`profile_foodservice`)
| Campo | Uso |
|---|---|
| `buys_by_case` (bool), `monthly_purchase` (bool) | compatibilidade com caixa 10kg |
| `has_distributor` (bool/nome) | concorrência de canal — se tem distribuidor forte, entrar por ele depois |
| `units_count` (int) | multiplicador de volume |
| `purchase_decision_maker` (dono/chef/comprador) | quem abordar e tom |
| `replenishment_cycle_days` (est.) | timing de follow-up e recompra |

# PARTE 7-C — MOTOR DE CONCORRÊNCIA

Antes de QUALQUER contato, o Enricher responde 5 perguntas sobre o lead:
1. **Quais sais ele já vende/usa?** (rosa, flor de sal, kosher, marinho, grosso comum, defumado)
2. **Já tem sal de Mossoró/RN ou marca regional?** (se sim: ângulo muda para "compare", risco maior)
3. **Faixa de preço praticada na categoria?** (R$/kg visível em catálogo)
4. **Posicionamento premium ou econômico?**
5. **Gap identificado?** (ex.: tem rosa e flor de sal, NÃO tem marinho integral brasileiro)

Saída → tabela `competitor_presence` (lead_id, salt_type, brand, price_seen, source_url, seen_at). A copy usa o GAP, nunca ataque direto a marca:
> "Vi que vocês trabalham sal rosa e flor de sal — não encontrei na linha um sal marinho integral brasileiro. O nosso é de Mossoró/RN, +80 minerais, margem de ~100% no varejo. Faz sentido complementar o mix?"

**Regra:** mensagem SEM insight de concorrência/gap = não sai no lote automático; volta para fila manual. Personalização real é o diferencial da máquina inteira.

# PARTE 7-D — INTELIGÊNCIA GEOGRÁFICA

`geo_score` (0–100) composto por:
| Fator | Fonte | Peso |
|---|---|---|
| Custo+prazo de frete estimado até o CEP do lead | **reusar a tabela `REGIONS` que já existe no projeto** (PAC/SEDEX por UF) | 40% |
| UF/região estratégica (NE > SE > S > CO > N, ajustável) | cadastro | 20% |
| Densidade de alvos na cidade (leads descobertos na mesma praça) | contagem interna | 20% — praça densa = campanha por cidade + frete consolidado |
| Sazonalidade regional (litoral no verão, churrasco em festas, junino no NE) | calendário estático em `followup_rules` | 10% |
| Distribuidor parceiro ativo na região (futuro) | tabela parceiros | 10% |

Uso prático: campanhas por PRAÇA (ex.: "20 empórios de Fortaleza esta semana") — copy cita a cidade, frete real na proposta, e possibilita consolidar entregas.

# PARTE 7-E — COMMERCIAL READINESS SCORE (gate pré-outreach)

Fit alto ≠ pronto para comprar. Antes de aprovar outreach, pontuar prontidão:
| Sinal (+) | Pontos |
|---|---|
| Catálogo/cardápio atualizado nos últimos 60 dias | +20 |
| Expansão: nova unidade/reforma/mudança anunciada | +20 |
| Campanha promocional ativa | +10 |
| Área comercial/compras identificável (e-mail comercial@, "fornecedores") | +25 |
| Vaga aberta (cozinha/compras/loja) | +10 |
| Posts pedindo indicação de fornecedor / novidade | +15 |

`readiness < 40` → estágio `nurture` (re-checar em 45 dias), NÃO outreach. Isso corta o desperdício de contato em quem não vai responder e protege a reputação do domínio.

---

# PARTE 8 — CRM E MODELO DE DADOS

> Banco: **schema `b2b` no mesmo Neon** (isola do transacional, zero custo novo). Padrão de criação: `ensureB2bTablesExist()` idêntico ao `ensureOrdersTablesExist()` já existente. Driver neon-http (sem transações → updates condicionais idempotentes). Convenção: `id serial PK`, `created_at/updated_at`, snake_case.

### Núcleo [MVP]
| Entidade | Finalidade | Campos principais | Relações / índices / constraints |
|---|---|---|---|
| `companies` | Empresa-alvo (1 linha por CNPJ/negócio) | name, cnpj?, segment, subsegment, city, uf, postal_code?, website, instagram, phone, whatsapp_commercial, email_commercial, address, places_id UNIQUE, status(pipeline), priority, owner('ai'/'human') | idx(status), idx(segment,uf), UNIQUE(places_id), UNIQUE(cnpj) nullable. Flag `risk_flags jsonb` |
| `contacts` | Pessoas da empresa | company_id FK, name, role(dono/chef/comprador), email, phone, source_url, is_decision_maker, consent_basis | idx(company_id); e-mail pessoal sem base legal ⇒ NÃO armazenar |
| `public_sources` | De onde veio cada dado | company_id, source_type(places/site/instagram/directory/inbound), url, fetched_at | auditoria LGPD: todo dado aponta para fonte |
| `source_snapshots` | Conteúdo bruto coletado | source_id FK, raw_text (truncado 20k), content_hash | dedup por hash; retenção 180d |
| `lead_profiles` | Perfil comercial tipado (PARTE 7-B) | company_id UNIQUE, profile jsonb (campos por segmento), extraction_confidence, extracted_at | a IA só escreve AQUI o que tem fonte |
| `competitor_presence` | Motor de concorrência (7-C) | company_id, salt_type, brand?, price_seen?, positioning, source_url, seen_at | idx(company_id); base do ângulo de copy |
| `lead_scores` | Scores versionados | company_id, fit, urgency, channel, ease, repurchase, geo, readiness, risk, data_confidence, priority (derivado), weights_version, scored_at | manter histórico (não sobrescrever): idx(company_id, scored_at desc) |
| `suppression_list` | NUNCA contatar | email?, phone?, domain?, company_id?, reason(opt_out/bounce/complaint/manual), suppressed_at | UNIQUE parciais; checada ANTES de todo envio — constraint de aplicação obrigatória |
| `consent_records` | Base legal por contato | contact_id/company_id, basis(legitimate_interest/consent_inbound), evidence_url, recorded_at | inbound = consentimento; publicado = legítimo interesse documentado |
| `audit_logs` | Trilha de tudo | actor(ai_agent/human/system), action, entity, entity_id, payload jsonb, at | append-only; idx(entity,entity_id) |

### Outreach [MVP]
| Entidade | Finalidade | Campos-chave |
|---|---|---|
| `outreach_sequences` | Cadência por segmento | segment, name, steps_count, active, daily_cap |
| `outreach_steps` | Passo da cadência | sequence_id, step_no, channel(email/whatsapp_manual), wait_days, template_key, requires_human(bool) |
| `touchpoints` | Cada contato feito | company_id, step_id?, channel, direction(out/in), subject?, body, status(queued/sent/delivered/bounced/replied/opted_out), message_id?, sent_by(ai/human), at | idx(company_id, at); UNIQUE(message_id) |
| `conversations` | Thread agrupada | company_id, channel, last_direction, last_at, heat(cold/warm/hot), state |
| `conversation_summaries` | Resumo vivo | conversation_id UNIQUE, summary, facts_permanent jsonb, facts_temporary jsonb (com TTL), next_best_action, updated_at |
| `intent_signals` | Intenção detectada | company_id, signal(pediu_tabela/pediu_amostra/perguntou_preco/pediu_prazo...), confidence, source_touchpoint_id, at |
| `objections` | Objeções estruturadas | company_id, objection_code (taxonomia 14-B), detail, at |
| `outcome_reasons` **[aprendizado comercial]** | Desfecho estruturado de cada conversa | company_id, outcome(won/lost/paused), reason_code(preco_alto/ja_tem_fornecedor/sem_espaco/produto_desconhecido/retornar_em/sem_resposta/outro), detail, at | alimenta recalibração |
| `human_handoffs` | Pedido de humano | company_id, conversation_id, reason, dossier (resumo pronto), priority, status(open/done), sla_due_at |
| `tasks` | Tarefas operacionais | assignee(human/ai), type, company_id?, due_at, status, notes |

### Comercial [MVP parcial]
| Entidade | Finalidade |
|---|---|
| `offers` | Proposta enviada: company_id, items jsonb, total, valid_until, status. **Criada por humano ou aprovada por humano — IA nunca emite preço sozinha** |
| `price_tables` | Tabelas por canal (varejo/empório/food service/distribuidor), versão, PDF url |
| `samples` | Amostras: company_id, sent_at, tracking, feedback, converted(bool) — amostra é o CAC mais barato do ICP-2 |
| `coupons` / `payment_links` | **REUSAR as tabelas/fluxos existentes do e-commerce** (cupom + link MP) referenciando company_id |
| `followup_rules` | Parâmetros vivos: pesos de score, caps diários, cooldowns, calendário sazonal | 

### AI Ops [MVP]
| Entidade | Finalidade |
|---|---|
| `agent_runs` | Toda execução de agente: agent, input_ref, output_ref, model, provider, tokens_in/out, cost_estimate, latency_ms, status, error?, at — **observabilidade central** |
| `prompt_versions` | prompt_key, version, body, active — copy/rubrica versionada; `agent_runs` referencia a versão usada |

# PARTE 9 — PIPELINE DE CRM

`discovered → screened → enriched → scored → nurture | approved_for_outreach → outreached → engaged → qualified → human_handoff → negotiating → won | lost → dormant → reactivation_pool`

| Transição | Gatilho | Automático? |
|---|---|---|
| discovered→screened | dedup ok + segmento classificado + não-suppression | Sim |
| screened→enriched | Enricher terminou com data_confidence>50 | Sim |
| enriched→scored | Scorer rodou (inclui geo + readiness + concorrência) | Sim |
| scored→approved_for_outreach | priority≥limiar E readiness≥40 E risk<60 **E aprovação humana do lote** [MVP] | Semi |
| scored→nurture | readiness<40 | Sim (re-score a cada 45d) |
| approved→outreached | 1º touchpoint enviado | Sim (email) / manual (WA) |
| outreached→engaged | Qualquer resposta inbound | Sim |
| engaged→qualified | intent_signal forte (pediu tabela/amostra/preço) | Sim |
| qualified→human_handoff | Regra da PARTE 19 | Sim (cria handoff, notifica) |
| handoff→negotiating→won/lost | Ações humanas; won = pedido criado no e-commerce (link com order id) | Manual |
| lost→reactivation_pool | outcome_reason permite (ex.: "retornar_em") | Sim, com data |
| qualquer→dormant | 3 toques sem resposta + cooldown 60d | Sim |

# PARTE 10 — ARQUITETURA DO SISTEMA

```
[Admin B2B — página nova no host premium (/sal-vita-b2b), padrão SalVitaRecovery]
        │ tRPC (router b2b no Express serverless existente)
        ▼
[api/index.ts — Vercel Function única já existente]
  ├── tRPC b2b.* (CRUD, filas, aprovação, inbox, handoff)      → SÍNCRONO
  ├── /api/cron/b2b-engine  (worker geral em lotes pequenos)   → ASSÍNCRONO
  ├── /api/webhooks/resend  (delivery/bounce/complaint)        → INGESTÃO
  └── /api/b2b/inbound      (formulário /atacado)              → INGESTÃO
        │
        ▼
[Neon Postgres — schema b2b]  ← fila = tabelas com status + SELECT ... SKIP LOCKED-like
        │                        (updates condicionais; sem Redis, sem queue externa)
        ▼
[Provedores]: Places API · Resend (domínio secundário) · LLM router (Groq/NIM/Cerebras/Gemini)
[Scheduler]: cron-job.org (grátis) → chama /api/cron/b2b-engine a cada 15min com CRON_SECRET
             (Vercel Hobby só dá cron diário — honesto: use externo)
[Observabilidade]: agent_runs + audit_logs + alerta diário via e-mail interno/WhatsApp próprio
[Guardrails]: middleware único checkGuardrails() antes de QUALQUER envio:
  suppression → cooldown → cap diário → base legal → opt-out no corpo → requires_human?
```

**Comunicação:** admin fala só tRPC; workers processam lotes de 5–15 itens por invocação (padrão já usado na recuperação de carrinho) re-agendados pelo cron; nada de long-running. **Síncrono:** UI, aprovação, inbox. **Assíncrono:** enriquecimento, scoring, envio, sumarização, aprendizado.

# PARTE 11 — STACK LOW-COST

| Camada | Principal | Alt 1 | Alt 2 | Custo | Risco | Por quê |
|---|---|---|---|---|---|---|
| Frontend admin | Página React no projeto atual (wouter+shadcn) | — | — | R$0 | Baixo | Padrão já dominado |
| Backend | Express serverless atual + tRPC | — | — | R$0 | Baixo | Zero infra nova |
| Auth | JWT cookie existente (admin) | — | — | R$0 | Baixo | Reuso |
| Banco | Neon (schema b2b) | 2º projeto Neon | Supabase free | R$0 | Baixo | Isola sem custo |
| ORM | Drizzle | — | — | R$0 | Baixo | Padrão do projeto |
| Filas | Postgres status+locks | Upstash QStash free | — | R$0 | Baixo | Escala atual não pede broker |
| Cron | cron-job.org + CRON_SECRET | GitHub Actions schedule | Upstash cron | R$0 | Baixo-médio (SPOF externo) | Vercel Hobby limita a diário |
| Rate limit | express-rate-limit (já há) + caps em followup_rules | — | — | R$0 | Baixo | |
| Cache | Tabela cache no PG (hash→resposta LLM) | Upstash Redis free | — | R$0 | Baixo | Cache semântico simples |
| Storage (PDF tabela) | Vercel blob free / repo público | Cloudflare R2 free | — | R$0 | Baixo | |
| Logs/monitoramento | agent_runs + Vercel logs | Axiom free | Logtail free | R$0 | Médio (retenção curta Vercel) | Começar simples |
| E-mail outbound | **Resend com DOMÍNIO SECUNDÁRIO** (ex.: salvitapremium.com.br) | Brevo free 300/d | Amazon SES | R$0 (100/d) | Baixo c/ warmup | Separação total do transacional |
| WhatsApp | Evolution (VPS Oracle) **somente warm/manual** | WA Business App oficial no celular | Cloud API oficial (futuro) | R$0 | ALTO se cold | Disciplina de canal |
| LLM | Roteador (PARTE 13): Groq + NVIDIA NIM + Cerebras + Gemini | OpenRouter free tier | — | ~R$0–50/mês | Médio (rate limits) | Fallback multi-chave |
| Embeddings [F2] | NIM/nvidia embed ou gemini-embedding free | — | — | R$0 | Baixo | Só quando >2k leads |
| Vector store [F2] | pgvector no Neon | — | — | R$0 | Baixo | Sem serviço novo |
| Analytics | Views SQL + página admin | Metabase self-host | — | R$0 | Baixo | |
| Feature flags | followup_rules (jsonb) | — | — | R$0 | Baixo | |
| Alertas | E-mail interno + WhatsApp próprio | ntfy.sh | — | R$0 | Baixo | |
| Captcha (form /atacado) | Cloudflare Turnstile | hCaptcha | — | R$0 | Baixo | Anti-bot no inbound |

# PARTE 12 — AGENTES DE IA (6, enxutos)

| Agente | Objetivo | Entrada | Saída | Quando roda | Latência ok | Custo/lead | Falha & fallback | NÃO roda quando | Logs |
|---|---|---|---|---|---|---|---|---|---|
| **Scout** | Transformar busca (Places/URLs coladas pelo operador) em candidatos dedupados e classificados | resultados Places / lista de URLs | linhas em companies (discovered) + segment | sob demanda (operador) | 30s/lote | ~R$0,001 | erro de classif.→segment null p/ revisão | fonte proibida (Instagram scrape) | agent_runs + fonte |
| **Enricher** | Visitar site/página pública e preencher lead_profiles + competitor_presence + sinais | company_id + URLs | perfil tipado + snapshots + confidences | cron, fila enriched | 60s/lead | ~R$0,005 | site fora→marca low confidence, segue | robots.txt proíbe; suppression | run + urls fetched |
| **Profiler/Scorer** | Calcular todos os scores (fórmulas determinísticas sobre fatos extraídos) | profile+signals+geo+readiness | lead_scores versionado | após enrich; re-score semanal | 5s | ~R$0 (heurística; LLM só p/ campos faltantes) | dado faltando→data_confidence baixo | — | pesos usados (weights_version) |
| **Copywriter** | Gerar e-mail/mensagem por segmento usando GAP de concorrência + cidade + perfil | company + profile + competitor gap + template versão | draft de touchpoint (nunca envia) | ao aprovar lote | 10s | ~R$0,003 | sem gap identificado→volta p/ fila manual | claims de saúde detectados (lint de palavras proibidas) | prompt_version + draft |
| **Conversation Analyst** (inclui memória + handoff assist) | Classificar resposta inbound: intenção, objeção, heat; atualizar summary; propor next best action; montar dossiê de handoff | touchpoint inbound + summary atual | intent_signals + objections + outcome_reasons + summary novo + (opcional) human_handoff | webhook/inbox, on-reply | 20s | ~R$0,004 | dúvida→heat=warm + handoff conservador | — | classificação + confidence |
| **Revenue Analyst** | Relatório semanal: funil, custo IA, taxa resposta por segmento/copy, recalibração sugerida de pesos (14-B) | agrego SQL + outcome_reasons | relatório md + proposta de novos pesos (humano aprova) | cron semanal | 2min | ~R$0,02/sem | — | — | run completo |

# PARTE 13 — ESTRATÉGIA DE LLM LOW-COST (roteamento explícito)

**Tabela de roteamento tarefa → modelo:**
| Tarefa | 1ª opção | Fallbacks (ordem) | Por quê |
|---|---|---|---|
| Planejamento/decisões complexas (raro: desenho de campanha, recalibração) | Modelo forte sob demanda (ex.: Claude via sessão de agente / plano pago pontual) | Gemini 2.x Pro free tier | Qualidade importa, volume é mínimo |
| Classificação/extração/sumarização (o grosso do volume) | Groq llama-3.3-70b (free/barato, rápido) | **NVIDIA NIM** (build.nvidia.com, llama/mistral — free tier c/ rate limit) → Cerebras → Gemini Flash | Custo ~zero, latência baixa |
| Copy de e-mail/WhatsApp | Groq llama-3.3-70b | NIM → Gemini Flash | Copy curta não precisa de modelo caro |
| Embeddings [F2] | Gemini embedding (free) | NIM embedqa | Só com >2k leads |
| **Honestidade sobre NIM:** endpoint OpenAI-compatível, bom para llama; free tier tem rate limit por chave — é FALLBACK/segunda perna, não fundação. Não usar em nada que precise de SLA. |

**Mecânica do roteador (módulo único `llmRouter.ts`):**
- Config por tarefa: `[{provider, model, key_env, max_rpm}]`; tenta em ordem; **retry 1×** por provedor (backoff 2s); pula para o próximo em 429/5xx/timeout(15s).
- **Circuit breaker:** 3 falhas seguidas → provedor "aberto" por 10min (flag em memória + persistida em followup_rules).
- **Cache:** hash(prompt_version + input normalizado) → resposta em tabela `llm_cache` (hit típico em re-scoring e re-classificação). TTL 30d.
- **Versionamento:** todo call referencia `prompt_versions.version`; mudou prompt → cache invalida naturalmente (hash muda).
- **Custo:** `agent_runs.cost_estimate` somado por dia; **teto diário configurável (ex.: R$ 5/dia)** → estourou, engine pausa tarefas não-críticas e alerta. Proteção contra loop-gastador.
- **Troca automática de provedor:** métrica móvel de erro/latência por provedor nos últimos 50 calls; se p95>10s ou erro>20%, rebaixa prioridade automaticamente (persistido).

| | Arquitetura simples (MVP) | Robusta (F3+) |
|---|---|---|
| Roteamento | Lista ordenada fixa por tarefa | Score dinâmico custo×latência×qualidade |
| Cache | Hash exato em PG | Semântico c/ embeddings + pgvector |
| Breaker | Contador em followup_rules | Por chave, half-open, painel |
| Custo | Soma diária + teto | Orçamento por campanha + previsão |
| Qualidade | Amostragem manual semanal | Avaliador automático + golden set |
| **Veredito** | **Suficiente até ~5k leads/mês** | Só quando volume justificar |

# PARTE 14 — MEMÓRIA COMERCIAL

Por lead (em `conversation_summaries` + tabelas estruturadas):
- **Fatos permanentes** (`facts_permanent`): decisor="João, dono", segmento, cidade, mix de sais, restrições ("só compra com NF"). Só entram com fonte (touchpoint ou URL). 
- **Fatos temporários** (`facts_temporary`, cada um com `expires_at`): "de férias até 15/08", "reforma da loja", "pediu retorno em setembro".
- **Estado atual:** intenção (intent_signals mais recente), objeções abertas, estágio de negociação, heat (cold/warm/hot), qualidade do contato (respondeu? decisor?), último toque, próximo melhor passo (`next_best_action` — sugestão, humano decide), promessas feitas ("enviar tabela até sexta" → vira task com due), links já enviados (dedupe de conteúdo), resumo de 5–8 linhas.

**Anti-poluição / anti-alucinação operacional:**
1. LLM escreve APENAS nos campos de memória — nunca em preço, oferta, status de pipeline críticos.
2. Todo fato carrega `source_touchpoint_id`; fato sem fonte é descartado no parse (schema JSON estrito com validação).
3. Resumo é REGENERADO do zero a partir dos últimos N touchpoints + fatos estruturados (não "resumo de resumo" — evita deriva).
4. Fatos temporários expiram sozinhos; job semanal limpa.
5. Promessa de preço/prazo detectada na saída da IA → bloqueada pelo lint de guardrails, vira handoff.

# PARTE 14-B — CICLO DE APRENDIZADO COMERCIAL

Cada resposta/desfecho vira dado estruturado (`outcome_reasons` + `objections` com taxonomia fechada):
`preco_alto · ja_tem_fornecedor · sem_espaco_prateleira · produto_desconhecido · quer_amostra · pediu_retorno_em(data) · sem_interesse_generico · comprou_pela_margem · comprou_pela_historia · comprou_pelo_gap_mix`

Job semanal (Revenue Analyst):
1. Taxa de resposta e de qualificação por segmento × praça × versão de copy × faixa de score.
2. Compara previsão do score com desfecho real → propõe ajuste de pesos (delta máx ±15% por ciclo, com trilha em followup_rules).
3. Objeção dominante por segmento → sugere mudança de ângulo na copy (nova prompt_version, A/B contra a atual).
4. **Humano aprova a recalibração** — o sistema aprende, mas não se auto-reescreve sem supervisão até ter ≥300 conversas (antes disso, amostra pequena = ruído).

# PARTE 15 — CANAIS, LIMITES E COMPLIANCE

| Canal | Quando usar | Quando NÃO | Volume seguro | Risco bloqueio | Risco jurídico | Risco reputação |
|---|---|---|---|---|---|---|
| E-mail comercial (domínio secundário) | 1º toque frio p/ e-mail comercial publicado; follow-ups | E-mail pessoal; sem opt-out; domínio principal | Semana 1–2: 10–20/d (warmup) → 40/d → máx 80/d (Resend free=100/d) | Baixo c/ SPF+DKIM+DMARC | Baixo (legítimo interesse doc. + opt-out 1 clique) | Baixo |
| Formulário comercial do lead | Hotéis/distribuidores/rede | Automatizar submissão em massa | Manual, ~10/d | — | Baixo | Baixo |
| WhatsApp comercial (Evolution) | Responder inbound; lead que respondeu e-mail; nº comercial publicado c/ envio MANUAL 1-clique | **Cold em massa; listas; automação de 1º contato** ⛔ | ≤20 conversas NOVAS/d por número; nº separado do principal | **ALTO** (não-oficial) | Médio (ok c/ opt-out e comercial) | Alto se parecer spam |
| Ligação assistida por humano | Lead hot que não fecha por texto; handoff | Robocall ⛔ | 5–10/d | — | Baixo | Baixo |
| Resposta a inbound (/atacado) | SEMPRE, prioridade máxima, SLA 2h útil | — | Ilimitado | — | Nenhum | — |
| Remarketing interno (base própria B2C→B2B: compradores PJ/recorrentes da loja) | Convite "revenda/atacado" p/ quem já comprou | Comprar audiência | Baixo | — | Baixo (relação existente) | Baixo |

**Guardrails obrigatórios (middleware único, sem exceção):**
1. **Opt-out** em todo e-mail ("não quer receber? responda SAIR" + link) e respeitado em WhatsApp ("SAIR") → suppression imediata + confirmação.
2. **Suppression check** antes de todo envio (e-mail, domínio, telefone, company).
3. **Cooldown:** máx 1 toque/canal/5 dias; máx 3 toques frios totais; depois dormant 60d.
4. **Cap diário** por canal e por número/remetente (followup_rules).
5. **Validação humana:** todo lote frio; toda mensagem com preço/prazo; todo lead `risk_score≥60`.
6. **Bloqueio de repetição:** hash do corpo por destinatário — nunca a mesma mensagem 2×.
7. **Auditoria:** touchpoints + audit_logs imutáveis; quem enviou (ai/humano), quando, com que base legal.
8. **Base legal taggeada** em consent_records (legitimate_interest c/ evidência da publicação do contato; consent p/ inbound).
9. **Retenção/exclusão:** snapshots 180d; lead lost sem interação 12m → anonimizar contatos; pedido de exclusão (LGPD) → apagar contatos + manter linha mínima em suppression (obrigação legal de não recontatar).

---

# PARTE 16 — PLAYBOOKS POR SEGMENTO

### PB-1 · Loja de produtos naturais
- **Dor:** prateleira precisa de novidade premium com margem; sal especial vende mas é importado/caro.
- **Tese:** sal brasileiro premium com história real, margem ~100%, pedido mínimo 1 caixa.
- **Abertura:** gap do mix (7-C): "tem rosa/flor de sal, falta marinho integral BR".
- **Prova:** foto de prateleira de cliente + giro real ("repõe em ~30 dias") quando existir; antes disso, a própria embalagem/janela.
- **CTA:** "Te envio a tabela de revenda + 1 caixa teste?" · **FUP1 (d+4):** margem em números · **FUP2 (d+9):** kit + frete da praça · **Pausa:** 3 toques → dormant 60d · **Humano:** pediu tabela/amostra/preço.
- **Objeções→respostas:** "já tenho rosa"→"rosa é importado; o nosso é BR, história local, preço melhor e margem maior"; "qual giro?"→dados reais ou caixa teste sem risco; "NF/EAN?"→"NF sim; EAN [status real — NÃO prometer se não tiver]".
- **Oferta:** caixa 10kg (10×1kg) preço revenda + frete real + sugestão de PDV.

### PB-2 · Empório/gourmet
Igual PB-1 com ângulo "curadoria": "produto com origem e história p/ sua seleção". Oferta: kit misto + display. Objeção extra: "meu público quer importado"→"regional premium é tendência; Mossoró = 95% do sal BR".

### PB-3 · Restaurante proposta de qualidade
- **Dor:** coerência do posicionamento natural até na mesa. **Tese:** sal de mesa/finalização com marca à vista = detalhe que vira conversa.
- **Abertura:** citar prato/posicionamento real do cardápio. **CTA:** amostra p/ chef. **FUP1:** uso em finalização; **FUP2:** silêncio→pausa (segmento B−, não insistir).
- **Humano:** chef respondeu. **Objeção "sal é sal"**→"na finalização a granulometria e o mineral aparecem; teste cego com a equipe".
- **Oferta:** 3kg mensal + material de mesa.

### PB-4 · Churrascaria/parrilla
- **Dor:** sal parrillero importado caro; ritual de finalização é marketing.
- **Abertura:** "vi os cortes [dry aged/ancho] — que sal usam na finalização?" **Prova:** amostra 500g p/ teste real na brasa. **CTA:** amostra grátis.
- **FUP1 (d+3):** granulometria/rendimento; **FUP2 (d+8):** preço por uso vs importado.
- **Humano:** aceitou amostra (handoff = agendar envio + follow-up pós-teste d+7).
- **Objeções:** "sal grosso R$3/kg"→"esse é de preparo; o nosso é de FINALIZAÇÃO — gramas por prato, cliente vê"; "manda preço"→humano envia tabela food service.
- **Oferta:** saco 5kg food service [criar SKU] ou caixa 10kg.

### PB-5 · Peixaria/frutos do mar
- **Ângulo:** "sal marinho de Mossoró + pescado — mesma origem". CTA amostra p/ salga leve/finalização. Resto = PB-4 adaptado.

### PB-6 · Revendedor/distribuidor [só F3, com prova]
- **Abertura:** dados de sell-out reais ("X empórios repondo mensalmente"). **CTA:** call de 15min. **Humano:** SEMPRE (negociação de canal é 100% humana). IA só prepara dossiê.

# PARTE 17 — MENSAGENS (exemplos prontos)

**E-mail 1 (empório, com gap):**
> Assunto: Sal marinho integral de Mossoró para a [Nome da Loja]
> Olá! Vi que a [Loja] trabalha com sal rosa e flor de sal — não encontrei na linha um sal marinho integral brasileiro. Somos a Sal Vita, de Mossoró/RN (região que produz 95% do sal do país). Sal não refinado, +80 minerais, embalagem zip lock com janela que vende sozinha na prateleira. Para revenda a margem fica perto de 100%. Faz sentido te enviar a tabela e uma caixa teste? Abraço, [Nome] — Sal Vita · Mossoró/RN
> _Se não quiser receber esses e-mails, responda SAIR._

**E-mail 2 (d+4):**
> Assunto: números da revenda Sal Vita
> Oi, [Nome]! Só complementando: a caixa fecha em R$ 149,90 (10 pacotes de 1kg). Sugerido de prateleira: R$ 29,90 — sobra R$ 14,90 por pacote. Frete para [cidade] sai em torno de R$ [frete real]. Se quiser, mando a tabela completa em PDF. Vale 10 minutos?

**E-mail 3 (d+9, último):**
> Assunto: fechando o assunto 🙂
> [Nome], não quero insistir — último e-mail. Se sal premium nacional não é prioridade agora, sem problema. Se quiser testar depois, é só chamar: [whats comercial]. Obrigado pelo tempo!

**WhatsApp inicial seguro (nº comercial publicado, envio manual):**
> Olá! Falo com o comercial da [Empresa]? Aqui é [Nome], da Sal Vita, de Mossoró/RN — sal marinho integral premium. Vi que vocês [gap/contexto real]. Posso te mandar a tabela de [revenda/food service]? Se preferir não receber contato, me avisa que não escrevo mais.

**Follow-up curto:** "Oi [Nome], conseguiu ver a tabela? Qualquer dúvida de frete pra [cidade] eu resolvo rapidinho 🙂"

**"Não tenho interesse":** "Entendido, [Nome] — obrigado por responder! Tiro seu contato da lista. Se mudar de ideia, estamos em salvitarn.com.br. Sucesso aí!" (→ suppression)

**"Manda tabela":** "Claro! Segue em PDF: [link]. Preço de [revenda/food service], pedido mínimo 1 caixa (10kg), frete pra [cidade] ~R$ [X], prazo [Y] dias úteis. Quer que eu monte um pedido teste?"

**"Qual a diferença do seu sal?":** "Justa pergunta! É sal marinho NÃO refinado: só lavado e seco ao sol, então preserva os +80 minerais naturais do oceano — cor levemente acinzentada e sabor mais complexo. O refinado passa por processamento que remove tudo isso. E vem de Mossoró/RN, de onde sai 95% do sal brasileiro. (Sem promessa de saúde — a diferença é origem, processo e sabor.)"

**"Qual preço no atacado?":** "Depende do volume: até 3 caixas R$ [X]/caixa; acima disso já chamo nosso comercial pra montar condição especial. Quantos kg/mês vocês giram de sal?" (→ handoff)

**Handoff interno (pro humano):**
> 🔥 LEAD QUENTE — [Empresa] ([segmento], [cidade]) · Pediu: tabela atacado · Perfil: [3 fatos] · Mix atual: [sais] · Objeção: [se houver] · Sugestão: enviar tabela food service + propor caixa teste · Histórico: [link thread] · SLA: responder até [hora].

**Reagendar:** "Perfeito, [Nome]! Te procuro em [mês]. Bom [contexto sazonal] até lá! 👊" (→ facts_temporary + task futura)

**Reativação (pool):** "Oi [Nome], tudo bem? Em [mês] você pediu pra retomar o assunto do sal premium. A tabela atualizou e o frete pra [cidade] melhorou. Ainda faz sentido?"

# PARTE 18 — SCORE E PRIORIZAÇÃO

`fit` (sinais P6, 0–100) · `intent` (respostas/inbound) · `channel_readiness` (canais publicados) · `data_confidence` (fatos com fonte) · `risk` (0–100, maior=pior) · `readiness` (7-E) · `geo` (7-D)

**Prioridade = 0.30·fit + 0.20·intent + 0.15·readiness + 0.10·channel + 0.10·geo + 0.10·repurchase + 0.05·ease**, elegível se `risk<60 AND data_confidence>50 AND readiness≥40`. `handoff_priority = 0.5·intent + 0.3·fit + 0.2·ticket_estimado`.

**Calibração:** pesos em `followup_rules` (versionados). A cada ciclo do Revenue Analyst (≥300 conversas): comparar priority previsto × desfecho real; ajustar máx ±15%/ciclo; humano aprova.

| Quadrante | Ação |
|---|---|
| Score alto + risco baixo | Fila de outreach imediata, cadência completa |
| Score alto + risco alto | NÃO automatizar: revisão humana, contato manual artesanal |
| Score baixo + risco baixo | Nurture (re-score 45d); entra em campanha de praça quando a cidade ficar densa |
| Score baixo + risco alto | Descartar (dormant) — não gastar IA nem atenção |

# PARTE 19 — HANDOFF HUMANO

| Situação | Sistema faz |
|---|---|
| Cadência fria sem resposta | Continua sozinho (dentro dos caps) |
| Lote frio novo; recalibração de pesos; nova prompt_version | **Pede aprovação** |
| Promessa de retorno ("me chama em setembro") | **Agenda tarefa** |
| Pediu tabela/amostra/preço atacado; respondeu com interesse; objeção de preço; QUALQUER negociação | **Chama humano** (handoff + notificação) |
| Conversa hot no WhatsApp | **Transfere** (humano assume a thread) |
| Handoff aberto | **Sugere**: proposta (offers draft), tabela certa, amostra, cupom, link de pagamento (reusa fluxo MP existente) — humano aprova e envia |

**Dossiê padrão** (Conversation Analyst): empresa+segmento+cidade · decisor · 3 fatos do perfil · mix de sais/gap · o que pediu · objeções · heat · histórico resumido (5 linhas) · próxima ação sugerida · link da thread.
**SLA:** inbound /atacado → 2h úteis; handoff hot → 4h úteis; morno → 24h. Alerta se estourar (e-mail/WhatsApp interno).

# PARTE 20 — ANALYTICS E OPERAÇÃO

KPIs por camada: descobertos/sem · % enriquecidos c/ confidence>50 · % aprovados p/ outreach · enviados/dia vs cap · **taxa de resposta** (meta ≥8% e-mail frio bom) · taxa de qualificação (resposta→pedido de tabela/amostra) · handoffs/sem e SLA cumprido · **taxa de fechamento** (handoff→won) · ticket médio B2B · **recompra em 60d** (métrica-rainha) · reativações ganhas · custo IA/lead (meta <R$0,05) · custo IA/venda · custo/lead útil · custo/conversa qualificada · opt-out (<2% saudável; >5% = pare e revise copy) · bounce (<3%; >5% = pare warmup) · tempo até resposta humana.

**Alertas automáticos:** bounce>5% ou opt-out>5% no dia → pausa engine + notifica · teto de custo IA atingido → pausa não-crítico · handoff estourando SLA · cron sem rodar >1h · provedor LLM em circuit-open >30min · resposta inbound sem tratamento >2h.

# PARTE 21 — MVP MAIS INTELIGENTE (2 semanas)

**Entra:** página **/atacado** no site premium (formulário: nome, empresa, CNPJ opcional, cidade/UF, segmento, volume estimado, WhatsApp/e-mail + Turnstile) → vira company `qualified` direto (inbound = melhor lead) · schema b2b núcleo (10 tabelas MVP) · Scout assistido (colar busca Places/URLs) · Enricher + perfil + concorrência básica · Scorer determinístico · Copywriter com gap · envio e-mail semi-auto (lote aprovado, 10–20/d warmup, domínio secundário) · inbox de respostas com classificação + dossiê handoff · página admin `/sal-vita-b2b` (padrão SalVitaRecovery) · guardrails completos (suppression/opt-out/caps/auditoria).

**Fora (agora):** sequencer full-auto · embeddings/pgvector · dashboards sofisticados · WhatsApp Cloud API oficial · distribuidores (ICP-5) · recalibração automática (manual até 300 conversas) · geo avançado (só UF+frete da tabela REGIONS).

**Não vale automatizar no começo:** resposta a lead engajado (humano com sugestão de IA converte mais e ensina o sistema) · qualquer envio de preço.

**Testar primeiro:** 50 empórios (ICP-1) em 2–3 capitais NE com e-mail comercial publicado + gap de mix identificado. É o teste de maior sinal por real gasto.

**Maior ROI em 2 semanas:** (1) /atacado no ar + CTA "Revenda" no menu da landing — capta demanda que JÁ passa pelo site; (2) 50 e-mails artesanais-assistidos p/ empórios; (3) resposta rápida a TODO inbound. **Em 30 dias:** 200–300 contatos ICP-1/ICP-2, amostras p/ parrillas, primeiras recompras de empório, calibração v2 da copy pelos outcome_reasons.

# PARTE 22 — ROADMAP

| Fase | Objetivo | Entregáveis | Custo | Risco | Tempo | Pré-req | Resultado esperado |
|---|---|---|---|---|---|---|---|
| **F0 — Compliance & base** | Fundação segura | Domínio secundário + SPF/DKIM/DMARC + warmup; schema b2b; guardrails; /atacado; suppression; auditoria; **corrigir os 3 CRÍTICOS do RELATORIO-AUDITORIA-PREMIUM (cron/reconcile/race) — não jogue lead em checkout que não confirma pagamento** | R$ ~40/ano (domínio) | Baixo | 3–5 dias | — | Base pronta, inbound captando |
| **F1 — Descoberta+score** | Encher o funil com qualidade | Scout, Enricher (perfil+concorrência), Scorer, admin lista/aprovação | R$0 | Baixo | 4–6 dias | F0 | 300–500 leads scored |
| **F2 — Outbound+handoff** | Primeiras receitas | Copywriter, envio e-mail em lote aprovado, inbox+Analyst, handoff+SLA, WhatsApp manual 1-clique | R$0 | Médio (reputação — seguir caps) | 5–7 dias | F1 | Respostas, amostras, 1ºs pedidos B2B |
| **F3 — Otimização por segmento** | Subir conversão | outcome_reasons→recalibração v1; A/B de copy; SKU food service 5kg; campanhas por praça; playbook PB-6 (distribuidor) se ≥10 empórios recomprando | R$0 | Baixo | contínuo | 300+ conversas | Resposta ≥8%, recompra iniciando |
| **F4 — Reativação+inteligência** | Máquina completa | Ciclos de recompra automáticos, reactivation_pool, Revenue Analyst full, geo denso, pgvector se >2k leads | R$0–50/m | Baixo | contínuo | F3 | Receita recorrente B2B previsível |

# PARTE 23 — BACKLOG DE ENGENHARIA

**Épico E1 — Fundação (F0)** [prioridade P0]
- E1.1 Registrar domínio secundário + configurar no Resend (SPF/DKIM/DMARC) — esforço S, risco B, dep: compra do domínio (HUMANO)
- E1.2 `server/db/b2bSchema.ts` + `b2bMigrate.ts` (10 tabelas MVP, padrão ordersMigrate) — M, B
- E1.3 Middleware `checkGuardrails()` + suppression + audit_logs — M, B, dep E1.2
- E1.4 Página `/atacado` (host premium, rota + vercel.json + Turnstile) + endpoint inbound → company qualified + notificação — M, B, dep E1.2
- E1.5 Corrigir críticos C1–C3 do RELATORIO-AUDITORIA-PREMIUM — M, M (já especificado lá)

**Épico E2 — Motor de leads (F1)** [P0]
- E2.1 `llmRouter.ts` (roteamento, fallback, breaker, cache, custo) — M, M
- E2.2 Agente Scout + tRPC `b2b.scout.*` + UI de importação assistida — M, B, dep E1.2/E2.1
- E2.3 Agente Enricher (fetch site, perfil 7-B, concorrência 7-C, snapshots) — L, M, dep E2.2
- E2.4 Scorer determinístico + geo (reusa REGIONS) + readiness + pesos em followup_rules — M, B, dep E2.3
- E2.5 Admin `/sal-vita-b2b`: lista, filtros, detalhe do lead, aprovação de lote — L, B, dep E2.4

**Épico E3 — Outbound (F2)** [P1]
- E3.1 Copywriter (gap-first, lint de claims proibidos, prompt_versions) — M, M
- E3.2 Envio e-mail via Resend (fila PG, caps, webhook bounce/complaint→suppression) — M, M, dep E1.1/E1.3
- E3.3 Inbox: ingestão de respostas (reply-to → webhook/inbound parse), Conversation Analyst, intent/objections/outcomes — L, M
- E3.4 Handoff (dossiê, notificação WhatsApp interno, SLA, tasks) — M, B
- E3.5 WhatsApp manual 1-clique (deep link wa.me com texto pronto + registro do touchpoint) — S, B

**Épico E4 — Aprendizado (F3)** [P2]: E4.1 Revenue Analyst semanal · E4.2 A/B de prompt_versions · E4.3 recalibração assistida · E4.4 campanhas por praça.

**Definição de pronto (todas):** typecheck+build ok · guardrails passam (teste: envio bloqueado p/ suprimido) · audit_log da ação existe · smoke test do fluxo · zero toque nos routers do CRM.

# PARTE 24 — PLANO DE EXECUÇÃO PARA AGENTE EXECUTOR BARATO

**Ordem exata:** E1.2 → E1.3 → E1.4 → E2.1 → E2.2 → E2.3 → E2.4 → E2.5 → (pausa: humano valida 20 leads) → E3.1 → E3.2 → E3.3 → E3.4 → E3.5. (E1.1 e E1.5 em paralelo por humano/sessão dedicada.)

**Arquivos/módulos (contratos):**
- `server/db/b2bSchema.ts` — tabelas Drizzle schema `b2b` (PARTE 8 [MVP])
- `server/db/b2bMigrate.ts` — `ensureB2bTablesExist()` (copiar padrão de `ordersMigrate.ts`), registrada no boot de `api/index.ts`
- `server/b2b/llmRouter.ts` — `llmCall(task: 'classify'|'extract'|'copy'|'summarize', input, promptKey): Promise<{json, runId}>` — SEMPRE valida saída contra schema zod; loga em agent_runs
- `server/b2b/guardrails.ts` — `canSend({channel, email?, phone?, companyId}): {ok, reason?}` — chamado por TODO envio
- `server/routers/b2b.ts` — router tRPC: `companies.list/get/updateStage`, `scout.import`, `enrich.runBatch`, `score.runBatch`, `outreach.draftBatch/approveBatch/sendBatch`, `inbox.list/classify/reply`, `handoff.list/resolve`, `settings.rules` — admin-only (mesmo guard dos outros routers)
- `api/index.ts` — adicionar: `POST /api/b2b/inbound` (form /atacado), `POST /api/webhooks/resend`, `POST /api/cron/b2b-engine` (protegido CRON_SECRET; processa ≤10 itens/estado por chamada)
- `client/src/pages/SalVitaB2B.tsx` — admin (seguir SalVitaRecovery.tsx: tabs, cards, login) + rota em App.tsx (`/sal-vita-b2b` no host premium)
- `client/src/pages/Atacado.tsx` — pública (`/atacado` no host premium; adicionar rewrite no vercel.json igual /meu-pedido)

**Checkpoints com validação humana OBRIGATÓRIA:** (1) após E1.4: formulário testado de ponta a ponta; (2) após E2.4: humano revisa 20 leads scored (segmento certo? gap real?); (3) após E3.1: humano lê 10 drafts (tom? claims?); (4) antes do 1º lote real: DKIM/DMARC verificados + teste para a própria caixa; (5) toda semana 1 de envio: humano lê TODAS as respostas.

**Smoke tests mínimos:** migrate cria tabelas idempotente · inbound cria company+consent+audit · suppression bloqueia envio (teste automatizado) · llmRouter faz fallback com chave inválida na 1ª posição · draft com "emagrece/saúde/cura" é rejeitado pelo lint · cap diário bloqueia 21º envio · opt-out "SAIR" suprime e confirma.

**Regras para o executor:** NÃO tocar em routers/páginas do CRM · NÃO inventar integrações fora deste doc · commits pequenos por história, em inglês, na main · typecheck+build antes de todo push · dúvida de produto = perguntar, não assumir.

# PARTE 25 — DECISÃO FINAL

- **Arquitetura recomendada:** a deste documento — monólito serverless existente + schema b2b + 6 agentes + e-mail secundário + WhatsApp manual + humano no fechamento.
- **Mais conservadora:** só /atacado + planilha de 100 empórios trabalhada manualmente com copy de IA (zero código novo além do form). Válida se o tempo de dev for o gargalo.
- **Mais agressiva:** + WhatsApp Cloud API oficial (pago, templates aprovados) + Places em volume + time de SDR. Só depois de F3 provar conversão.
- **Maior risco real:** queimar canal (domínio/número) por pressa no volume — é irreversível no curto prazo e mata também o B2C.
- **Maior oportunidade real:** empórios em recompra mensal → em 6 meses, 30 empórios ativos ≈ R$ 4,5–9k/mês recorrentes com margem, e viram a PROVA que destrava distribuidores.
- **Erro mais provável seu:** ansiedade de escala — subir volume de disparo antes da copy/segmento converter, e pular o warmup. O plano inteiro te protege de você mesmo: respeite os caps.
- **Caminho mais rápido p/ receita:** /atacado no ar hoje + 50 e-mails assistidos p/ empórios com gap identificado + amostras p/ 10 parrillas.
- **Mais seguro p/ escalar:** F0→F1→F2 na ordem, recalibrando com outcome_reasons a cada semana.
- **Parece brilhante mas seria burrice agora:** disparador de WhatsApp em massa via Evolution, scraping industrial de Maps/Instagram, e fechar um distribuidor grande no mês 1. Os três destroem margem, canal ou reputação.

---

# BLOCO EXTRA 1 — PROMPT PARA O AGENTE EXECUTOR

> Você é um agente executor trabalhando no repo `tarcyoalves/sal-vita-vendas`. Leia `CLAUDE.md`, `RELATORIO-AUDITORIA-PREMIUM.md` e `PLANO-PROSPECCAO-B2B.md` (este arquivo) ANTES de qualquer código. Implemente APENAS o módulo B2B descrito na PARTE 24, na ordem exata E1.2→E1.3→E1.4→E2.1→E2.2→E2.3→E2.4→E2.5→E3.1→E3.2→E3.3→E3.4→E3.5. Regras invioláveis: (1) NUNCA toque nos routers/páginas do CRM de lembretes (tasks, sellers, clients, reminders, ai, knowledge, workSessions, tv) nem em email marketing/frete fácil; (2) siga os padrões existentes: Drizzle + tRPC + wouter + página admin no estilo `SalVitaRecovery.tsx` + migração no estilo `ordersMigrate.ts`; (3) todo envio passa por `guardrails.ts` (suppression, cooldown, caps, opt-out) — sem exceção; (4) IA nunca envia preço/proposta sem aprovação humana; (5) valide toda saída de LLM com zod, fato sem fonte é descartado; (6) commits pequenos em inglês na main, typecheck + build Vite antes de cada push; (7) pare e peça validação humana nos 5 checkpoints da PARTE 24; (8) não invente integrações — só Places API, Resend, Evolution (manual), Groq/NIM/Cerebras/Gemini via `llmRouter.ts`. Comece por E1.2 e me mostre o schema antes de seguir.

# BLOCO EXTRA 2 — CHECKLIST DE VALIDAÇÃO DO MVP

- [ ] Domínio secundário com SPF+DKIM+DMARC verificados no Resend (teste: mail-tester.com ≥9/10)
- [ ] /atacado no ar, formulário cria lead qualified + notifica no WhatsApp interno em <1min
- [ ] Turnstile bloqueando bot no formulário
- [ ] 10 tabelas MVP criadas idempotentes; boot não quebrou o e-commerce
- [ ] Suppression bloqueia envio (teste real com e-mail suprimido)
- [ ] Opt-out "SAIR" (e-mail e WhatsApp) suprime na hora + audit_log
- [ ] Cap diário respeitado (tentar exceder → bloqueado)
- [ ] Scout importa busca de Places e deduplica por places_id
- [ ] 20 leads revisados por humano: segmento certo ≥80%, gap de concorrência real ≥60%
- [ ] Draft de copy: zero claims de saúde em 20 amostras; personalização com gap presente
- [ ] Fallback LLM funciona com 1ª chave inválida; custo/dia visível
- [ ] Resposta inbound classificada + dossiê de handoff gerado
- [ ] SLA: inbound respondido em <2h úteis nos primeiros 10 casos
- [ ] Críticos C1–C3 do RELATORIO corrigidos (pagamento confirma sozinho)
- [ ] Nada do CRM de lembretes foi alterado (git diff conferido)

# BLOCO EXTRA 3 — PRIMEIRAS 30 TAREFAS

1. Comprar domínio secundário (ex.: salvitapremium.com.br) [HUMANO]
2. Configurar domínio no Resend + SPF/DKIM/DMARC [HUMANO+agente]
3. Corrigir C1 (cron abandoned-cart/reconcile no vercel.json ou cron-job.org)
4. Corrigir C2 (validação de valor no reconcile)
5. Corrigir C3 (update condicional na confirmação)
6. `b2bSchema.ts` com as 10 tabelas MVP
7. `b2bMigrate.ts` + registro no boot
8. `guardrails.ts` + testes de suppression/cap
9. `audit()` helper + audit_logs
10. Página `/atacado` + rota vercel.json + Turnstile
11. `POST /api/b2b/inbound` → company qualified + consent + notificação
12. CTA "Revenda/Atacado" no menu da landing → /atacado
13. `llmRouter.ts` (Groq→NIM→Cerebras→Gemini, breaker, cache, custo)
14. `prompt_versions` seed (classify_segment, extract_profile, extract_competitors, copy_emporio, copy_parrilla, classify_reply)
15. tRPC `b2b.companies.*` + página admin base (lista+filtros)
16. Scout: import de resultados Places (colar JSON/CSV) + dedup + classificação
17. Chave Google Places API + busca assistida na UI [HUMANO cria chave]
18. Enricher: fetch site → profile 7-B + competitor_presence 7-C + snapshots
19. Scorer: fórmulas + geo (REGIONS) + readiness + pesos em followup_rules
20. UI detalhe do lead (perfil, scores, concorrência, histórico)
21. UI aprovação de lote (scored → approved_for_outreach)
22. Copywriter + lint de claims proibidos
23. Fila de envio e-mail + Resend + caps/warmup schedule
24. Webhook Resend (bounce/complaint → suppression automática)
25. Ingestão de respostas (reply-to dedicado) + inbox UI
26. Conversation Analyst (intent/objection/outcome + summary + dossiê)
27. Handoff: notificação WhatsApp interno + SLA + tasks
28. WhatsApp manual 1-clique (wa.me com texto + registro touchpoint)
29. Relatório diário simples (enviados, respostas, opt-outs, custo IA)
30. Rodada real: 20 empórios de 1 capital NE, warmup 10/dia [HUMANO aprova cada lote]

# BLOCO EXTRA 4 — ERROS FATAIS A EVITAR NOS PRIMEIROS 30 DIAS

1. **Disparar do domínio principal** — contamina o e-mail transacional do e-commerce. Irreversível no curto prazo.
2. **Cold WhatsApp automatizado via Evolution** — ban do número em dias; você perde o canal de recuperação de carrinho junto.
3. **Pular o warmup** (mandar 80/dia na semana 1) — direto pro spam; domínio novo precisa de 2–3 semanas de rampa.
4. **Prometer o que não existe** (EAN, registro, prazo de produção) — B2B tem memória; uma promessa furada mata a praça.
5. **Claims de saúde na copy** — risco ANVISA + denúncia de concorrente. O lint existe: não remova.
6. **Deixar a IA responder negociação sozinha** — um preço alucinado num print de WhatsApp circula para sempre.
7. **Ignorar inbound enquanto persegue outbound** — o lead do /atacado responde 10× mais; SLA de 2h é sagrado.
8. **Abrir distribuidor no mês 1** — sem prova de giro você vira marca de aluguel com 45% de desconto.
9. **Medir vaidade (leads no dashboard) em vez de resposta/recompra** — 500 leads scored valem menos que 5 empórios repondo.
10. **Mandar tráfego B2B para checkout com os bugs críticos abertos** — corrija C1–C3 antes do primeiro lote.
