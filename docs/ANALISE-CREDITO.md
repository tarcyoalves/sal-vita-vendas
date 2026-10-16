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
- Consulta simples = Boa Vista Essencial Positivo (`scpc-boavista`): **R$ 2,75** — 673 campos; score, restrições detalhadas, protestos, cheques.
- Serasa Premium (`serasa-premium`): **R$ 6,72** — 950 campos; score, sócios, veículos, protestos, consultas.
- Define Risco Positivo (`pj-define-risco`): **R$ 15,09** — 484 campos; score, faturamento presumido, recomendação.
- Total da sonda R$ 24,56 (média R$ 8,19). Saldo após: R$ 25,44.
- Decisão pendente de cobertura de campos (tempo de empresa, sócios com data de entrada, consultas recentes, última compra):
  depende da estrutura das respostas (`scripts/credito/estrutura-resposta.mjs`).

## Seletor de consultas com preço (16/10/2026)
O diálogo "Consultar crédito" virou um **seletor**: o admin marca o que quer, vê o total somando na hora e só então gasta.

**Catálogo único** — `shared/creditoCatalogo.ts` (servidor e tela leem o mesmo). Cada item: `chave`, `endpoint`, `nome`,
`custoReais` (`null` = ainda não medido), `recomendado`, `mostra {confirmado, aConfirmar}`, `quandoUsar`.
Preços **medidos em 16/10/2026** (podem mudar; refaça a sonda): `boavista` R$ 2,75 (padrão, recomendado),
`serasa_premium` R$ 6,72, `define_risco` R$ 15,09. Sem preço medido (aparecem desabilitados e o servidor recusa com
BAD_REQUEST): `serasa_basica`, `protesto_nacional`, `cenprot`, `cnpj_cadastro`, `cndt`. Para medir, rode a sonda e troque o `null`.
As descrições dos não medidos são só "a confirmar" (texto curto nosso, não copiado do OpenAPI).

**`credito.consultar`** recebe `produtos: string[]` (1 a 3 chaves, sem repetição, só com custo medido). Sem `produtos` = `['boavista']`.
- Cache de 30 dias **por (documento, produto)**; `forcarNova` vale para todos os marcados. Provedor simulado cobra R$ 0.
- Antes de gastar, sobre os itens NÃO reaproveitáveis: teto por consulta (`credit_settings.teto_por_consulta_reais`, padrão R$ 30;
  `BAD_REQUEST`), saldo da API Full (`PRECONDITION_FAILED`; fail-open se o saldo estiver indisponível) e limite mensal por contagem,
  1 por produto (`FORBIDDEN`). A mesma função (`verificarLimitesCusto`) roda na tela e no servidor.
- Trava atômica por documento: um único INSERT cria uma linha `EM_ANDAMENTO` por produto (todas ou nenhuma) em `credit_queries`
  (coluna nova `produto`). Cada produto OK grava UMA linha em `credit_reports` (`produto` = chave, `custo_reais` = catálogo) e fecha a sua linha do razão.
- Retorno: `{ resultados: [{ produto, ok, reaproveitado, cobrado, custoReais, id?, veredito?, erro? }], custoCobradoReais, parcial, veredito, id, reaproveitado }`.
  Se um produto falha e outro já cobrou, volta o resultado **parcial** (`cobrado` explícito); se tudo falha sem cobrança, erro BAD_GATEWAY.
- Linhas antigas guardavam o nome do provedor em `credit_reports.produto`; `chaveDoProdutoGravado` as trata como `boavista`.

**Veredito efetivo** = o PIOR veredito entre os relatórios válidos (<30 dias) de qualquer produto
(REPROVADO_A_PRAZO > COM_RESTRICAO > APROVADO). Vale para `ultimo`, `semaforos` e o bloqueio no SMBI. `ultimo` devolve também
`produtos: [{ produto, nome, consultadoEm, valido, veredito, custoReais }]` (chips no card). **Atenção:** uma consulta cujo score não seja
reconhecido (ex.: Serasa com "score não calculado") vira COM_RESTRICAO ("Score não informado") e, pela regra do pior, pode rebaixar o
semáforo do documento.

**Mapeamento por produto** — `server/lib/credito/provedores/mapeadores.ts`. Estrutura real vista em 16/10/2026 (CNPJ de teste):
`{status:'sucesso', dados:{HEADER, CREDCADASTRAL, VEICULAR}, aux}`; números em string com vírgula ("9451,05"), percentuais "3,0%",
datas dd/mm/aaaa, vazio = "". Mapeadores REAIS: `boavista` e `serasa_premium` (cadastro, score, pendências, protestos, cheques
BACEN+varejo, consultas, comportamento no Boa Vista; sócios, veículos, faturamento presumido, ações cíveis, passagens comerciais
no Serasa) e o mínimo do `define_risco` (score, classe, probabilidade, decisão, faixa de faturamento, total de consultas; as chaves
de classe/probabilidade/decisão/consultas são buscadas por nome porque só parte delas foi vista). Os demais seguem no defensivo.
- No Serasa a entrada de score "NÃO CALCULADO" é ignorada (vale a que tem probabilidade); sem nenhuma, score = null.
- Bloco ausente = `consultado:false` ("Não informado pela fonte"); "Nada consta" só quando o bloco veio com quantidade 0.
- Contatos (telefone/e-mail) NÃO são mapeados (dado pessoal). Campos de itens de protesto/cheque/ação ainda não vistos: leitura defensiva.
- Contrato: `RelatorioCredito.complementos?` (aditivo) = `faturamentoPresumidoFaixa`, `veiculos`, `consultas12Meses`; aparece no relatório e no PDF.
- Fixtures SINTÉTICAS em `tests/fixtures/credito/apifull-*.json` e testes em `tests/credito-mapeadores.test.ts`.
- **Ponto de atenção não avaliável com estas fontes:** a data de entrada de sócio NÃO vem pela API (veio vazia no Serasa), então o
  sinal `SOCIO_RECENTE` só dispara se houver data; hoje não é avaliável. O Boa Vista não traz sócios nem faturamento presumido.

**Outras procedures:** `credito.catalogo` (protegida; com `documento` traz `ultimoPorProduto`, mesmas regras de acesso de `ultimo`),
`credito.setLimites` (admin: `limiteMensal` e/ou `tetoPorConsultaReais`), `credito.status` ganhou `gastoNoMesReais` e `tetoPorConsultaReais`.

**Painel** (`/analise-credito`): saldo grande, aviso amarelo "Saldo baixo" abaixo de `SALDO_BAIXO_REAIS` (R$ 15, `shared/credito.ts`),
gasto do mês, tabela "O que cada consulta mostra" e, no arquivo de análises, o produto e o custo de cada relatório.

**Migração:** `SCHEMA_VERSION` = `2026-10-16a`; colunas aditivas `credit_queries.produto` e `credit_settings.teto_por_consulta_reais`
(`ensureCreditColumns`, chamada por `ensureRecentSchema`).

## PDF completo com anexo da resposta do provedor (16/10/2026)
Pedido do dono: "todas as informações possíveis". O PDF (`credito.pdf`, só admin/gerente) agora recebe também o
`payload_bruto` (3º parâmetro opcional de `gerarPdfCredito`; sem bruto, como o simulado, não há anexo).
- **Corpo principal:** "Detalhamento das anotações" mostra TODAS as ocorrências (sem corte). Cada item do contrato ganhou
  `extras?: Record<string,string>` com os demais campos não vazios da ocorrência (rótulo humanizado, CPF mascarado, URLs
  omitidas); protesto/cheque/ação usam tipo/espécie na descrição ("Protesto — <espécie>") e "<cartório> — <cidade>/<UF>" no local.
  Se a fonte diz M ocorrências e listou N < M: aviso "A fonte listou N de M ocorrências". Mesmos extras e aviso na tela
  (`RelatorioCreditoDialog`). Consultas recentes: todas as que a fonte trouxer + tabela "Consultas por mês" (HIST_CONSULTAS.QUANTIDADES).
- **Anexo "Dados completos da resposta do provedor"** (`server/lib/credito/pdfAnexo.ts` monta o modelo; `pdf.ts` desenha):
  genérico, sem mapeador. Um bloco por chave de `dados.CREDCADASTRAL`/`VEICULAR`/outras, títulos em português
  (`shared/creditoRotulos.ts`; chave desconhecida é humanizada; prefixos `xxx:` do Define Risco removidos; nenhum nome de bureau).
  Objeto escalar -> tabela Campo|Valor; array de objetos -> tabela com TODAS as linhas e colunas = união das chaves não vazias
  (máx. 7 por tabela; acima disso, fatias de colunas consecutivas repetindo a 1ª coluna); array de escalares -> lista.
  Cabeçalho repetido a cada página, células com quebra de linha.
- **Ruído:** `HEADER.DADOS_RETORNADOS` e `CONTROLE` não são impressos; vira "Blocos entregues pela fonte: A, B" (os "1"). `HEADER.PARAMETROS` -> "Parâmetros da consulta".
- **LGPD:** CPF em qualquer padrão mascarado como no resto do PDF; telefone/e-mail de pessoa física (TIPO_PESSOA/TIPO_DOCUMENTO
  físico, ou consulta de CPF) mascarados (últimos 4 dígitos / 2 letras + domínio); os de pessoa jurídica completos; URLs de imagem/arquivo nunca impressas.
  Única URL: a linha final "PDF original do provedor: <aux.data>" (texto; o servidor não baixa nada).
- **Limites:** teto de 80 páginas no PDF; o anexo para e imprime "Anexo truncado: N registros omitidos". Falha em um bloco -> "Bloco não renderizado"; falha do anexo inteiro nunca derruba o PDF principal.
- **Tela:** botão "Baixar PDF (completo)" e, para admin, link "PDF original do provedor" via `credito.linkOriginal({id})` (devolve a URL ou null).
- **Cabeçalho do PDF:** "Fonte dos dados: API Full/<produto do catálogo>" (provedor interno nunca aparece).
- Teste: `tests/credito-pdf-anexo.test.ts` com `tests/fixtures/credito/apifull-boavista-volumoso.json` (29 protestos, 19 consultas, sintético).

## Relatório consolidado do documento (16/10/2026)
Motivo: o dono consultou um CNPJ com DUAS consultas marcadas (Consulta simples + Serasa Premium) e "o Serasa não puxou". Cada produto
já gravava seu relatório (e o Serasa foi cobrado), mas o diálogo abria só o relatório do 1º produto (`id` = o primeiro obtido) e o
arquivo mostra uma linha por produto. Agora há UM relatório do CNPJ com as fontes combinadas, sem inventar nada.

**`consolidarRelatorios(itens, agora?)`** (`shared/credito.ts`, puro, testado em `tests/credito-consolidado.test.ts`):
- Entram o mais recente VÁLIDO (<30 dias) de cada produto; simulados saem se houver real; se nada vale, o mais recente de cada produto com `valido:false`.
- `scores`: um por fonte (`produtoNome, valor, probabilidadeInadimplencia, faixa, texto, calculado`). **Nunca fundidos** (modelos diferentes).
  Fonte sem score = `calculado:false` ("Serasa Premium: score não calculado"); o `fundido.score` (só para as regras) é o PIOR score calculado.
- Cadastro por campo: primeiro não nulo em [serasa_premium, boavista, define_risco]; sócios da 1ª fonte que os tiver; faturamento/veículos de quem tiver;
  consultas: união por (data + consultante), total em 12 meses = o maior; comportamento: merge por campo não nulo.
- Anotações por grupo: quantidade = a MAIOR entre as fontes que consultaram (nunca a soma; se a união listar mais ocorrências distintas, vale a lista);
  `valorTotal` = o da fonte de maior quantidade; itens = união deduplicada ENTRE fontes (mesma data, mesmo valor, credor/local compatíveis) com
  `fonte?: string` (campo aditivo do item; "A + B" quando as duas trouxeram). Quantidades diferentes viram `divergenciaPorGrupo`
  ("Consulta simples: 0 · Serasa Premium: 10"); ocorrência que só uma fonte cobre e scores a 200+ pontos de distância entram em `divergencias`.
- Veredito = o PIOR entre o de cada relatório (mesma regra de `ultimo`/`semaforos`) e o do relatório fundido. O motivo genérico "Score não informado
  pela fonte" vira "<fonte>: score não calculado". Consequência já existente e mantida: um Serasa sem score continua deixando o semáforo no mínimo amarelo.
- Seleção no servidor: `selecionarParaConsolidado` (`server/lib/credito/produtos.ts`, pura).

**Procedures (staff; atendente não):**
- `credito.relatorioDocumento({ documento })` -> `{ documento, consolidado, ids, veredito, motivos, semaforo, sinais }` (NOT_FOUND sem relatório).
- `credito.pdfDocumento({ documento })` -> `{ nomeArquivo: analise-credito-<doc>-<AAAAMMDD>.pdf, base64 }`.
- `credito.consultar` devolve também `documento` (e continua devolvendo `id`/`resultados`); `credito.listar` devolve `fontes` (produtos distintos do documento nos últimos 30 dias).
- `relatorio({id})` e `pdf({id})` seguem por relatório individual.

**PDF consolidado** (`gerarPdfCreditoConsolidado`, mesmo desenho do individual): topo uma vez com "Fontes: Consulta simples (16/10 15:02) + Serasa Premium (16/10 15:03)";
veredito/motivos; "Score por fonte" (uma linha por fonte + aviso de que cada score vem da fonte); pontos de atenção; anotações com a linha
"Divergência entre fontes — ..." e a coluna "Fonte" nos itens; empresa (mescla), sócios, consultas, comportamento. O anexo "Outras informações da
fonte" existe só no PDF individual (para não repetir dados entre fontes).

**Telas:** depois de uma consulta com 2+ produtos sem falha, o diálogo abre o relatório consolidado (`RelatorioCreditoDialog documento=...`). Se algum produto
falha, o diálogo FICA aberto com o resultado por produto (verde/cinza/vermelho, a mensagem do provedor e "Não foi cobrado"/"FOI cobrada"); erro total também fica
na tela, além do toast. `CreditoCard` e o arquivo ganharam "Relatório do CNPJ" e, no arquivo, o selo "N fontes" (tabela continua fina).
