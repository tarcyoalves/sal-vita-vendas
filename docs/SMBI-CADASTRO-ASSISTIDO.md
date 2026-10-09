# Cadastro assistido CRM → SMBI — contrato para a VPS (Fase 2)

> **Estado desta entrega: NADA foi instalado, ligado nem executado.** O CRM tem as rotas, a tabela e as procedures,
> mas o gate `cadastro_ativo` nasce **FALSE** (e `GET /api/smbi/cadastros` devolve `{"trabalho":null}` com ele desligado).
> As ferramentas e o daemon da VPS **não estão neste repositório** e não foram tocados. Este documento é o contrato
> para o Hermes implementá-los. Complementa `CONTRATO-ROBO-CRM.md` e `INTEGRACAO-SMBI.md`.

## 1. Fluxo

```
Pedido PENDENTE (CLIENTE_NAO_CADASTRADO)
  └─ staff: solicitarPreviaCadastroSmbi ──► PREPARANDO (revisão 1)
        worker (somente leitura) ── POST previa ──► BLOQUEADO | AGUARDANDO_APROVACAO
        staff: revisarContatosCadastroSmbi (opcional) ──► PREPARANDO (revisão+1, aprovação invalidada)
        admin: aprovarCadastroEContinuarSmbi ──► APROVADO (vale 24 h, para esta revisão e estes hashes)
        worker ── POST iniciar ──► CADASTRANDO  (ponto sem volta; houveRiscoDeEscrita=true ANTES do submit)
        worker ── POST resultado ──► CONFERIDO | INCERTO | DIVERGENTE   (ou JA_EXISTE_CONFERIDO → CONFERIDO)
  └─ admin: liberarPedidoAposCadastroSmbi ──► limpa SÓ a pendência de cliente do pedido originador
```

### Estados e transições (fonte: `shared/smbiCadastro.ts`)

| De | Para (permitido) |
|---|---|
| PREPARANDO | BLOQUEADO, AGUARDANDO_APROVACAO, CONFERIDO (cliente já existia), INVALIDADO |
| BLOQUEADO | PREPARANDO, INVALIDADO |
| AGUARDANDO_APROVACAO | APROVADO, PREPARANDO, INVALIDADO |
| APROVADO | CADASTRANDO, AGUARDANDO_APROVACAO, PREPARANDO, CONFERIDO (já existia), INVALIDADO |
| CADASTRANDO | CONFERIDO, INCERTO, DIVERGENTE |
| INCERTO | CONFERIDO, DIVERGENTE (só reconciliação por leitura). **Nunca volta a CADASTRANDO.** |
| DIVERGENTE | INVALIDADO |
| CONFERIDO | — (terminal) |
| INVALIDADO | PREPARANDO (só se nunca houve tentativa) |

Um registro por CNPJ (`UNIQUE(cnpj)`, 14 dígitos com dígito verificador válido; token inválido é recusado, nunca "corrigido").

## 2. O que o CRM garante

- Gate `cadastro_ativo` (tabela `smbi_robot_state`) **independente** de `robo_ativo`; só `setCadastroAtivo` (admin) o altera, com ator e hora gravados.
- Lease atômico de **no máximo um** trabalho no sistema inteiro (PREPARANDO, ou APROVADO com aprovação viva), 15 min; o token só aparece na resposta do lease e viaja no header `X-SMBI-Reserva`.
- Todo `UPDATE` é condicional (estado + revisão esperados, e a reserva quando exigida) e confere as linhas afetadas; perdeu a corrida = `409`.
- Quem aprova é sempre o **admin autenticado** (ator do contexto, nunca do payload). O worker não tem rota de aprovação.
- Aprovação vale se: estado APROVADO, ≤ 24 h, mesma revisão, `snapshotHash` gravado = hash recalculado do snapshot, mesmo CNPJ do cadastro, `pedidoHash` igual ao do pedido **atual**. Revisar contatos, nova prévia com snapshot diferente ou pedido editado invalidam.
- `iniciar` confere o gate **dentro do próprio UPDATE**. Repetição = `jaIniciado:true`, sem regravar.
- `CADASTRANDO` com reserva vencida vira `INCERTO` (o worker pode ter escrito) no próximo `GET /api/smbi/cadastros`.
- Reenvio do pedido (`dispararSmbi`) é recusado com cadastro CADASTRANDO/INCERTO/DIVERGENTE e nunca altera o estado do cadastro (que vive em tabela própria).
- Continuidade libera **somente** o pedido originador e **somente** a pendência `CLIENTE_NAO_CADASTRADO` dele (histórico na linha do tempo `CADASTRO_PEDIDO_LIBERADO`), com cadastro CONFERIDO, aprovação consistente (exceto `JA_EXISTE_CONFERIDO`), pedido inalterado (`pedidoHash`), sem movsai/vínculo/faturado/criação, e `cadastro_ativo` **e** `robo_ativo` ligados. Pedido alterado depois do cadastro: o cliente segue CONFERIDO e a continuidade é bloqueada.
- Nenhum default fiscal: número de endereço ausente é campo faltante (`S/N` só vale confirmado por humano); regime tributário sem fonte = `BLOQUEADO` (`REGIME_SEM_FONTE`), nunca `tipo_1`.
- Contatos do CRM só entram por relação determinística (tarefa do `taskId` do pedido, mesmo CNPJ exato e válido, mesmo valor; e-mail só se confirmado) ou por confirmação do admin. Nunca por nome parecido.

## 3. O que a VPS precisa garantir

1. **Ferramenta com `--file`** (JSON do trabalho) e **dry-run por padrão**; só escreve com `--gravar --confirmar`. Sem as duas flags, nunca submete.
2. **Envelope único em stdout** (JSON, uma linha); **todo log em stderr**. Formato (`CadastroEnvelopeV1`, `shared/smbiCadastro.ts`):
   ```json
   {"versao":1,"ok":true,"fase":"PREVIA|CADASTRO|RESULTADO","estado":"CONFERIDO","cnpj":"<14 dígitos>","cadastroId":"<uuid>",
    "revisao":2,"snapshotHash":"<sha256>","clienteId":"<código no ERP|null>","houveRiscoDeEscrita":false,
    "divergencias":[{"campo":"ie","esperado":"1","lido":"2"}],"camposFaltantes":[]}
   ```
3. **`houveRiscoDeEscrita` vira `true` ANTES do submit** (e fica true em qualquer saída posterior, inclusive exceção/timeout). Só `false` garante que nada foi escrito.
4. **Busca inconclusiva ≠ ausência.** Erro, timeout, página diferente ou resultado ambíguo na pesquisa de cliente **não** autorizam cadastrar: devolver `INCERTO`/pendência. Só "busca conclusiva sem resultado" é ausência.
5. **Representante único:** exatamente um representante resolvido (`representanteDoc`); zero ou mais de um = bloqueio, nunca escolher o primeiro.
6. **Releitura campo a campo** depois de gravar: ler o cliente no SMBI e comparar cada campo do snapshot; qualquer diferença vira `divergencias` e `DIVERGENTE`. Só `CONFERIDO` com leitura idêntica e `erpClienteId` lido.
7. **Reconciliação após timeout/queda:** com `houveRiscoDeEscrita=true` e sem confirmação, **não** repetir o submit. Rodar leitura por CNPJ; achou e confere → `CONFERIDO`; achou e difere → `DIVERGENTE`; não achou de forma conclusiva → `INCERTO` para decisão humana. `jaIniciado:true` no `iniciar` significa "reconcilie antes de qualquer escrita".
8. **Mutex/wrapper:** um único processo de cadastro por vez na VPS (lock de arquivo/flock), com timeouts duros (navegação, submit, releitura) e kill do navegador ao estourar; o wrapper converte qualquer saída em envelope válido.
9. Nunca logar o segredo, o token de reserva nem o header `Authorization`.
10. Revalidar o CNPJ localmente (dígitos verificadores) e recusar divergência entre o CNPJ do trabalho e o do snapshot.

## 4. Rotas REST (Bearer `SMBI_SYNC_SECRET`, mesmo rate-limit das demais `/api/smbi/*`)

Variáveis ilustrativas: `$CRM` (URL base), `$SMBI_SYNC_SECRET` (segredo do robô, nunca no repositório).

**Simulação (só leitura, sem lease):**
```bash
curl -s -H "Authorization: Bearer $SMBI_SYNC_SECRET" "$CRM/api/smbi/cadastros?simular=1"
# → {"ok":true,"cadastroAtivo":false,"simulacao":true,"trabalhos":[{...sem reservaToken...}]}
```

**Lease (no máximo um trabalho):**
```bash
curl -s -H "Authorization: Bearer $SMBI_SYNC_SECRET" "$CRM/api/smbi/cadastros"
# gate desligado ou fila vazia → {"ok":true,"cadastroAtivo":false,"trabalho":null}
# com trabalho → {"ok":true,"cadastroAtivo":true,"trabalho":{"id","cnpj","pedidoId","fase":"PREVIA|CADASTRO",
#   "estado","revisao","snapshot","snapshotHash","pedidoHash","contatos","aprovacaoExpiraEm","reservaToken","reservadoAte"}}
```

**Releitura da reserva (token só em header, nunca na URL):**
```bash
curl -s -H "Authorization: Bearer $SMBI_SYNC_SECRET" -H "X-SMBI-Reserva: $RESERVA" "$CRM/api/smbi/cadastros/$ID"
# → {"ok":true,"reservaValida":true,"cadastroAtivo":true,"trabalho":{...}}
```

**Prévia (fase PREVIA, somente leitura no SMBI):**
```bash
curl -s -X POST -H "Authorization: Bearer $SMBI_SYNC_SECRET" -H "X-SMBI-Reserva: $RESERVA" -H "Content-Type: application/json" \
  -d '{"revisao":1,"snapshot":{...CadastroSnapshotV1...}}' "$CRM/api/smbi/cadastros/$ID/previa"
# → {"ok":true,"estado":"AGUARDANDO_APROVACAO|BLOQUEADO","revisao":1,"snapshotHash":"…","pedidoHash":"…","divergencias":{"camposFaltantes":[],"bloqueios":[]}}
```
O servidor valida o snapshot (strict), recalcula hash e revisão, **mescla por cima os contatos confirmados no CRM** e libera a reserva. `409` se reserva/estado/revisão não conferem; `409 CNPJ_DIFERENTE` se o snapshot for de outro CNPJ.

**Iniciar (fase CADASTRO, antes de qualquer clique de submit):**
```bash
curl -s -X POST -H "Authorization: Bearer $SMBI_SYNC_SECRET" -H "X-SMBI-Reserva: $RESERVA" -H "Content-Type: application/json" \
  -d '{"revisao":2,"snapshotHash":"…","pedidoHash":"…"}' "$CRM/api/smbi/cadastros/$ID/iniciar"
# → {"ok":true,"estado":"CADASTRANDO","jaIniciado":false,"iniciadoEm":"…"}
# 409: GATE_DESLIGADO | RESERVA_INVALIDA | ESTADO_INVALIDO | APROVACAO_INVALIDA | PEDIDO_ALTERADO | CONCORRENCIA
```
**Se o `iniciar` não devolver 200, a ferramenta não escreve.** Os hashes enviados precisam ser os do `trabalho` leased.

**Resultado:**
```bash
curl -s -X POST -H "Authorization: Bearer $SMBI_SYNC_SECRET" -H "X-SMBI-Reserva: $RESERVA" -H "Content-Type: application/json" \
  -d '{"revisao":2,"snapshotHash":"…","estado":"CONFERIDO","erpClienteId":"9001","divergencias":[]}' "$CRM/api/smbi/cadastros/$ID/resultado"
# estado ∈ CONFERIDO | INCERTO | DIVERGENTE | JA_EXISTE_CONFERIDO
# CONFERIDO/JA_EXISTE_CONFERIDO exigem erpClienteId e zero divergências; DIVERGENTE exige ≥ 1 divergência.
# → {"ok":true,"idempotente":false,"estado":"CONFERIDO"}   (repetição idêntica → "idempotente":true, sem nova escrita)
```
`INCERTO → CONFERIDO|DIVERGENTE` (reconciliação) não exige reserva (a original já venceu), mas exige revisão e `snapshotHash` corretos. `JA_EXISTE_CONFERIDO` é aceito a partir de PREPARANDO/APROVADO/CADASTRANDO/INCERTO e grava CONFERIDO com `motivo_codigo=JA_EXISTE_CONFERIDO` (nenhuma escrita houve).

Erros nunca devolvem `Authorization`, token ou cookie: `{"error":"…","codigo":"…"}`.

## 5. Procedures tRPC (`faturamento.*`)

| Procedure | Quem | O que faz |
|---|---|---|
| `solicitarPreviaCadastroSmbi({pedidoId})` | staff | Pedido aprovado, pendência `CLIENTE_NAO_CADASTRADO`, sem movsai/vínculo/faturado/criação → cria/reativa cadastro PREPARANDO. **Não cadastra.** |
| `cadastroSmbiStatus({pedidoId})` | staff | Estado, snapshot, faltantes/bloqueios, aprovação, `pedidoAlterado`, `podeLiberar`, gates. Sem token. |
| `revisarContatosCadastroSmbi({cadastroId,revisao,contatos})` | staff (`TARCYO_CONFIRMADO` só admin) | Mescla contatos com origem; revisão+1; invalida aprovação; volta a PREPARANDO. |
| `aprovarCadastroEContinuarSmbi({cadastroId,revisao,snapshotHash,pedidoHash})` | **admin** | Grava aprovação (24 h) com ator do contexto. **Não** executa navegador e **não** mexe no pedido. |
| `setCadastroAtivo({ativo})` | **admin** | Liga/desliga o gate (default FALSE; auditado em `cadastro_atualizado_por/em`). |
| `liberarPedidoAposCadastroSmbi({cadastroId,pedidoHash})` | **admin** | Continuidade: limpa só a pendência de cliente do pedido originador e o devolve à fila do robô. |

Linha do tempo do pedido (`smbi_order_events`): `CADASTRO_PREVIA_SOLICITADA`, `CADASTRO_PREVIA`, `CADASTRO_CONTATOS_REVISADOS` (só nomes/origens dos campos, sem PII), `CADASTRO_APROVADO`, `CADASTRO_INICIADO`, `CADASTRO_CONFERIDO|INCERTO|DIVERGENTE`, `CADASTRO_PEDIDO_LIBERADO`.

## 6. Ordem de implantação

1. **Migração com gate FALSE.** Deploy do CRM (build migra o banco do CRM; confira `[migrate:build] ok`). Nada executa: tabela vazia, `cadastro_ativo=false`.
2. **Ferramentas da VPS** (dry-run) e testes com `?simular=1` e snapshots de teste; nenhuma escrita no SMBI.
3. **Daemon** consumindo `GET /api/smbi/cadastros` (devolve `trabalho:null` enquanto o gate estiver desligado). Primeiro só a fase PREVIA.
4. **Piloto:** um cliente, admin liga `setCadastroAtivo`, acompanha prévia → aprovação → `iniciar` → conferência; desliga o gate ao terminar. Só então o próximo.

## 7. Limites desta entrega

- Não instalou nem ligou nada; não habilitou o gate; não rodou DDL contra banco real (a migração roda no build/startup do CRM).
- Não alterou `robo_ativo`, o Premium (`ORDERS_DATABASE_URL`) nem emite fiscal.
- CNPJ alfanumérico (novo formato da Receita) **não** é aceito: o CRM inteiro guarda CNPJ como 14 dígitos.

## Cadastro por empresa (multiempresa)

O cadastro é por **(empresa, CNPJ do cliente)**: `smbi_client_registrations.empresa_cnpj` + índice único
`(empresa_cnpj, cnpj)` (substitui a unicidade só por `cnpj`). A aprovação e a conferência numa empresa **não valem** na outra.
O snapshot carrega `empresaCnpj` (entra no hash); `previa`/`iniciar`/`resultado` do worker informam a empresa e divergência é
recusada (`EMPRESA_DIFERENTE`). O trabalho entregue ao worker leva `empresaCnpj`. A coluna tem `DEFAULT '51422900000168'` só
para o ALTER não quebrar linhas existentes (a tabela está vazia em produção); o código sempre informa a empresa. O cadastro
nasce da empresa escolhida no pedido; sem empresa escolhida, `solicitarPreviaCadastroSmbi` exige `empresaCnpj` (com a
multiempresa desligada vale a empresa legada, como antes). Ver `docs/SMBI-MULTIEMPRESA.md`.
