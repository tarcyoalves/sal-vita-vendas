# Análise de crédito — CRM Lembretes

Só CRM Lembretes (banco `DATABASE_URL`). A loja Premium não é tocada.

## Decisões (Opus, 15/10/2026)
- **Contrato único:** `shared/credito.ts` (`RelatorioCredito`, `calcularVeredito`, cache de 30 dias).
- **Provedor plugável:** `server/lib/credito/provedores/` com interface `ProvedorCredito.consultar(doc)`.
  - `simulado` (padrão; sem custo, para desenvolvimento e testes) e `boavista_apifull` (real).
  - O adaptador real **só é finalizado com a documentação da API Full e uma resposta real sanitizada**
    (sem CPF/nome de pessoa) em `tests/fixtures/credito/`. Não inventar campos do JSON.
  - Credenciais só na Vercel: `CREDITO_PROVEDOR`, `CREDITO_API_URL`, `CREDITO_API_TOKEN`. Nunca no repo.
- **Custo:** só admin dispara (`adminProcedure`).
  - Antes de chamar, reaproveita a consulta do mesmo documento com menos de 30 dias.
  - Trava atômica contra clique duplo (a mesma consulta em andamento não cobra duas vezes).
  - Teto mensal de consultas pagas configurável (`credito_limite_mensal`, padrão 50).
  - Cada chamada paga fica num razão (`credit_queries`) com quem, quando, documento, custo e resultado.
- **Leitura:**
  - Atendente vê o card (semáforo, score, veredito, data) só dos clientes/tarefas dele.
  - Admin e gerente veem tudo.
  - O PDF completo (sócios com CPF, consultas) é só admin/gerente. Atendente não baixa.
- **PDF:** gerado no servidor, com layout próprio "Relatório de Crédito — Sal Vita" (fonte: Boa Vista/SCPC).
  - **Não imita marca/logo da Serasa nem da Boa Vista.**
  - Seções inspiradas no relatório que a empresa já usa: resumo com score e veredito, dados cadastrais,
    quadro societário, anotações negativas por grupo, consultas recentes e rodapé de confidencialidade.
- **SMBI:**
  - Pedido com prazo diferente de "à vista" cujo cliente tem veredito `REPROVADO_A_PRAZO` vigente é recusado
    no `dispararSmbi` (`CREDITO_REPROVADO`), salvo liberação do admin (auditada, por pedido).
  - Interruptor `credito_bloqueio_ativo`, padrão **desligado**.
  - Sem relatório não bloqueia, só avisa.
- **LGPD:**
  - O payload bruto fica só no banco, sem log.
  - Consulta de CPF exige motivo (concessão de crédito) registrado.

## Estado de implementação (15/10/2026) — ver também `docs/HERMES-CRM-LEMBRETES-OUT-2026.md`
- Contrato `shared/credito.ts`; veredito + `analisarSinais`; provedores `simulado` e `boavista_apifull`; router `credito`
  (status, ultimo, semaforos, relatorio, consultar, historico, listar, porPedido, vincular, desvincular, setBloqueioAtivo,
  setLimiteMensal, liberarPedido, saldo, pdf); PDF `server/lib/credito/pdf.ts`; telas em `client/src/components/credito/` e
  `client/src/pages/AnaliseCredito.tsx`.
- API Full (OpenAPI oficial): base `https://api.apifull.com.br`; `POST /api/scpc-boavista` com `{link, document}`;
  `GET /api/get-balance`; Bearer; erro pode vir com HTTP 200 (ler `status`). `dados` sem schema: suposições S1 (status de
  sucesso) e S2 (score em `dados.score|pontuacao`) a validar na 1ª resposta real.
- A spec do Hermes de 15/10 (coordenacao/ativo) está superada por este documento.

## Escolha do endpoint (custo-benefício) — sonda `scripts/credito/sonda-apifull.mjs`
O OpenAPI da API Full não traz preços. Candidatos para CNPJ (todos `POST /api/<endpoint>` com `{link, document}`; os `pj-*` também aceitam `cnpj`):
`serasa-premium`, `serasa-premium-v2`, `serasa-basica` (o relatório que a Sal Vita já usa, o "Relato" da Serasa), `scpc-boavista`, `pj-define-risco`, `pj-define-limite`, `pj-define-negocio`, `pj-quod-consulta`, `protesto-nacional`, `e-cenprot`, `cnpj` (cadastro), `ic-cndt`.
A sonda roda até 6 endpoints num CNPJ real, mede o **custo real pela diferença de saldo** (`get-balance`), guarda a resposta **sanitizada** e imprime o quadro (custo, status, nº de campos). Só executa com `--confirmar`; token só no ambiente. Depois da sonda escolhe-se o endpoint e ajusta-se `mapearRespostaBoaVista` (ou um mapeador por endpoint) com a resposta real.

## Custos reais medidos na API Full (extrato oficial, 16/10/2026, CNPJ 86.628.401/0001-06)
- Boa Vista Essencial Positivo (`scpc-boavista`): **R$ 2,75** — 673 campos; score, restrições detalhadas, protestos, cheques.
- Serasa Premium (`serasa-premium`): **R$ 6,72** — 950 campos; score, sócios, veículos, protestos, consultas.
- Define Risco Positivo (`pj-define-risco`): **R$ 15,09** — 484 campos; score, faturamento presumido, recomendação.
- Total da sonda R$ 24,56 (média R$ 8,19). Saldo após: R$ 25,44.
- Decisão pendente de cobertura de campos (tempo de empresa, sócios com data de entrada, consultas recentes, última compra):
  depende da estrutura das respostas (`scripts/credito/estrutura-resposta.mjs`).
