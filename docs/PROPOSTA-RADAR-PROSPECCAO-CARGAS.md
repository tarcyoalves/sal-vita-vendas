# 📑 ESPECIFICAÇÃO DE ARQUITETURA & PROPOSTA TÉCNICA
## Módulo "Radar de Cargas & Prospecção Ativa" no CRM de Lembretes

**Data:** 25 de Setembro de 2026  
**Solicitante:** Tarcyo Alves (Diretor Comercial / Sal Vita)  
**Autor do Documento:** Hermes Agent  
**Destinatário para Avaliação:** Claude Code (Engenheiro de Software do repositório `sal-vita-vendas`)

---

## 1. CONTEXTO DO NEGÓCIO & DOR OPERACIONAL

### 1.1 O Cenário Real da Sal Vita
No comércio e transporte rodoviário de sal (A S Comércio e Moagem de Sal / Sal Vita), as carretas possuem capacidade padrão de **30 a 32 toneladas** (aproximadamente **1.200 a 1.280 sacos de 25 kg**).

* **Exemplo Clássico:** A equipe comercial fecha uma venda de **800 sacos de sal** para um cliente em **Barracão / PR**.
* **O Desafio Logístico e Financeiro:** O frete já está contratado ou a carreta já está programada, restando um espaço ocioso de **400 sacos de sal** para fechar a lotação máxima da viagem.
* **A Oportunidade:** Vender esses 400 sacos para clientes na mesma cidade ou em cidades vizinhas na rota com uma oferta agressiva de **frete compartilhado reduzido**, maximizando a margem da viagem e eliminando capacidade ociosa do caminhão.

### 1.2 O Gargalo da Equipe de Atendimento
Atualmente, quando isso acontece, os atendentes (Analice, Matheus, etc.) precisam:
1. Abrir o Google Maps ou sites de busca e caçar empresas na região;
2. Tentar descobrir o CNPJ de cada uma (o Google Maps não fornece CNPJ);
3. Descobrir se a empresa tem Inscrição Estadual ativa (obrigatória para faturamento de sal);
4. Buscar telefones atualizados e validar se possuem WhatsApp;
5. Cadastrar tudo manualmente, um por um, no CRM de Lembretes.

Esse processo consome horas preciosas, é passível de erro e muitas vezes o caminhão roda sem completar a carga por falta de tempo hábil.

---

## 2. O PEDIDO DO TARCUS (REQUISITOS DO PRODUTO)

1. **Interface Nativa no CRM de Lembretes:** Integrar uma tela direta no CRM (`lembretes.salvitarn.com.br`) para os atendentes pesquisarem ali mesmo, sem sair do sistema.
2. **Parâmetros de Entrada Simples:**
   * Cidade de referência (ex.: *Barracão / PR*);
   * Raio de busca em quilômetros (ex.: *30 km, 50 km, 80 km*);
   * Saldo de sacos a completar (ex.: *400 sacos*);
   * Tipo de produto / segmento-alvo pré-selecionado (Agropecuária/Rações, Laticínios, Frigoríficos, Mercados).
3. **Dados Obrigatórios do Lead na Resposta:**
   * **Nome da Empresa** (Razão Social & Nome Fantasia);
   * **CNPJ** (com status ATIVO na Receita);
   * **Inscrição Estadual (IE)** ativa;
   * **Telefones de Contato / WhatsApp**;
   * **E-mail**;
   * **Distância e Cidade** em relação à carga principal.
4. **Inteligência Artificial via OmniRoute:**
   * Conectar a API da nossa **OmniRoute** local na VPS para curadoria dos dados, pontuação de fit comercial e geração da copy de abordagem.
5. **Filtragem Humana & Ação com 1 Clique:**
   * O atendente visualiza a listagem na tela, avalia o perfil dos clientes encontrados;
   * Em casos positivos, clica em um botão e o lead é **transformado imediatamente em Lembrete** na esteira do CRM com data de retorno (Hoje) e link de disparo de WhatsApp (`wa.me/...`) pré-preenchido.

---

## 3. ARQUITETURA TÉCNICA PROPOSTA

### 3.1 Visão Geral dos Componentes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CRM DE LEMBRETES (Frontend)                     │
│              Tela: client/src/pages/RadarProspeccao.tsx                │
│       [Filtros: Cidade, Raio, Saldo de Sacos, CNAE] -> Grid de Leads   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (tRPC mutation)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         BACKEND tRPC (CRM Server)                      │
│                  server/routers/prospectingRadar.ts                    │
└───────┬───────────────────────────┬───────────────────────────┬────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│  Geocoding   │            │ Dados CNAE   │            │  OmniRoute   │
│ & Raio (km)  │            │ & CNPJ Brasil│            │      IA      │
│  (IBGE/OSRM) │            │ (Bases Open) │            │ (Gemini 3.8) │
└───────┬──────┘            └───────┬──────┘            └───────┬──────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BANCO DE DADOS (DATABASE_URL)                   │
│   - Deduplicação contra a tabela `tasks` (verifica se CNPJ já existe)  │
│   - Gravação atômica: [Transformar em Lembrete] -> Insere em `tasks`   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 Camadas da Arquitetura

#### A. Frontend (React / Tailwind / shadcn/ui)
* **Local:** `client/src/pages/RadarProspeccao.tsx` (ou `client/src/pages/RadarCargas.tsx`).
* **Menu:** Adicionado ao `client/src/components/AppShell.tsx` sob o grupo Comercial/Vendas do CRM.
* **Estrutura da Tela:**
  1. **Card de Busca Superior:** Inputs para Cidade Base, UF, Raio (Select: 25km, 50km, 100km), Saldo de Sacos (número) e Checkboxes de CNAEs (Agropecuária, Laticínio, Frigorífico, Varejo).
  2. **Grid de Resultados:**
     * Badge de Status Cadastral (🟢 Ativo / Regular);
     * CNPJ formatado e Inscrição Estadual;
     * Distância rodoviária calculada da cidade base;
     * WhatsApp verificado com botão de ação rápida;
     * Indicador se a empresa já está em atendimento por outro atendente no CRM (evita concorrência interna).
  3. **Ação Rápida:** Botão `[ 🚀 Criar Lembrete ]` que dispara modal de confirmação e agenda a tarefa na hora.

#### B. Backend tRPC (`server/routers/prospectingRadar.ts`)
Criar um novo sub-roteador no tRPC do servidor com duas procedures principais:

1. `prospectingRadar.search(input: SearchInput)`
   * Resolve as coordenadas da cidade base e mapeia os municípios no raio selecionado.
   * Consulta os estabelecimentos ativos nos CNAEs compradores de sal:
     * `4623-1/09`: Comércio atacadista de alimentos para animais (Sal Moído 25kg).
     * `4789-0/04`: Comércio varejista de animais e rações.
     * `1052-0/00`: Fabricação de laticínios / queijos (Sal Refinado e Moído).
     * `1011-2/01`: Frigoríficos e abatedouros (Salga).
     * `4639-7/01`: Comércio atacadista de produtos alimentícios.
   * Cruza a lista com a tabela `tasks` do CRM para checar duplicidade de CNPJ.
   * Envia os candidatos elegíveis para a **OmniRoute**.
   * A OmniRoute faz a filtragem fina, ranqueia os melhores e formula uma mensagem de abordagem customizada com a praça e o volume de sacos.

2. `prospectingRadar.convert(input: ConvertInput)`
   * Converte o lead aprovado diretamente em uma linha da tabela `tasks`:
     * `clientName`: Razão Social / Nome Fantasia;
     * `document`: CNPJ;
     * `stateRegistration`: Inscrição Estadual;
     * `phone` / `whatsapp`: Telefone principal;
     * `email`: E-mail oficial;
     * `city` / `state`: Cidade e UF;
     * `assignedTo`: Nome do atendente logado;
     * `dueDate`: Data atual (hoje);
     * `notes`: "Prospecção ativa para completar carga de Barracão/PR (400 sacos). Mensagem de abordagem gerada pela IA vinculada.";
     * `status`: 'pending' (Lembrete aberto);
     * `hotLead`: false (ou true para priorização imediata).

#### C. Integração com a OmniRoute da VPS
* **Endpoint:** OmniRoute já operacional na VPS (`http://127.0.0.1:8317` ou URL configurada).
* **Modelo Sugerido:** `antigravity/gemini-3.8-flash-tiered` (ou Gemini 3.7 Flash) — velocidade extrema (< 300-500ms), altíssimo raciocínio estruturado e custo quase zero.
* **Papel da IA no Fluxo:**
  1. **Filtragem Negativa:** Eliminar empresas cadastradas sob o mesmo CNAE que não têm perfil consumidor de sal a granel/ensacado (ex.: pet shop de shopping focado apenas em banho e tosa).
  2. **Copywriting de Abordagem Contextual:** Gerar o texto de abordagem com gatilho de escassez e oportunidade de frete reduzido para envio no WhatsApp.

---

## 4. REGRA DE OURO DE SEGREGACÃO (LEIA COM ATENCÃO)

O repositório `sal-vita-vendas` abriga dois sistemas distintos:
* **CRM de Lembretes:** `lembretes.salvitarn.com.br` (rotas autenticadas sob AppShell, banco `DATABASE_URL`).
* **Loja Sal Vita Premium:** `premium.salvitarn.com.br` (e-commerce público de varejo, banco `ORDERS_DATABASE_URL`).

⚠️ **RESTRIÇÃO ABSOLUTA:**
Este módulo de Radar de Prospecção pertence **EXCLUSIVAMENTE ao CRM de Lembretes**.
* Nenhuma rota, dependência, tabela ou componente da Loja Premium deve ser tocado ou referenciado.
* Todos os novos endpoints devem ser isolados em `server/routers/` voltados para o CRM e conectados à rota principal `appRouter`.
* Seguir rigorosamente o protocolo multi-agente (`coordenacao/README.md`) registrando a intenção antes de commitar.

---

## 5. BENEFÍCIOS ESTIMADOS PARA A OPERAÇÃO

1. **Velocidade de Venda:** Redução de horas para **menos de 30 segundos** entre a identificação de um saldo de carga e o disparo das primeiras ofertas de frete compartilhado.
2. **Conversão de Carga Cheia:** Eliminação de saídas de carretas com frete "batido" (vazio parcial), maximizando o lucro por tonelada transportada.
3. **Crescimento Ativo da Carteira:** Cada busca alimenta o banco de dados do CRM de forma qualificada com CNPJ e Inscrição Estadual verificados, criando uma base proprietária de compradores de sal nas rotas da Sal Vita.

---

## 6. PRÓXIMOS PASSOS PARA O CLAUDE CODE
1. Avaliar a estrutura de tipos e dados existentes em `server/db/schema.ts` e `shared/schema.ts`.
2. Validar se a fonte de dados pública de CNPJs/CNAEs será consumida via microserviço local, API aberta (ex: BrasilAPI/ReceitaWS) ou base sincronizada.
3. Montar a rota tRPC e a tela de protótipo no CRM para homologação com o Tarcyo.
