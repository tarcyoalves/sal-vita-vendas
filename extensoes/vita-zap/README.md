# Vita Zap — extensão do Chrome para o WhatsApp Web (fase 1, sem IA) — versão 0.4.0

Copiloto comercial que vive num **painel lateral** ao lado do WhatsApp Web. Ele acha os
contatos nas suas conversas, monta a lista, escreve a mensagem e abre cada conversa com o
texto pronto. **No modo padrão, quem envia é você, apertando Enter.** A 0.3.0 trouxe um
**modo automático opcional** (veja o aviso e a seção abaixo). Especificação completa:
[`docs/PLANO-CAMPANHAS-WHATSAPP.md`](../../docs/PLANO-CAMPANHAS-WHATSAPP.md).

Projeto **separado do CRM**: tem `package.json`, dependências e testes próprios. Não usa
banco, servidor nem chave de IA. O build e os testes do CRM (raiz do repositório) ignoram
esta pasta.

> ## ⚠️ Por que o padrão é você apertar Enter
>
> Enviar mensagens automaticamente pelo WhatsApp Web (extensão clicando sozinha, robôs,
> Baileys/Evolution) **viola os Termos de Serviço do WhatsApp** e pode levar ao **bloqueio
> permanente do número** — e com ele vai o histórico com todos os clientes. Por isso, **no modo
> padrão (manual)**, a extensão cola o texto e para: o Enter é seu. A política de proteção
> abaixo **reduz** o risco; ela **não garante** que o número não será restringido.
>
> O **modo automático** (opcional, 0.3.0) existe por **decisão escrita do dono**, para
> **clientes que já conversam com ele, em volume baixo**. Veja a seção "Modo automático".
> Todo o código que aciona o envio fica em um único arquivo
> (`src/content/envioAutomatico.ts`) e o teste
> `tests/envio-so-no-automatico-autorizado.test.ts` reprova o build se aparecer qualquer outro
> caminho de envio, evento de teclado ou clique fora do previsto.

## ⚠️ Modo automático (0.3.0, opcional) — LEIA ANTES DE LIGAR

> **RISCO: o envio automático pelo WhatsApp Web VIOLA os Termos do WhatsApp e pode BLOQUEAR O
> SEU NÚMERO DE FORMA PERMANENTE.** Os limites abaixo reduzem o risco, **não o eliminam**. Se o
> número for bloqueado, o histórico com todos os clientes se perde junto. Use só para clientes
> que já conversam com você, em volume baixo.

**Padrão:** continua o modo manual ("uma tecla"). O automático nasce **desligado**.

**Como ligar** (aba **Dados → Modo automático**): marque a caixa *"Entendo que o envio
automático viola os Termos do WhatsApp e pode bloquear meu número de forma permanente"* **e**
digite a palavra `AUTOMATICO`. A data do aceite fica guardada. Com o modo ligado aparece o
selo vermelho **AUTOMÁTICO** no topo do painel.

**Como desligar:** um clique em **Desligar o modo automático** (aba Dados). Importar um backup nunca
liga nem desliga o automático.

**0.3.2 (decisão do dono, 20/10/2026):** autorizado uma vez, fica autorizado. Depois do primeiro aceite,
religar é **um clique** (sem caixa nem palavra). O freio **não desliga** mais o automático: só **pausa a
campanha** com alerta; ao clicar **Retomar**, continua no automático.

**O que acontece com cada contato**
1. Checagens de política: horário, teto, intervalo, freio e avisos do WhatsApp.
2. Abre a conversa **sem esperar o clique em "Abrir próximo"** — mas só se você não estiver
   digitando em algum campo; senão espera 15 s e tenta de novo.
3. Todas as conferências do modo manual (título igual ao nome, conversa individual, caixa
   vazia, texto válido) antes e depois de colar.
4. Cola o texto e mostra **"Enviando para <nome> em Ns — Cancelar"** (contagem de 8 s).
   **Cancelar** pausa a campanha e limpa a caixa.
5. Logo antes de enviar, reconfere: título, conversa individual (mesmo JID), texto da caixa
   **exatamente igual** ao colado, nenhum aviso do WhatsApp na tela, painel aberto e modo ainda
   ligado. Qualquer diferença: **não envia**.
6. Aciona o botão de enviar do rodapé (`#main footer button[aria-label="Enviar"]`, o ícone
   `[data-icon="send"]` subindo ao `button`, ou `button[aria-label="Send"]`). Não acha: **para
   com erro** (`botao_enviar_ausente`). Nunca usa tecla/Enter.
7. Confirma pelo detector (id novo + texto igual + caixa vazia) em até **20 s**. Não confirmou:
   **pausa** com `envio_nao_confirmado` e **não repete** o contato.

**Limites no automático** (não configuráveis para cima)

| Regra | Valor |
|---|---|
| Teto diário | **30** mensagens (mesmo que a política manual permita mais) |
| Intervalo entre envios | aleatório de **90 a 180 s** |
| Pausa longa | aleatória de **10 a 20 min** a cada **10** envios |
| Horário | seg–sex 08h–18h, sáb 08h–12h (Fortaleza); domingo nunca |
| Freio | **2 problemas seguidos** (só falhas de **depois** de colar/enviar, veja 0.3.1) ou **qualquer aviso do WhatsApp** → **pausa a campanha** e mostra um alerta (desde a 0.3.2 o automático continua ligado; clique em Retomar) |
| Número novo | continua exigindo a confirmação "mais de 30 dias de uso" |

**Como é protegido por dentro**
- Só `enviarSeAutorizado(ctx)` (em `src/content/envioAutomatico.ts`) aciona o envio. Ela exige um
  **token do painel por envio**, amarrado a nome + texto + campanha, de **uso único** e com
  **validade de 30 s**, e a permissão do modo automático, que o painel renova a cada contato e
  que **expira em 45 s** se o painel fechar.
- Painel fechado ou recarregado no meio: o token expira e **nada é enviado**. Ao reabrir, a
  conferência `ja_enviada` (já existe mensagem nossa nova na conversa?) evita duplicar. O
  estado do automático e o item em andamento ficam no IndexedDB.
- O **modo manual nunca chama** o pedido `enviarAutomatico` (garantido por teste).
- O diagnóstico (aba Dados) registra cada etapa do automático (`auto:…`), **sem o texto das
  mensagens**.
- Limite honesto: o token protege contra disparo acidental, repetição e painel fechado. Não é uma
  barreira contra código malicioso dentro da própria extensão.

**Se uma mensagem for colada e depois o contato for trocado** (título mudou na contagem), a
extensão não envia e marca o contato como problema; o texto colado pode ficar como rascunho
naquela conversa — apague-o à mão.

---

## 0.4.0. Aba Ajustes: painel configurável e editável (pedido do dono)

"Quero um painel que eu mesmo possa montar tudo; você deixa preenchido, porém que eu possa editar."
Nova aba **Ajustes** (entre Envio e Dados). Tudo já vem preenchido com os valores de sempre
(= perfil **Cauteloso**), em cartões. Cada campo tem rótulo, unidade, ajuda, **Padrão: …** visível,
o limite permitido ao lado e **Restaurar padrão** (por campo e por grupo) + **Restaurar tudo**.
**Salvar** é explícito, só habilita com tudo válido, e a barra de baixo mostra **Alterações não
salvas**. Os ajustes valem a partir do próximo contato.

**Nada de segurança do envio mudou.** A tela só escolhe ritmo e limites: não liga o modo automático
(isso continua só na aba Dados, com o aceite), não toca no token, nas conferências, em "só no
automático autorizado" nem em "sem Enter simulado". O teste `envio-so-no-automatico-autorizado`
só mudou o número da versão, e há um teste novo garantindo que `Ajustes.tsx`/`ajustes.ts` não
referenciam o estado do automático nem o envio.

| Grupo | O que se edita (padrão) |
|---|---|
| 1. Ritmo | intervalo manual mín/máx (60–120 s) e automático mín/máx (90–180 s); pausa longa ligada/desligada, a cada N envios (10), duração mín/máx (10–20 min); contagem antes do envio automático (8 s) |
| 2. Limites | teto diário manual (30) e automático (30), **máximo permitido 60 nos dois**; rampa de volume opcional (desligada; dia 1–7 / 8–14 / depois), cortando o teto nos primeiros dias a partir do 1º envio registrado |
| 3. Horários | uma linha por dia da semana: ligado, início, fim (seg–sex 8–18h, sáb 8–12h, domingo desligado). Fuso fixo America/Fortaleza; só entre 6h e 22h |
| 4. Freio | problemas seguidos para pausar: manual (3) e automático (2); pausar em aviso do WhatsApp (ligado, recomendado); espera quando você está digitando (15 s) |
| 5. Filtros padrão | termo de busca / "nome contém" (CLIENTE), "nome NÃO contém", excluir recém-contatados (14 dias, piso fixo 14). São os valores iniciais da Varredura e da Prévia |
| 6. Texto | tamanho máximo (500, nunca acima); lista de **modelos salvos** (nome, texto base, até 3 variações, um pode ser o padrão da Prévia, que também tem um seletor); variáveis `{primeiroNome}` e **`{saudacao}`** (Bom dia até 11:59, Boa tarde até 17:59, Boa noite; horário de Fortaleza). **Fixos, não editáveis:** bloqueio de link e de quebra de linha |

**Perfis (um clique, depois ajuste campo a campo; só ritmo e tetos):** *Cauteloso* = valores de
sempre; *Equilibrado* = 60–120 s, pausa longa de 5–10 min a cada 15, teto 30; *Rápido* = 45–90 s,
sem pausa longa, teto 30. O cartão mostra o perfil atual (ou "Personalizado") e um **indicador de
risco** (baixo/médio/alto) por modo, calculado por regra simples e explicada na tela: pontos por
intervalo médio curto, por teto diário alto, por pausa longa desligada/rara, por não pausar em aviso
e por freio frouxo. **É uma comparação entre configurações, não uma previsão: "baixo" não é
"seguro" e nada garante que o número não será bloqueado.**

**Limites absolutos embutidos (`LIMITES` em `src/shared/ajustes.ts`)** — a tela recusa e a leitura do
banco/backup corta: intervalo ≥ 30 s; teto ≤ 60 (manual) e ≤ 60 (automático, novo `TETO_AUTO_MAXIMO`);
contagem do automático ≥ 5 s; horários entre 6h e 22h; recém-contatados ≥ 14 dias; texto ≤ 500;
problemas seguidos 1–10; pausa longa 1–120 min a cada 3–100 envios. min ≤ max sempre.

**Pausar em aviso do WhatsApp (decisão de projeto a confirmar):** o ajuste controla só o aviso visto
*enquanto o painel espera* (evento do vigia). Antes de abrir a conversa e antes de enviar, aviso na
tela continua bloqueando, e isso é fixo.

**Fonte única.** `src/shared/ajustes.ts` guarda esquema (zod), padrões, limites, perfis, validação,
risco e os valores efetivos (`configEfetiva`, `ritmoAuto`, `configManual`). A política
(`podeAbrirProximo`, `dentroDoHorario`, `registrarProblema`, `sortearIntervaloSeg`), a espera do
automático (`sortearEspera`) e o `Executor` leem daí; as constantes viraram só padrões. Sem o
argumento de ajustes, as funções antigas continuam se comportando como na 0.3.x (por isso os testes
antigos passaram sem mudar expectativas). Persistência: IndexedDB, store `config`, registro
`ajustes`. **Migração:** quem veio da 0.3.x e nunca salvou Ajustes recebe os padrões com o teto e o
intervalo que já tinha (o automático herda como antes: teto ≤ 30, 90–180 s no mínimo). **Backup:**
`ajustes` entra na exportação (campo novo opcional, `versao` do backup continua 1; backup antigo
importa normalmente) e, ao importar, é validado por zod e cortado nos limites absolutos; importar
nunca liga o automático. "Meu nome" e o estado do automático seguem fora do backup. Na aba Dados, a
confirmação "número com mais de 30 dias" continua lá (registro `politica`); teto e intervalo saíram
de lá e vivem em Ajustes.

**`{saudacao}` e a conferência.** O executor monta o texto com o relógio dele e guarda o texto
exatamente colado por contato; limpar a caixa, conferir e o token usam esse mesmo texto, então a
saudação não muda entre colar e enviar (a virada do meio-dia não quebra a conferência).

Testes: `tests/ajustes.test.ts` (padrões = comportamento atual, limites absolutos, validação,
restaurar, perfis, risco, horários/freio/teto/rampa/pausa longa na política, saudação, migração,
persistência, import/export, executor lendo os ajustes). Não validado no Chrome de verdade: a
interface (Ajustes.tsx, seletor de modelo na Prévia) foi só typechecada e compilada.

---

## 0.3.3. Fila editável durante a execução (pedido do dono)

Nenhuma regra de proteção do envio foi mexida (o teste `envio-so-no-automatico-autorizado` só
mudou o número da versão). Na aba **Envio**, abaixo do status, aparece **Próximos (N)**: os contatos
pendentes na ordem de execução, no mesmo formato da Prévia (nome, origem/última conversa, campo
**Primeiro nome**, balão com o texto que será enviado, **Remover**). Vale no manual e no automático,
com a campanha rodando ou pausada (Retomar segue a nova ordem).

- **Editar:** o texto final de cada contato é uma caixa de texto (já com `{primeiroNome}`
  resolvido). Mudar o primeiro nome atualiza o texto enquanto ele ainda é o do modelo. O botão
  **Salvar** valida com as mesmas regras do texto da campanha (sem link, sem quebra de linha,
  tamanho máximo, marcador `{primeiroNome}` só), mais "primeiro nome não vazio", e mostra a
  mensagem de erro. Salvar grava na hora no IndexedDB (campo `textoPersonalizado` do item; texto
  igual ao do modelo não vira override). O executor usa o texto do contato se houver override;
  senão, o modelo sorteado com o primeiro nome.
- **Remover:** o item vira `removido` ("removido por você"). Não é problema, não entra no freio
  (problemas seguidos), não vira envio e não conta no teto. Em **Concluídos (N)** (recolhido) há
  o motivo de cada item e **Desfazer remover** enquanto ele não foi executado.
- **Reordenar:** **↑ / ↓** e **Enviar este a seguir** (vai para o topo). Só mexe nos pendentes
  editáveis; concluídos e o item em andamento ficam onde estão, então nada passa na frente dele.
- **Item em andamento travado:** o contato aberto/colado/em contagem/aguardando envio/
  confirmando (e o que ficou colado com a campanha pausada, inclusive o registro no IndexedDB de
  um painel reaberto) aparece no topo como **Em andamento** e não pode ser editado, removido
  nem movido; só os botões de sempre (Pular, Cancelar, Já enviei). Isso garante que o texto
  conferido, o token do automático e o detector de envio usam sempre o mesmo texto.
- **Executor:** antes de abrir o próximo contato ele relê a fila (síncrono, logo antes de travar o
  item). Edição, remoção ou reordenação feitas durante as esperas valem; no automático o token
  continua sendo emitido com o texto do momento do envio (teste: editar a Bia enquanto a Ana está em
  contagem, e a Bia sai com o texto novo).
- **Origem:** a campanha guarda a linha da Prévia (`origem`) de cada contato; campanhas antigas
  mostram "última conversa dd/mm/aaaa" pelo cadastro da varredura.
- Backup/CSV: `removido` é um status válido; `textoPersonalizado` e `origem` fazem parte do backup.

Não validado no WhatsApp de verdade: a interface do painel (Linha/FilaProximos) foi só
typechecada e compilada; os testes cobrem a lógica (executor e IndexedDB).

---

## 0.3. O que mudou na 0.3.1 (campo: conversa só com mensagens minhas)

Nenhuma regra de proteção do envio foi afrouxada (o teste `envio-so-no-automatico-autorizado`
só mudou o número da versão). Motivo: dois contatos falharam com `nao_confirmado` **antes de
colar** (nada foi enviado). Nessas conversas as únicas mensagens visíveis eram minhas (balão
verde, ✓✓ no rodapé), mais mensagens de sistema ("Seu código de segurança … mudou", "Clique
neste aviso para carregar mensagens mais antigas"). Sem `.message-in/.message-out`, o único
autor era o meu nome (≠ título) e a regra "autor único diferente do título = desconhecido" barrou.

- **Mensagem minha pelo ícone de status.** Uma linha é minha se tem, dentro dela, um
  `[data-icon]` em `msg-check, msg-dblcheck, msg-dblcheck-ack, msg-time, msg-check-light,
  msg-dblcheck-light` ou um elemento de `msg-meta` com `aria-label` contendo Lida/Entregue/
  Enviada/Pendente/Read/Delivered/Sent/Pending. `.message-out` e `true_…` continuam valendo.
  Recebida = linha de conversa (com texto/autor) sem esses sinais. Linha de sistema (tem texto,
  mas não tem `msg-container`/`copyable-text`) é ignorada: não é mensagem.
- **Meu nome.** O autor (`data-pre-plain-text`) das minhas linhas é aprendido sozinho (só se
  for um único autor e não for o título) e guardado no IndexedDB (`config` → `meuNomeWhatsApp`);
  o painel o reenvia a cada abertura. Dá para corrigir na aba **Dados → Meu nome no WhatsApp**
  (o digitado vale mais que o aprendido). `autoresDoOutroLado` = autores distintos sem o meu nome.
- **Classificação.** GRUPO: ícone de grupo no cabeçalho, OU elemento de autor dentro das linhas,
  OU mais de 1 autor do outro lado, OU 1 autor do outro lado diferente do título. INDIVIDUAL:
  nada disso, o outro lado vazio (só minhas) ou só o título, e ao menos 1 mensagem (minha ou
  recebida). Nenhuma mensagem → desconhecido. Consequência: 1 autor diferente do título que
  **não** é o meu nome agora dá `grupo` (antes `nao_confirmado`); nos dois casos nada é colado.
  Sem nenhum nome meu conhecido vale ainda a regra da 0.3.0 (2 autores, um igual ao título → o
  outro sou eu).
- **Freio do automático.** `nao_confirmado`, `ambiguo`, `grupo`, `caixa_ocupada` e
  `usuario_digitando` (conferências **antes de colar**) **não** contam para "2 problemas
  seguidos": o contato vira **pulado (revisar)**, com o motivo, e no automático há uma pausa de
  10 s antes do próximo. O freio conta só falhas **depois** de colar/enviar (`botao_enviar_ausente`,
  `envio_nao_confirmado`, `colar_falhou`, `texto_alterado`, `cabecalho`, avisos do WhatsApp).
  `nao_encontrado` continua contando como problema. Campanha sem envio e com pulados por erro
  termina como "concluída com problemas" (amarela), não verde.
- **Detector de envio.** Além de id novo + texto igual + caixa vazia, o ícone de status vale como
  prova de que a linha é minha (mesmo se o autor lido parecer o contato).
- **Diagnóstico.** `classificacao` ganhou: linhas com ícone de status, linhas de sistema, meu
  nome aprendido (3 letras), autores do outro lado e os `data-icon` distintos das linhas.
- **Risco residual.** Os ícones e rótulos de status são os que o dono descreveu; não foram vistos
  neste ambiente. Se o WhatsApp trocar o `data-icon`, a conversa só com minhas mensagens volta a
  falhar (e cai em pulado/revisar, sem colar). Rode **Testar página do WhatsApp** e confira
  "data-icon nas linhas".

## 0.2. O que mudou na 0.2.2 (WhatsApp Web de 20/10/2026, dados reais do console)

Nenhuma regra de proteção foi afrouxada na 0.2.2 (só ganhou o rótulo `End icon button` na
lista dos seletores do X de limpar a busca). O modo automático só veio na 0.3.0 (acima).

- **Caixa de busca.** Depois que a extensão escreve o nome, o `<input>` fica com
  `role="textbox" data-tab="3"` e `aria-label=""` (vazio), então os seletores por "Pesquisar"
  falhavam na 2ª operação (erro `seletor`). Novas alternativas, dentro de `#side`:
  `input[role="textbox"][data-tab="3"]`, `input[role="textbox"]`, `input[type="text"]`.
- **Limpar a busca.** O X do WhatsApp agora é `button[aria-label="End icon button"]`. Só é
  clicado se estiver em `#side`, fora de `#pane-side` e de `#main`, fora de `footer`, **e** a
  caixa de busca tiver texto. Continua sendo o único clique além da linha da lista. Sem ele,
  o fallback limpa o `<input>` pelo valor (setter nativo + evento `input`; nada de `execCommand`).
- **Envio sem `.message-in`/`.message-out`.** As mensagens são `#main [role="row"]`
  virtualizadas, cada uma com um filho `data-testid="conv-msg-<ID>"`; não há classes de
  direção nem ✓/✓✓. Uma mensagem conta como **sua e enviada** quando: (1) aparece um id
  **novo** (fora da "foto" tirada antes de colar); (2) o texto dela (`selectable-text`) bate com
  o texto colado, comparado sem diferença de espaço, caracteres invisíveis e variação de emoji;
  (3) a caixa de mensagem ficou **vazia**; e (4) ela não é do contato (não é `.message-in`, e o
  autor do `data-pre-plain-text` não é o título da conversa). `.message-out` e `true_…`
  continuam valendo como sinais alternativos (formato antigo). O mesmo critério vale para o
  observador, para a retomada (`ja_enviada`) e para os envios guardados
  (`consultarPendencias`).
- **Classificação individual x grupo sem in/out.** Como não dá para separar "eu" de "contato",
  só vale o conjunto de autores dos `data-pre-plain-text` das linhas renderizadas:
  **grupo** se há ícone de grupo/comunidade no cabeçalho, OU elemento de autor dentro de uma
  linha de mensagem, OU mais de 2 autores distintos, OU 2 autores distintos e nenhum igual ao
  título; **individual** se nada disso e (nenhum autor legível, OU ≤ 2 autores com ao menos um
  igual ao título); qualquer outro caso (por exemplo, 1 autor diferente do título) →
  `nao_confirmado`, sem colar. O elemento de autor só é procurado dentro das linhas de
  mensagem (o `[data-testid="author"]` que o diagnóstico 0.2.1 achou provavelmente não era de
  mensagem; o diagnóstico agora conta só os de dentro das linhas).
- **Risco residual (leia).** Como a conversa é virtualizada, um **grupo sem ícone de grupo
  no cabeçalho cujas linhas renderizadas não mostram nenhum autor** (por exemplo, só linhas
  virtualizadas) pode parecer individual, e a extensão colaria o texto no grupo. Um grupo com
  um único autor visível diferente do título dá `nao_confirmado`, não individual. A defesa que
  sobra é a varredura, que já exclui grupos pela lista (ícone e prévia "Fulano: …"), e o fato
  de que **você** é quem aperta Enter: confira o cabeçalho antes de enviar.
- **Diagnóstico.** Mostra, sem texto de mensagem: da caixa de busca, `tag`, `role`,
  `aria-label` (vazio ou não), `data-tab` e se tem texto (não o texto); das mensagens,
  quantas têm `conv-msg`, quantas estão renderizadas por completo, os autores distintos (só as
  3 primeiras letras) e quantos elementos de autor existem dentro das linhas.

## 0.1. O que mudou na 0.2.1

- **Motivo do erro à vista.** Quando um contato vira problema, o painel mostra um alerta com o
  nome, o código do erro (`nao_confirmado`, `nao_encontrado`…) e a mensagem, sem abrir nada.
- **"Concluída com problemas".** Campanha que termina sem nenhum envio e com problemas não
  fica mais verde: o status é de aviso e traz o resumo dos motivos agrupados.
- **Diagnóstico.** Registro dos últimos 200 eventos (horário, fase, pedido, resposta, versão,
  URL/idioma do WhatsApp e quais seletores bateram no erro). **Copiar diagnóstico** e **Baixar
  diagnóstico (.txt)** na aba Dados e no alerta. Não inclui o texto das mensagens nem nomes de
  outros contatos; telefones são mascarados.
- **Testar página do WhatsApp** (aba Dados): pedido `diagnosticar`, somente leitura, que
  mostra em tabela qual alternativa de cada seletor casou e as contagens da página.
- **WhatsApp Web atual.** O `data-id` das mensagens agora é só o id (sem `true_`/`false_` nem
  JID). Mensagem sua = `.message-out` (o `true_` antigo continua valendo). Conversa individual
  x grupo é decidida por sinais do DOM, de forma conservadora: ícone de grupo no cabeçalho,
  nome de autor dentro de mensagem recebida ou autores (`data-pre-plain-text`) diferentes entre
  si ou do título = grupo; individual só se nenhum sinal de grupo, todo autor recebido é o
  título e há ao menos uma mensagem. Na dúvida: `nao_confirmado` (não cola).
- **Extensão recarregada.** Um content script órfão (contexto invalidado) para vigia,
  observers e timers em silêncio, sem erro no console da página.

## 0. O que mudou na 0.2.0

Versão de correção (manifest e `package.json` em 0.2.0). Nenhuma regra de proteção foi
afrouxada; o teste `tests/envio-so-no-automatico-autorizado.test.ts` continua valendo e ganhou verificações
mais estritas (só dois cliques permitidos: a linha da lista e o X de limpar a busca).

**Segurança de uso**
- **Nada abre sozinho depois do intervalo.** Quando o intervalo acaba, o painel mostra
  **"Próximo pronto — clique em Abrir próximo"** (botão; atalho **Alt+Shift+P** com o painel
  em foco). Antes a conversa trocava sozinha, mesmo com você digitando. A extensão também
  **nunca chama `focus()`** se o foco do WhatsApp está num campo com texto seu: ela para e
  avisa ("Você está digitando…"), sem marcar o contato como problema.
- **Painel fechado ou recarregado no meio de um contato não gera reenvio.** O item colado
  (campanha, nome, texto e a "foto" dos `data-id` das mensagens antes de colar) é gravado no
  IndexedDB. Ao reabrir, o painel mostra o item em andamento; ao retomar, o content script
  confere se já existe mensagem sua nova naquela conversa **antes** de colar e, se existir,
  conta como enviada. Envios percebidos com o painel fechado ficam guardados no content script
  e são entregues quando o painel volta (pedido `consultarPendencias`). Nunca cola duas vezes
  no mesmo contato.
- **Botão "Já enviei"**: registra o envio manualmente (status enviado, conta no teto diário e
  no intervalo). Use quando o painel não percebeu o Enter ou foi fechado.
- **Avisos do WhatsApp pausam a campanha**: telefone desconectado
  (`alert-phone-not-connected`, `alert-computer`), banner `div[role="alert"]`, modal de
  restrição/"não foi possível enviar" e mensagem sua presa no relógio por mais de 60 s. O painel
  mostra o aviso. O sumiço da lista de conversas (`#pane-side`) continua pausando.
- **Intervalo mínimo** conta a partir do último envio de **qualquer campanha** deste número.

**Leitura mais confiável**
- **Emoji**: o texto da caixa/mensagem é lido percorrendo os nós e usando `alt` /
  `data-plain-text` das `<img>`. Rascunho só com emoji **não** é caixa vazia.
- **Reconferência**: título == nome, conversa individual (mesmo JID) e caixa vazia são
  conferidos de novo imediatamente **antes** de colar e logo **depois** (se algo mudou, o texto
  é retirado).
- **Classificação estável**: o JID é lido duas vezes seguidas (iguais) depois das mensagens
  carregarem, e gravado no registro do envio (`jid`).
- **Lista de busca estável** (duas leituras iguais) antes de decidir entre homônimos; **grupo**
  também pelo prefixo "Fulano:" na prévia da última mensagem ("Você:" não conta).
- **Clique de abrir** vai no título da linha (o evento sobe até a linha).
- **Limpar busca** primeiro pelo botão X do próprio WhatsApp (`aria-label` "Limpar…"), só
  depois pelo campo.
- **Envio detectado** também por `.message-out` (sinal secundário ao `data-id` `true_`).
- Seletores `data-testid` estáveis como alternativas extras (nunca classes com hash).

**Controle**
- **Quebra de linha não é suportada**: `validarModelo` rejeita quebras de linha com mensagem
  clara, e o texto (link, tamanho, quebra de linha) é revalidado imediatamente antes de colar —
  inclusive de backup importado (vira "problema", não é colado).
- **Pausar durante "abrindo"** cancela a abertura no content script (token) e limpa a caixa se
  o texto já tinha sido colado.
- **A observação de 30 min que expira** agora avisa o painel ("não percebo mais o envio — use
  *Já enviei* ou *Pular*").
- **Reinjeção**: o content script tem número de geração; instâncias antigas ignoram pedidos e a
  nova encerra o que a antiga deixou rodando. O painel só reinjeta no erro "Receiving end does
  not exist" / "Could not establish connection".

**Ideias da outra extensão**: aproveitadas (avisos, `data-testid`, botão X, `.message-out`).
Descartadas de propósito: apagar rascunho do usuário, `textContent =` no editor e seletores de
classe com hash.

---

## 1. Gerar o build

Pré-requisito: Node.js 20 ou mais novo.

```bash
cd extensoes/vita-zap
npm install
npm test          # testes da extensão
npm run build     # typecheck + build → pasta dist/
```

O resultado fica em `extensoes/vita-zap/dist/` (manifest.json, sidepanel.html, background.js,
content.js, assets/).

## 2. Carregar no Chrome

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `extensoes/vita-zap/dist`.
4. Abra (ou **recarregue com F5**) a aba `https://web.whatsapp.com`. A aba precisa ser
   recarregada sempre que a extensão for instalada ou atualizada.
5. Clique no ícone do Vita Zap na barra do Chrome: o painel lateral abre.

Para atualizar depois de mudar o código: `npm run build`, botão ↻ da extensão em
`chrome://extensions`, e F5 na aba do WhatsApp Web.

Requer Chrome 116 ou mais novo (API de painel lateral).

## 3. Como usar

**Antes da primeira campanha:** aba **Dados** → marque "Este número tem mais de 30 dias de uso"
e salve. Sem isso nenhuma campanha roda. Confira também se o WhatsApp Web está em
**português** (as datas da lista são lidas como dia/mês).

1. **Varredura** — digite o termo (ex.: `CLIENTE`) e clique em *Varrer conversas*. A extensão
   escreve o termo na busca do WhatsApp, rola a lista com pausas e lê nome + data da última
   mensagem. Só leitura: não abre conversa nem escreve mensagem.
2. **Prévia** — ajuste os filtros (nome contém / não contém, última conversa antes de / depois
   de, dias sem repetir), escreva o texto base com `{primeiroNome}` e até 3 variações. Clique
   em *Gerar prévia*: cada contato aparece com o motivo de inclusão e o texto sorteado. Remova
   quem quiser, corrija o primeiro nome se preciso e clique em **Aprovar**.
   - **Revisar**: contatos com data incerta ("segunda-feira" ambígua, formato desconhecido) ou
     nome repetido em duas conversas. **Nunca entram sozinhos.** Data incerta pode ser incluída
     à mão; nome repetido não (não dá para saber qual conversa abrir).
3. **Envio** — clique em *Iniciar*. Para cada contato a extensão:
   1. procura o nome na busca, abre a conversa e confere o nome no cabeçalho;
   2. confere que é conversa individual (não grupo/transmissão);
   3. cola o texto na caixa de mensagem (se já houver rascunho seu, não mexe e marca problema);
   4. **para e espera**. Você clica na caixa do WhatsApp, confere e aperta **Enter**;
   5. percebe a mensagem nova no chat, registra o envio e espera 60–120 s;
   6. mostra **"Próximo pronto"**. Quando você terminar o que estiver fazendo, clique em
      **Abrir próximo** (ou Alt+Shift+P). Nada abre sozinho.

   Botões durante a espera: **Já enviei**, **Pular**, **Não é cliente**, **Problema**,
   **Não enviar mais**, **Pausar**. Pular/Pausar tiram da caixa o texto colado (se você não o
   editou). Enter dentro do painel não aciona botão — o Enter é para o WhatsApp.
   O texto não pode ter quebra de linha (escreva em uma linha só).

**Feche o painel = campanha pausada.** A lógica roda no painel; ao reabrir, o painel mostra o
item que ficou em andamento. Se a mensagem já saiu, clique em *Já enviei*; senão use *Retomar*
(a extensão confere o WhatsApp antes de colar e nunca reenvia ao mesmo contato).

### Dados e backup

Tudo fica **só neste navegador** (IndexedDB da extensão): contatos varridos, campanhas,
envios e a lista "Não enviar mais". A extensão **não guarda telefone**. Na aba **Dados**:
exportar backup (JSON, agora com os Ajustes), importar (mesclar ou substituir) e exportar campanhas em CSV
(separador `;`, abre no Excel em português).

## 4. Política de proteção (embutida)

> Desde a 0.4.0 os valores abaixo são os **padrões** da aba Ajustes (editáveis dentro dos limites absolutos da seção 0.4.0).

| Regra | Valor | Onde |
|---|---|---|
| Público | só contato **salvo com nome** e **com conversa anterior**; grupos, transmissões, só-número e "Não enviar mais" ficam fora | `shared/filtros.ts` |
| Horário | seg–sex 08h–18h, sáb 08h–12h, **America/Fortaleza** | `shared/constantes.ts` |
| Teto diário | **30** por dia (todas as campanhas deste navegador/número). Configurável de 1 até `TETO_DIARIO_MAXIMO` (60) — nunca acima | `shared/politica.ts` |
| Intervalo | 60–120 s sorteado após cada envio. Pode ser aumentado, nunca reduzido | `shared/politica.ts` |
| Repetição | uma mensagem por contato por campanha; quem recebeu campanha há < 14 dias fica fora (piso fixo) | `shared/campanha.ts`, `shared/banco.ts` |
| Texto | sem link na 1ª mensagem (bloqueado), até 500 caracteres, só o marcador `{primeiroNome}`; sem mídia (a extensão só cola texto). **Sem** linha "responda SAIR" (decisão do dono) | `shared/texto.ts` |
| Freio | 3 problemas seguidos pausam a campanha; erro de seletor pausa na hora (no automático: 2 problemas pausam a campanha; o automático continua ligado desde a 0.3.2). Conferências antes de colar (0.3.1) viram "pulado (revisar)" e não contam | `shared/politica.ts`, `sidepanel/executor.ts` |
| Número novo | sem a confirmação "mais de 30 dias de uso", nada roda | `shared/politica.ts` |

Opt-out: botão **Não enviar mais** (e **Não é cliente**). A detecção automática de pedido
para sair nas respostas fica para a fase 2 (com IA).

## 5. Seletores do WhatsApp Web

Todos em [`src/content/selectors.ts`](src/content/selectors.ts), cada um com alternativas.
Preferência: id fixo (`#pane-side`, `#main`, `#side`) → `role`/`aria-label` → `data-*`.
Nunca classes geradas. Se nenhum bater, a operação **para com erro** (falha fechada).

Outros sinais usados (todos isolados e testados com HTML sintético):

- **Data da linha:** o primeiro texto "folha" da linha com cara de hora/data, fora do nome.
- **Posição da linha:** `transform: translateY(Npx)` da lista virtualizada — identifica o
  mesmo chat entre rolagens e detecta dois chats com o mesmo nome.
- **Grupo:** ícone padrão de grupo na linha e, ao abrir, o `data-id` das mensagens
  (`@g.us` = grupo, `@broadcast` = transmissão, `@newsletter` = canal; `@c.us`/`@lid` =
  individual). Sem sinal → não cola (falha fechada).
- **Envio detectado:** a última mensagem do chat é sua (`data-id` começa com `true_`, ou está
  dentro de `.message-out`), não existia antes de colar, e a caixa ficou vazia.
- **Avisos do WhatsApp:** `[data-testid="alert-phone-not-connected"]`, `div[role="alert"]`,
  `[data-icon="alert-computer"]`, `[data-icon="msg-time"]` (relógio) em mensagem sua e modal
  `[role="dialog"]` com texto de falha/restrição.
- **Limpar busca:** botão X (`button[aria-label*="Limpar"]`, `[data-icon="x-alt"]`) na coluna da
  esquerda, fora da lista. É o único clique permitido além da linha da lista.

## 6. ⚠️ O que NÃO foi validado

Esta fase foi escrita **sem acesso ao WhatsApp Web real**. Os testes automáticos cobrem a
lógica (datas, filtros, política, texto, armazenamento, executor com WhatsApp falso, leitura
de HTML **sintético**), mas **não** provam que os seletores batem com o HTML de hoje. Em
especial, não verificado:

- todos os seletores de `selectors.ts` (busca, linhas, nome, cabeçalho, caixa de mensagem);
- se a busca mostra seções "Contatos"/"Mensagens" com esse texto e se o corte funciona;
- se o clique simulado na linha abre a conversa;
- se `execCommand('insertText')` coloca o texto no editor do WhatsApp (e quebras de linha);
- o formato do `data-id` das mensagens e a detecção do envio;
- se `<html lang>` do WhatsApp Web indica o idioma.

Novos na 0.2 (também **não** validados no WhatsApp real — os testes usam um WhatsApp falso
escrito à mão):

- como o editor representa emoji (`<img alt>` / `data-plain-text`) e se `execCommand` os cola;
- todos os `data-testid` novos (busca, título da linha, caixa, histórico, lista);
- se existe e qual é o `aria-label` real do botão X de limpar a busca;
- se `.message-out` existe nas mensagens enviadas e se `[data-icon="msg-time"]` é o relógio;
- os avisos (`alert-phone-not-connected`, `alert-computer`, `div[role="alert"]`, modal de
  falha) — o texto e o momento em que aparecem; `div[role="alert"]` pode aparecer por motivos
  inofensivos e, nesse caso, **pausará a campanha à toa** (é o lado seguro);
- se a prévia de grupo na lista tem mesmo o formato "Fulano: texto" (e se "Você:" é o rótulo
  das suas mensagens); prévia individual com "Algo: …" é tratada como grupo (fica de fora);
- se o clique despachado no título da linha abre a conversa;
- o `data-id` mudar de formato (JID `@lid`) e a leitura estável de JID em conversas lentas;
- o comportamento real do foco quando o painel lateral está em primeiro plano e o WhatsApp tem
  rascunho (`document.activeElement` da aba).

Novos na 0.3.0 (modo automático — **não** validados no WhatsApp real; os testes usam o
WhatsApp falso no formato "real"):

- o seletor do botão de enviar do rodapé (`button[aria-label="Enviar"]`, `[data-icon="send"]`,
  `button[aria-label="Send"]`) e se o `.click()` nele realmente envia no editor atual;
- se o clique mantém o foco/rascunho como esperado e o detector confirma a mensagem em 20 s;
- se o WhatsApp mostra avisos de bloqueio/limite que o vigia reconhece — e o que acontece com
  a conta depois de dias de uso automático (o risco de bloqueio **não foi medido**);
- o comportamento com o painel lateral fechado no meio da contagem (testado só em simulação).

**Rode o checklist abaixo antes da primeira campanha real** e a cada atualização do
WhatsApp Web. Se algo falhar, ajuste só `selectors.ts` (ou o sinal correspondente) e rode
`npm test` de novo.

## 7. Checklist de teste manual

**Modo automático (0.3.0)** — só depois do checklist manual abaixo, com 2 contatos de confiança:
- [ ] Dados → Modo automático: o botão Ligar só habilita com a caixa marcada + `AUTOMATICO`; o selo AUTOMÁTICO aparece.
- [ ] Iniciar: a conversa abre sozinha, o texto é colado e a contagem "Enviando para … em Ns" aparece.
- [ ] **Cancelar** na contagem: nada é enviado e a caixa fica vazia.
- [ ] Sem cancelar: a mensagem sai pelo botão de enviar; o painel registra e espera 90–180 s.
- [ ] Digite algo em qualquer campo do WhatsApp antes do próximo: a extensão espera e tenta em 15 s.
- [ ] Mude de conversa durante a contagem: nada é enviado e o contato vira "problema".
- [ ] Desligue pelo botão: volta ao manual e o selo some.

Use uma conta real, mas teste com **2 ou 3 contatos de confiança** (ex.: você mesmo em outro
número salvo como "CLIENTE TESTE").

**Preparação**
- [ ] `npm test` e `npm run build` sem erro.
- [ ] Extensão carregada; aba do WhatsApp Web recarregada (F5); painel abre pelo ícone.
- [ ] Aba Dados: confirmar número > 30 dias; teto 30; salvar.

**Varredura**
- [ ] Termo `CLIENTE`: a busca do WhatsApp recebe o termo; a lista rola sozinha, devagar.
- [ ] O total de nomes bate com o que você vê na busca (role manualmente para conferir).
- [ ] Datas: confira 5 contatos — um de hoje (hora), um de ontem, um de dia da semana, um de
      data completa. A prévia mostra a data certa?
- [ ] Um contato **não salvo** (só número) aparece como "fora — não salvo".
- [ ] Um **grupo** com o termo no nome aparece como "fora — grupo".
- [ ] Contatos da seção "Contatos" (sem conversa) ficam fora.
- [ ] Varredura com termo vazio percorre a lista inteira e para no fim.
- [ ] Mude o WhatsApp para inglês: a varredura deve recusar (idioma). Volte para português.

**Prévia**
- [ ] Filtro "antes de" e "depois de" corta nas datas certas.
- [ ] Texto com `www.` ou `https://` é bloqueado.
- [ ] `{primeiroNome}` sai certo ("CLIENTE - JOÃO" → "João"); edite um à mão.
- [ ] Remover um contato tira ele da campanha aprovada.

**Envio (uma tecla)**
- [ ] *Iniciar*: a conversa certa abre (nome no cabeçalho) e o texto aparece na caixa.
- [ ] A extensão **não envia sozinha** — espere 1 minuto sem apertar nada.
- [ ] Aperte Enter no WhatsApp: o painel registra "enviado" e mostra a contagem do intervalo.
- [ ] Após o intervalo aparece "Próximo pronto" e nada abre sozinho; *Abrir próximo* abre o seguinte.
- [ ] *Pular* tira o texto da caixa e abre o próximo.
- [ ] Deixe um rascunho seu num contato da lista: a extensão não sobrescreve (marca problema).
- [ ] *Não enviar mais*: o contato some das próximas prévias (aba Dados lista ele).
- [ ] *Pausar* e *Retomar* funcionam; fechar o painel pausa.
- [ ] **Emoji**: use um texto com emoji (ex.: "Oi {primeiroNome} 😀"). Ele aparece na caixa
      como emoji, o envio é detectado e o painel registra "texto confere". Depois deixe um
      rascunho **só com um emoji** na caixa de um contato: a extensão não pode sobrescrever
      (marca problema).
- [ ] **Abrir próximo**: depois do intervalo o painel mostra "Próximo pronto" e **a conversa
      não troca sozinha**. Digite algo em outra conversa durante o intervalo, depois clique
      *Abrir próximo*: se o foco estiver num campo com texto seu, a extensão avisa e não mexe.
      O atalho Alt+Shift+P (painel em foco) faz o mesmo.
- [ ] **Painel fechado e retomado**: cole o texto de um contato, **feche o painel**, reabra:
      aparece "Ficou em andamento: …". (a) Não envie e clique *Retomar*: a extensão confere o
      WhatsApp e cola de novo só uma vez. (b) Repita, mas dessa vez aperte Enter com o painel
      fechado, reabra e clique *Retomar*: o contato conta como enviado e **nada é colado de
      novo**.
- [ ] **Já enviei**: com o texto colado, envie e clique *Já enviei* antes da detecção (ou
      depois de uma observação expirada): o contato vira enviado, entra na contagem do teto e
      o intervalo é sorteado.
- [ ] **Aviso de desconexão**: com uma campanha rodando, ponha o celular em modo avião (ou
      desconecte o WhatsApp Web). A campanha deve **pausar** e mostrar o aviso. Reconecte e
      confira que *Retomar* só segue depois que o aviso sumiu.
- [ ] Pausar durante "Abrindo a conversa…": a caixa fica vazia e a campanha pausa.
- [ ] Texto com quebra de linha: a Prévia recusa com a mensagem clara.
- [ ] Dois chats com o mesmo nome / um grupo com o nome do contato: a extensão não abre.
- [ ] Contato inexistente/renomeado 3 vezes seguidas → campanha pausa (freio).
- [ ] Fora do horário (ou mude o relógio): *Iniciar* não abre ninguém.

**Dados**
- [ ] Exportar backup JSON, importar em outro perfil do Chrome (mesclar) — campanhas e
      "não enviar" voltam.
- [ ] Exportar CSV e abrir no Excel: acentos certos, uma linha por contato.

## 8. Estrutura

```
extensoes/vita-zap/
├── public/manifest.json        Manifest V3 (permissões: sidePanel + web.whatsapp.com)
├── sidepanel.html
├── src/
│   ├── background/service-worker.ts   ícone → abre o painel
│   ├── content/                       roda dentro do WhatsApp Web
│   │   ├── selectors.ts               TODOS os seletores
│   │   ├── extrair.ts                 leitura de uma linha da lista (puro)
│   │   ├── varredura.ts               rolagem com pausas, só leitura
│   │   ├── execucao.ts                abrir + colar + observar envio
│   │   ├── contexto.ts                contexto invalidado: vigia + chamadas seguras
│   │   ├── diagnostico.ts             pedido `diagnosticar` (somente leitura)
│   │   ├── abrir-conversa.ts          cliques simulados (linha da lista; X de limpar busca)
│   │   ├── envioAutomatico.ts         ÚNICO código que aciona o envio (modo automático, com token)
│   │   ├── modoAutomatico.ts          permissão do automático (expira em 45 s sem o painel)
│   │   ├── chat.ts                    título, mensagens, tipo/JID da conversa aberta
│   │   ├── vigia.ts                   avisos do WhatsApp (desconexão, restrição, relógio)
│   │   ├── geracao.ts                 geração do content script (reinjeção)
│   │   ├── dom.ts, lista.ts           utilidades (texto com emoji, foco seguro)
│   │   └── index.ts                   recebe pedidos do painel
│   ├── shared/                        lógica pura + IndexedDB
│   │   ├── constantes.ts              política (pisos/tetos)
│   │   ├── datas.ts                   parser de datas (Fortaleza)
│   │   ├── nomes.ts, contatos.ts      normalização, dedup
│   │   ├── filtros.ts, politica.ts, texto.ts, campanha.ts
│   │   ├── banco.ts, exportar.ts      IndexedDB, backup JSON, CSV
│   │   ├── automatico.ts              estado, ritmo e token do modo automático
│   │   ├── mensagens.ts               protocolo painel ↔ content (só `enviarAutomatico` aciona envio)
│   │   ├── avisos.ts                  padrões de aviso/grupo (texto puro)
│   │   └── ia.ts                      interface da fase 2 (desligada)
│   └── sidepanel/                     React: Varredura, Prévia, Envio, Dados + executor.ts
└── tests/                             vitest (npm test)
```

## 10. Se der problema

1. **Abra o alerta.** Na aba **3. Envio**, o bloco vermelho "Deu problema…" mostra o contato, o
   código do erro e a mensagem. Muitas vezes isso já explica (ex.: `nao_encontrado` = o nome não
   apareceu na busca; `grupo` = a conversa é um grupo).
2. **Copiar diagnóstico.** No alerta (ou na aba **Dados**), clique em *Copiar diagnóstico* e
   cole na conversa com quem cuida da extensão; se a cópia falhar, use *Baixar diagnóstico
   (.txt)*. Não leva o texto das mensagens e mascara telefones.
3. **Testar página.** Na aba **Dados**, com o WhatsApp Web aberto (e, de preferência, uma
   conversa aberta), clique em *Testar página do WhatsApp*: a tabela mostra quais seletores
   ainda batem. Linhas em vermelho ("nenhuma") indicam que o WhatsApp mudou o HTML. Só leitura:
   não clica nem escreve nada.
4. **Desative outras extensões de WhatsApp.** Em `chrome://extensions`, desative extensões que
   mexem no WhatsApp Web (CRMs, disparadores, tradutores…): elas podem interferir na página e
   até gerar erros no console (como `Cannot read properties of undefined (reading
   'sendMessage')`, que vem do content script **delas**, não do Vita Zap). Depois recarregue a
   aba do WhatsApp com F5.


## 9. Fase 2 (IA) — preparado, não implementado

A interface está em `src/shared/ia.ts` (`ProvedorIA`, hoje `IA_DESLIGADA`). Decisão do dono:
API **Gemini**, chamada por um **proxy no servidor**; a chave **nunca** fica na extensão. A
extensão enviará só um token pessoal revogável, o primeiro nome e o texto necessário — nunca
telefone.
