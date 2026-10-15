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
