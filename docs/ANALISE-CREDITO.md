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

**PDF consolidado:** reprojetado para decisão em 16/10/2026 (ver a seção "Consolidado para decisão" abaixo). O anexo "Outras informações da fonte" existe só no PDF individual (para não repetir dados entre fontes).

**Telas:** depois de uma consulta com 2+ produtos sem falha, o diálogo abre o relatório consolidado (`RelatorioCreditoDialog documento=...`). Se algum produto
falha, o diálogo FICA aberto com o resultado por produto (verde/cinza/vermelho, a mensagem do provedor e "Não foi cobrado"/"FOI cobrada"); erro total também fica
na tela, além do toast. `CreditoCard` e o arquivo ganharam "Relatório do CNPJ" e, no arquivo, o selo "N fontes" (tabela continua fina).

## Consolidado para decisão: dois scores do Serasa, matriz de comparação e PDF sem redundância (16/10/2026)
Pedido do dono: "consolidado os dois relatórios, bem alinhados e estruturados visualmente, para tomada de decisão... PDF bem completo e sem
redundâncias... dados totalmente verídicos". As fontes DISCORDAM (ex.: Consulta simples 625/B x Serasa 695 e 265; Boa Vista "sem pendências" x Serasa
com pendências): o relatório existe para o dono DECIDIR, então a divergência fica visível e **nunca** é resolvida por média.

**Contrato novo (tudo opcional e aditivo, `shared/credito.ts`):**
- `score.rotulo?` e `score.outros?: ScoreExtra[]` (`{valor, probabilidadeInadimplencia, faixa, texto, rotulo}`): TODOS os scores de uma fonte. O Serasa Premium traz
  dois (`SCORES.OCORRENCIAS`). O principal (`score.valor`) segue sendo a 1ª entrada calculada (compatível com o que já existia); as demais ficam em `outros`
  ("NAO CALCULADO" vira `valor: null`, mostrado como "não calculado"). Rótulo "Score 1"/"Score 2", ou o `DESCR_SCORE`/`TIPO_SCORE`/`LAYOUT` da fonte quando todos
  vêm preenchidos e diferentes. `entradasDeScore(score)` devolve a lista completa.
- `complementos.consultasJanelas {ate30, de31a60, de61a90, mais90}` (contagens OFICIAIS do Serasa: `INFORMACOES_ALERTAS_RESTRICOES` "CONSULTAS 30 DIAS" etc. +
  "QUANTIDADE TOTAL: N"), `consultasPorSegmento [{mes 'AAAA-MM', quantidade, segmento}]` (de "ULTIMAS CONSULTAS": `DATA:/10/2025/QUANTIDADE:2/SEGMENTO:...`, sem consultante),
  `consultasPorMes [{ano, meses[12]}]` (matriz Jan-Dez do Boa Vista), `funcionariosFaixa`, `cnaesSecundarios`, `tempoAtuacao`, `matrizFilial`, `representante {nome, documento}`.
- Itens de anotação ganham `processo?`. Ações cíveis: `descricao` = ação, `local` = "foro/UF — vara", `data` = distribuição, mais `valor`; o requerido vai em `extras`.
- `RelatorioConsolidado`: `scores[]` agora tem UM item por score de cada fonte (com `rotulo`); novos `matriz: LinhaMatriz[]` (por grupo e por fonte: quantidade, valor, `leitura`
  = divergem/coincidem/nada_consta/so_uma/nao_consultado/unica), `consultasPorFonte`, `consultas12Divergem`, `scoreAltoComRestricao`; `divergenciaScore` agora também pega
  scores distantes DENTRO da mesma fonte (688 x 281). Textos/cores da matriz vivem em `shared/creditoMatriz.ts` (tela e PDF usam os mesmos).
- Veredito: com mais de um score numa fonte vale o PIOR calculado (regra conservadora Sal Vita; o motivo diz de qual fonte e qual score: "Score 281 (Serasa Premium, Score 2) abaixo de 400").
  **Efeito prático:** um Serasa com um score < 400 reprova a prazo mesmo que o outro seja alto. Mude em `calcularVeredito` se o dono preferir outra regra.

**Sinal "Muitas consultas" (`analisarSinais`/`contagemConsultas30`):** usa PRIMEIRO a contagem oficial (janela "30 dias" do Serasa; ou a linha do mês corrente da matriz do
Boa Vista) e só em último caso a lista parcial (que subestima: o Boa Vista lista só as 5 últimas). Com as duas fontes usa o maior número oficial e cita a origem no
detalhe ("Segundo Serasa Premium: 7 em 30 dias; segundo Consulta simples: 3 em out/2026 (mês corrente)"). Contagem oficial 0 vence a lista. A janela do Boa Vista é o mês
calendário, não 30 dias corridos (a matriz só tem meses); por isso a matriz mostra "Janelas diferentes: não comparável" e só compara os totais de 12 meses.

**Relatórios já pagos:** `relatorioDocumento`/`pdfDocumento` refazem o conteúdo de cada fonte a partir do `payload_bruto` com o mapeador atual (`relatorioAtualizado`,
`server/lib/credito/consolidadoTela.ts`), sem nova consulta e sem custo: o Serasa gravado antes desta mudança já aparece com os dois scores. Sem bruto, vale o gravado.

**PDF consolidado (`pdfConsolidado.ts`; primitivas e seções comuns em `pdfBase.ts`; o individual segue em `pdf.ts`):** topo (título, razão social, CNPJ, "Fontes: A (dd/mm hh:mm) · B (...)";
aviso "Só uma fonte consultada" quando falta uma das duas) > painel de decisão (veredito com semáforo e motivos "regras da Sal Vita" + um CARTÃO por score de cada fonte: valor, probabilidade,
faixa, régua 0-1000 com marcador, texto da fonte; nota "scores informados pelas fontes; não calculados pela Sal Vita"; avisos âmbar de divergência e de score alto com restrições) > matriz de
comparação (Protestos, Pendências/restrições, Cheques, Ações, Falência, Consultas x Consulta simples | Serasa Premium | Leitura, cor verde/vermelho/cinza, "Divergem") > pontos de atenção
> detalhamento das ocorrências (uma tabela por tipo, coluna Fonte; ações com ação, foro/vara, processo, data, valor) > dados da empresa (grade de 2 colunas, sem campo vazio, sem repetir
razão social/CNPJ) > sócios (CPF mascarado; se a fonte já mascarou, impresso como veio) > consultas (janelas oficiais, total em 12 meses, últimas, tabela Jan-Dez, segmentos) > comportamento comercial
> texto final (LGPD, uma vez). Rodapé só "Página X de Y"; sem cabeçalho por página. Nenhum telefone/e-mail é impresso. Fixture completa: 3 páginas; só Serasa: 2.

**Tela (`RelatorioCreditoDialog`, modo documento):** a mesma ordem, em componentes (`ScoresDasFontes`, `MatrizComparacao`, `RelatorioSecoes`). Em tela estreita (< 640px) a matriz vira cartões empilhados
(um por item, uma linha por fonte). Com uma só fonte aparece "Só uma fonte consultada: faltam os dados da outra" e o botão "Consultar a outra fonte" (só admin): abre uma confirmação que diz que a
consulta é PAGA, mostra o valor e exige o motivo (`ConsultarOutraFonte`); ao concluir o relatório se refaz sozinho.

**Fluxo de consulta:** o `ConsultarCreditoDialog` tem o botão de um clique "Consulta completa (Consulta simples + Serasa Premium) — R$ 9,47" (nomes e preço do catálogo; some se algum preço não estiver medido).
Depois de uma consulta com sucesso das duas, abre o consolidado (já existia).

**NÃO visto ainda (suposições a validar com a resposta real do Serasa):** os nomes exatos das chaves do JSON real das listas novas. Foram lidos de forma defensiva a partir do que o PDF do provedor mostra:
`ACOES_CIVEIS.OCORRENCIAS[]` (`REQUERIDO, ACAO, FORO, UF, VARA, PROCESSO, DISTRIBUICAO, VALOR`), a faixa do score (`CLASSIF_ABC` > `FAIXA_SCORE` > `FAIXA` > `DESCR_FAIXA` > `CLASSIF_NRO`), o descritor do score
(`DESCR_SCORE`/`TIPO_SCORE`/`LAYOUT`), CNAEs secundários (`CNAE_SECUNDARIOS`...), `TEMPO_ATUACAO`, `MATRIZ_FILIAL`, `REPRESENTANTE` e o formato de "ULTIMAS CONSULTAS". Campo não encontrado fica vazio (nada é inventado).
Se a primeira resposta real trouxer outro nome, é um ajuste de uma linha em `mapeadores.ts`; "Reprocessar (sem custo)" ou abrir o consolidado refaz a partir do bruto já pago.
Os avisos do quadro ("AÇÕES CÍVEIS / RESTRIÇÕES FINANCEIRAS / CHEQUES SEM FUNDOS BACEN / TÍTULOS PROTESTADOS: NADA CONSTA / N OCORRÊNCIAS") não são usados: repetem os blocos já mapeados.

**Testes e exemplo:** fixtures SINTÉTICAS `tests/fixtures/credito/apifull-serasa-completo.json` e `apifull-boavista-completo.json` (mesmo CNPJ fictício 12.345.678/0001-95), `consolidado-completo.ts`;
`tests/credito-consolidado-completo.test.ts`, `tests/credito-consolidado-ui.test.ts`, `tests/credito-mapeadores.test.ts`. Exemplo: `docs/exemplos/relatorio-credito-consolidado.pdf`
(`npx tsx scripts/credito/gerar-exemplos.ts`). Dados reais de clientes nunca entram no repositório.

## Correções do PDF individual do Serasa Premium real (16/10/2026)
O dono baixou o PDF individual de uma consulta SÓ do Serasa Premium e apareceram estes defeitos (todos corrigidos no PDF individual, no consolidado e na tela;
teste: `tests/credito-serasa-defeitos.test.ts`, fixture sintética `tests/fixtures/credito/apifull-serasa-alertas.json`):
- **Rótulo da fonte:** `relatorio.fonte.produto` guarda o NOME ("Serasa Premium"), e `chaveDoProdutoGravado` só casava por CHAVE (caía no legado "Consulta simples"). Agora
  `chaveDoProdutoGravado`/`nomeDoProduto` reconhecem chave, nome do catálogo (sem acento/caixa) e o legado; o PDF individual e a tela usam a coluna `produto` do registro quando existe
  (`gerarPdfCredito(..., meta.produto)`, `credito.pdf`/`credito.relatorio`).
- **"Alerta da fonte":** só alerta/restrição de verdade (`alertasDe` em `pdfAnexo.ts`), uma linha por alerta distinto, sem nível ("— 1 — informacao"). Nunca viram alerta os títulos
  CONSULTAS 30/31 A 60/61 A 90/90+ DIAS, ULTIMAS CONSULTAS, MATRIZ/FILIAL, TEMPO DE ATUACAO, CNAES SECUNDARIOS, REPRESENTANTE, AERONAVES, IMOVEIS nem "NENHUM REGISTRO ENCONTRADO".
  O mapeador do Serasa lê MATRIZ/FILIAL, TEMPO DE ATUACAO, CNAES SECUNDARIOS ("cod-DESC /cod-DESC") e REPRESENTANTE desse bloco para `complementos` (INFORMACOES_DA_EMPRESA tem prioridade).
- **Consultas:** linha "Consultas por janela" (até 30 / 31 a 60 / 61 a 90 / mais de 90 dias) e tabela "Consultas por mês e segmento" (mês/ano, quantidade, segmento humanizado; o segmento que a fonte
  corta em ~30 caracteres perde a palavra solta e ganha reticências). A lista COM consultante continua vindo só de PASSAGENS_COMERCIAIS.
- **Faixa "NULO":** `faixaExibivel` (NULO/NULL/NAO CALCULADO/"-" = sem faixa, omitida; o mapeador tenta as outras chaves de faixa antes de desistir). `frasePelaFonte`: o "E" só vira "é" diante de
  "PROVAVEL"/"DE" e nunca entre números ("entre 501 e 600").
- **Dados da empresa:** "20 a 99 colaboradores" (sem repetir a palavra); situação "ATIVA (informada em dd/mm/aaaa)" no Serasa e "(em dd/mm/aaaa)" nas demais fontes, nunca "desde"; CNAEs secundários em lista
  "código — descrição" (até 6 e "+N"); o endereço do Serasa vem de `SOMENTE_ENDERECO.DADOS[0]` (ou `ENDERECOS`) e preenche endereço/município/UF (CEP formatado).
- **Anexo "Outras informações da fonte":** blocos de endereço (SOMENTE_ENDERECO/ENDERECOS), flags "registro localizado", códigos de identificação e tipo de pessoa nunca são impressos; se sobrar só ruído o anexo não sai.
- **NÃO visto:** os nomes exatos dos campos de nível/tipo dentro de INFORMACOES_ALERTAS_RESTRICOES e o formato exato das observações de REPRESENTANTE (lidos de forma defensiva); `SOMENTE_ENDERECO.DADOS` segue a descrição do dono.
