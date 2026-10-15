# ESPECIFICAÇÃO TÉCNICA: MÓDULO DE ANÁLISE DE CRÉDITO NO CRM LEMBRETES

**Data:** 15/10/2026  
**Autor:** Hermes (em alinhamento com Tarcyo Alves)  
**Destinatário:** Claude Code (Orquestrador / Implementador)  
**Repositório:** `tarcyoalves/sal-vita-vendas`  
**Escopo Exclusivo:** CRM Lembretes (`lembretes.salvitarn.com.br` / `DATABASE_URL`) — Não tocar na Loja Premium.

---

## 1. CONTEXTO E OBJETIVO DO NEGÓCIO

A Sal Vita comercializa sal refinado, moído e em big bags em carretas fechadas (30 a 50 toneladas). Cada pedido faturado a prazo (ex.: 30/45/60 ou 30/60/90 dias) representa uma exposição financeira de R$ 8.000,00 a R$ 35.000,00.

Hoje a checagem cadastral/financeira é manual. Para mitigar o risco de inadimplência sem onerar a operação, integraremos a API externa da **API Full** (`doc.apifull.com.br`) para consultas sob demanda aos birôs de crédito (Boa Vista / Cenprot).

---

## 2. DECISÕES ESTRATÉGICAS E PRECIFICAÇÃO (CUSTO-BENEFÍCIO)

Após auditoria técnica em todas as 172 APIs da plataforma, foi selecionada a opção com a melhor relação custo-benefício do mercado:

### Endpoint Oficial: `scpc-boavista` (Boa Vista Essencial Positivo)
• **Método:** `POST https://doc.apifull.com.br/api/scpc-boavista`  
• **Preço por Consulta:** **R$ 2,75** (modelo pré-pago sem mensalidade fixa).  
• **Dados Retornados em uma Única Chamada:**
  1. Score de crédito unificado (0 a 1000).
  2. Pendências financeiras comerciais e bancárias (valores, credores, datas).
  3. Protestos em Cartórios de todo o Brasil (via convênio CENPROT).
  4. Cheques sem fundos (CCF) e Cheques sustados.
  5. Quadro societário e dados cadastrais na Receita Federal.

*Nota:* Para produtores rurais pessoa física (CPF com IE de produtor), utilizar como fallback o endpoint `e-boavista` (R$ 2,49).

---

## 3. REGRAS DE SEGURANÇA E ACESSO (MANDATÓRIO)

1. **Exclusividade Admin (Tarcyo):**
   - Vendedores e atendentes (Analice, Matheus, Alysson, Victoria) **NÃO PODEM** disparar consultas pagas.
   - A rota de consulta deve ser protegida por `adminProcedure` no tRPC. Chamadas por outros roles devem retornar erro `403 FORBIDDEN`.
   - O botão de disparar a consulta na interface deve ser renderizado **exclusivamente** para o usuário `admin`. Vendedores visualizam apenas o card de leitura com os dados da última análise realizada.
2. **Zero Exposição de Credenciais:**
   - O token da API Full deve residir exclusivamente no `.env` (`APIFULL_API_TOKEN`). Nunca trafegar para o frontend nem versionar no git.

---

## 4. MODELO DE DADOS (BANCO DE DADOS NEON / DRIZZLE)

Adicionar a tabela `credit_reports` em `server/db/schema.ts`:

```typescript
export const creditReports = pgTable('credit_reports', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id), // Vinculado ao Lead/Cliente no CRM
  document: text('document').notNull(), // CNPJ ou CPF (somente dígitos)
  documentType: text('document_type').notNull().default('CNPJ'), // CNPJ | CPF
  razaoSocial: text('razao_social').notNull(),
  
  // Resumo Executivo da Análise
  score: integer('score'), // Ex: 750
  scoreFaixa: text('score_faixa'), // BAIXO | MEDIO | ALTO | CRITICO
  probabilidadeInadimplencia: numeric('probabilidade_inadimplencia', { precision: 5, scale: 2 }), // %
  
  // Ocorrências Restritivas
  pendenciasFinanceirasCount: integer('pendencias_financeiras_count').default(0).notNull(),
  pendenciasFinanceirasTotal: numeric('pendencias_financeiras_total', { precision: 12, scale: 2 }).default('0').notNull(),
  protestosCount: integer('protestos_count').default(0).notNull(),
  protestosTotal: numeric('protestos_total', { precision: 12, scale: 2 }).default('0').notNull(),
  chequesSemFundoCount: integer('cheques_sem_fundo_count').default(0).notNull(),
  
  // Veredito e Limite Recomendado
  statusRecomendado: text('status_recomendado').notNull(), // APROVADO | APROVADO_COM_RESTRICAO | REPROVADO_A_VISTA
  
  // Payload bruto para auditoria completa e relatórios futuros
  rawResponse: jsonb('raw_response'),
  
  // Auditoria
  consultadoPor: text('consultado_por').notNull(), // Nome ou ID do Admin
  custoConsulta: numeric('custo_consulta', { precision: 6, scale: 2 }).default('2.75').notNull(),
  consultadoEm: timestamp('consultado_em').defaultNow().notNull(),
});
```

---

## 5. BACKEND: tRPC ROUTER (`server/routers/credit.ts`)

Criar o router com as seguintes procedures:

1. **`getSaldo` (`adminProcedure`):**
   - Chama `GET https://doc.apifull.com.br/api/get-balance` passando `Authorization: Bearer <TOKEN>`.
   - Retorna o saldo em reais disponível na conta da API Full para exibição no topo do modal.

2. **`consultar` (`adminProcedure`):**
   - **Input:** `{ taskId: number, document: string }`.
   - **Trava de Cache (Anti-Desperdício):**
     - Checar se já existe registro na tabela `credit_reports` para aquele documento emitido nos últimos **30 dias**.
     - Se existir e o input não contiver a flag `{ forceFresh: true }`, retorna o relatório em cache sem consumir novo saldo.
   - **Execução Externa:**
     - Post para `https://doc.apifull.com.br/api/scpc-boavista` com payload:
       ```json
       {
         "link": "scpc-boavista",
         "cnpj": "<DOCUMENTO_LIMPO>"
       }
       ```
   - **Parser do Retorno:** Extrair e normalizar Score, Protestos, Pendências e Cheques.
   - **Regra de Veredito Sal Vita:**
     - Se `protestosCount > 0` OU `pendenciasFinanceirasTotal > 5000` OU `score < 400`:  
       -> `statusRecomendado = 'REPROVADO_A_VISTA'` (Bandeira Vermelha).
     - Se `score >= 600` E `protestosCount === 0`:  
       -> `statusRecomendado = 'APROVADO'` (Bandeira Verde).
     - Casos intermediários:  
       -> `statusRecomendado = 'APROVADO_COM_RESTRICAO'` (Bandeira Amarela - prazo curto).
   - Salvar em `credit_reports` e retornar o registro criado.

3. **`getLatestReport` (`staffProcedure`):**
   - Leitura livre para atendentes e admin visualizarem a última análise existente daquele cliente.

---

## 6. FRONTEND: UI / UX NO CRM LEMBRETES

1. **Card de Crédito no Detalhe da Tarefa/Lead (`TaskDetailsModal` / `ClientCard`):**
   - **Se o usuário for Admin:**
     - Exibe botão: `[ 🔍 Analisar Crédito (R$ 2,75) ]`.
     - Ao clicar, abre modal de confirmação com saldo atual e aviso de cobrança.
   - **Se o usuário for Atendente:**
     - O botão de disparar consulta não aparece.
   - **Visualização do Status (Semáforo):**
     - 🟢 **Crédito Aprovado** (Score 780 | 0 Protestos | Última checagem: 10/10/2026).
     - 🟡 **Atenção / Limite Reduzido** (Score 490 | 0 Protestos).
     - 🔴 **Risco Alto: Somente À Vista** (Score 220 | 3 Protestos somando R$ 18.000).
   - Acordeão expansível com a listagem detalhada de protestos e pendências encontradas para conferência pelo Tarcyo.

2. **Integração com Pedidos B2B (`fatOrders`):**
   - Quando um atendente lançar um pedido com prazo de sal (ex.: 30/45/60) para um cliente cujo `statusRecomendado === 'REPROVADO_A_VISTA'`:
     - Exibir badge vermelho no pedido: `⚠️ Cliente com Restrição de Crédito`.
     - Desabilitar o botão `"Enviar pedido para SMBI"` para os atendentes, exigindo que o Admin autorize o pedido previamente em tela.

---

## 7. CHECKLIST DE HOMOLOGAÇÃO E TESTES

- [ ] Variável `APIFULL_API_TOKEN` configurada e validada.
- [ ] Migration do banco executada sem quebrar tabelas existentes.
- [ ] Teste unitário garantindo que usuário com `role === 'seller'` ou `'staff'` receba `403` ao tentar chamar `credit.consultar`.
- [ ] Teste de cache de 30 dias (segunda consulta imediata não chama a API externa e não consome saldo).
- [ ] Validação do build do projeto (`npm run check` e `npm test`).
