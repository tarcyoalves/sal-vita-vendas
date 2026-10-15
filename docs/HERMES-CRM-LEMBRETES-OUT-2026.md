# O que mudou no CRM Lembretes (08–15/10/2026) — leitura obrigatória para o Hermes

Escopo: **somente CRM Lembretes** (lembretes.salvitarn.com.br, banco `DATABASE_URL`). A loja Premium não foi tocada por estes trabalhos.
Regra de ouro que continua valendo: **o código vence a documentação**; confira o arquivo citado antes de agir.

## 1. Análise de crédito (NOVO) — detalhe completo em `docs/ANALISE-CREDITO.md`
- Só o **admin** dispara consulta paga (R$ 2,75 na API Full/Boa Vista). Gerente vê relatório e PDF; atendente só vê semáforo/card da própria carteira.
- **A spec antiga em `coordenacao/ativo/2026-10-15-especificacao-modulo-analise-credito.md` está SUPERADA**, com 4 erros já corrigidos no código:
  1. base da API é `https://api.apifull.com.br` (não `doc.apifull.com.br`, que é só o site da documentação);
  2. o corpo é `{ "link": "scpc-boavista", "document": "<cpf|cnpj dígitos>" }` (campo `document`, não `cnpj`; não enviar `pdf`);
  3. a API pode devolver erro com **HTTP 200**: sempre ler `status` do corpo;
  4. `dados` não tem schema publicado: o mapeador é defensivo e nada foi inventado.
- Variáveis (só na Vercel, nunca no repo): `CREDITO_PROVEDOR` (`boavista_apifull` liga o real; ausente = **simulado**, sem custo, dados fictícios com selo "SIMULAÇÃO"), `APIFULL_API_TOKEN` (alias `CREDITO_API_TOKEN`), opcionais `CREDITO_API_URL`, `CREDITO_API_ENDPOINT` (padrão `scpc-boavista`).
- **Pendência com o Hermes:** depois que o Tarcyo fizer a 1ª consulta real, trazer a **resposta bruta sanitizada** (sem CPF/nome de pessoa) para `tests/fixtures/credito/` e ajustar `mapearRespostaBoaVista` em `server/lib/credito/provedores/boavistaApifull.ts` e `STATUS_SUCESSO` (hoje: `sucesso|success|ok`, suposição S1).
- Custo e abuso: cache de 30 dias por documento (reaproveita sem cobrar), trava contra clique duplo, teto mensal (`credit_settings.limite_mensal`, padrão 50), razão `credit_queries` de toda chamada.
- Veredito é **determinístico** (`shared/credito.ts › calcularVeredito`), não opinião do provedor: score < 400, cheque sem fundo, falência ou pendências > R$ 5.000 ou protesto "cheio" → **REPROVADO_A_PRAZO**; score < 600, pendência, ação judicial, score ausente, restrição "para estudar com calma" ou qualquer sinal de ALERTA → **COM_RESTRICAO**; senão **APROVADO**.
- **Pontos de atenção do dono** (`analisarSinais`): tempo de empresa (<1 ano alerta, <3 atenção, ≥10 consolidada), consultas recentes (≥3 atenção, ≥5 alerta em 30 dias), sócio/administrador novo (<6 meses alerta, <12 atenção), movimentação de compras (sem compra >180 dias atenção; ≤90 positivo), e restrições **atenuadas** (órgão público como ANTT, antigas >2 anos ou ≤ R$ 1.000) que não reprovam sozinhas. Limites em `LIMITES_SINAIS`.
- Telas: `/admin/analise-credito` (admin/gerente), semáforo na lista de pedidos, bloco "Crédito" no detalhe do pedido (relatórios arquivados por pedido, liberar pedido), card na tarefa. PDF gerado sob demanda (`credito.pdf`), layout próprio "Relatório de Análise de Crédito — Sal Vita" (sem marca Serasa/Boa Vista), exemplos em `docs/exemplos/`.
- Bloqueio de envio ao SMBI: `dispararSmbi` recusa pedido a prazo de cliente REPROVADO_A_PRAZO (relatório válido, não simulado) sem liberação do admin. **Interruptor desligado por padrão** (`credit_settings.bloqueio_ativo`); só o admin liga.
- Tabelas novas (schema `2026-10-15a`): `credit_reports`, `credit_queries`, `credit_settings`, `credit_report_links`; colunas `fat_orders.credito_liberado_por/em/motivo`.
- **Não testado:** nada foi rodado em navegador, banco real ou API Full real.

## 2. Envio ao SMBI com escolha de empresa (A S Comércio / C Alves) — `docs/SMBI-MULTIEMPRESA.md`
- CRM pronto com interruptor **desligado** (`smbi_robot_state.multiempresa_ativo`), só o admin liga. C Alves está `homologada: false` em `shared/smbiEmpresas.ts`.
- **Falta o lado da VPS (Hermes):** executor que use protocolo v2 (`X-SMBI-Protocolo: 2`), `POST /api/smbi/pedidos/:id/iniciar`, prove a empresa ativa sob o mutex antes e depois de gravar, e valide catálogos da empresa. Só então piloto: 1 pedido na A S, depois 1 na C Alves, um por vez, com OK do Tarcyo.
- Códigos de prazo da **C Alves** (relatório SMBI de 10/10; o sufixo "FT x%" no nome é erro de cadastro, ignorado): à vista 182, 15d 191, 20d 220, 15/25 196, 30d 187, 45d 186, 60d 254, 30/45 202, 30/60 185, 30/45/60 203 (`codigoCondicaoDaEmpresa` em `shared/smbiCondicoes.ts`). **Sem código de propósito:** 20/40/60 (id 249 tem 2 parcelas) e 30/60/90 (id 183 chama-se "30/45/60" mas é 30/60/90) — o dono corrige no SMBI e informa. Produtos têm os mesmos códigos nas duas empresas.
- Dois CNPJs de clientes recentes não existem em nenhuma empresa e precisam de cadastro antes de faturar (cadastro assistido, `docs/SMBI-CADASTRO-ASSISTIDO.md`, agora por empresa).

## 3. Faturamento / CRM — mudanças que afetam leitura de dados
- **Nº interno do pedido `PED-n`** (`fat_orders.numero_crm`, sequência `fat_orders_numero_crm_seq`, só leitura, backfill por data de criação). Não é o movsai do SMBI.
- **"Comissão" → "Prêmio"** apenas nos **rótulos da tela**. Nomes de campo/banco/API (`comissao`, `comissaoPct` etc.) NÃO mudaram; o campo do formulário do SMBI continua com o nome dele. Não renomeie identificadores.
- **Pedido excluído** não some mais da tela: o registro `fat_order_deletion_logs` (agora com `numero_crm` e `pedido_snapshot`) aparece em cinza escuro e riscado (`credito`-independente). A linha em `fat_orders` continua sendo apagada de verdade.
- **Cores de status** como no SMBI: amarelo = faturado, azul = liberado (autorizado), branco = ainda não liberado.
- Editar um pedido **não desfaz mais o vínculo com a tarefa** (bug corrigido); admin/gerente têm "Trocar tarefa". Busca de tarefa para vincular é sem acento.
- Tarefas: ordem padrão **da mais atrasada para a mais nova**, com opção em Filtros e destaque dos melhores clientes (tag "compra muito"/"ativo"). Busca de tarefas sem acento e também nas observações.

## 4. Segurança (15/10/2026)
- IP do cliente por helper único (`server/lib/clientIp.ts`: `x-vercel-forwarded-for` > `x-real-ip` > último hop de `x-forwarded-for`); 500 sem vazar exceção em produção; logs sem PII (`server/lib/logSafe.ts`); webhook do Brevo aceita segredo por cabeçalho (`?secret=` ainda funciona; `WEBHOOK_ALLOW_QUERY_SECRET=0` desliga); `vercel.json` com cabeçalhos corrigidos (os de `headers` eram ignorados); CSP completo só em Report-Only; dependências: `drizzle-orm 0.45`, `vitest 4`, `vite 6`, `react-router-dom` removido; `npm audit --omit=dev` = 0.
- Pendências do dono em painéis (Brevo/Vercel) estão no `ESTADO-DO-PROJETO.md` (item 000).

## 5. O que o Hermes NÃO deve fazer
- Não ligar `multiempresa_ativo`, `roboAtivo`, `credit_settings.bloqueio_ativo` nem trocar `CREDITO_PROVEDOR` — são decisões do Tarcyo.
- Não gastar consulta real de crédito sem pedido do Tarcyo; não gravar token em arquivo; não logar payload bruto nem CPF.
- Não reescrever queries `FOR UPDATE` (regra do `CLAUDE.md`); não subir `SCHEMA_VERSION` sem `npm run schema:lock`.
