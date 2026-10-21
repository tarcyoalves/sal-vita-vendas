# Vita Zap — extensão do Chrome para o WhatsApp Web (v0.4: CRM + campanhas "uma tecla", sem IA)

Copiloto comercial que vive num **painel lateral** ao lado do WhatsApp Web. Ele acha os
contatos nas suas conversas, monta a lista, escreve a mensagem e abre cada conversa com o
texto pronto. **Quem envia é você, apertando Enter.** Especificação completa:
[`docs/PLANO-CAMPANHAS-WHATSAPP.md`](../../docs/PLANO-CAMPANHAS-WHATSAPP.md).

Desde a v0.4 ela também é um **CRM dentro do WhatsApp Web**: abas de triagem (quem espera
resposta sua e quem não responde você), lembretes de follow-up, notas, etiquetas, fase do funil e
respostas rápidas. Tudo local (`chrome.storage.local`), lido só do HTML do WhatsApp Web, sem
servidor e sem login. Especificação do CRM: [`docs/VITA-ZAP-SPEC-CRM.md`](../../docs/VITA-ZAP-SPEC-CRM.md).

Projeto **separado do CRM**: tem `package.json`, dependências e testes próprios. Não usa
banco, servidor nem chave de IA. O build e os testes do CRM (raiz do repositório) ignoram
esta pasta.

> ## ⚠️ Por que você precisa apertar Enter
>
> Enviar mensagens automaticamente pelo WhatsApp Web (extensão clicando sozinha, robôs,
> Baileys/Evolution) **viola os Termos de Serviço do WhatsApp** e pode levar ao **banimento
> do número** — e com ele vai o histórico com todos os clientes. Por isso a extensão **não
> tem código que envie**: ela cola o texto e para. Um teste automático
> (`tests/sem-envio-automatico.test.ts`) reprova o build se aparecer qualquer clique no botão
> de enviar ou evento de teclado. A política de proteção abaixo **reduz** o risco; ela **não
> garante** que o número não será restringido.

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

### 3.1 CRM dentro do WhatsApp Web (v0.4)

Abra o WhatsApp Web com a extensão carregada. Nada para configurar: a barra aparece sozinha.
Tudo isso **só lê a tela e anota no seu navegador**; nada manda mensagem. Onde há texto pronto
(lembrete, resposta rápida) a extensão **cola na caixa e para**: você confere e aperta Enter.

1. **Abas de triagem** (barra acima da lista de conversas, com contadores):
   - **Todas** / **Não lidas**;
   - **Precisa de resposta**: a última mensagem **não** foi sua (conversas individuais; grupos e
     arquivadas ficam fora). Cada linha ganha o botão **dispensar** (para o "obrigado" final):
     ela some da aba até chegar mensagem nova daquele contato. Também dá para dispensar e
     reativar pelo painel do cliente;
   - **Aguardando resposta**: a última mensagem foi **sua**; a linha mostra há quanto tempo.

   Clicar numa aba **esconde as linhas que não batem** (não reordena nada do WhatsApp).
   Com a busca do WhatsApp preenchida ou na pasta "Arquivadas" o filtro fica desligado.

   > **A lista do WhatsApp é virtualizada** (só as conversas perto da tela existem no HTML). Os
   > contadores valem para as **conversas já vistas** pela extensão (estado guardado conforme
   > as linhas aparecem). A barra diz isso e tem o link **ler a lista toda**, que rola a lista
   > devagar (só leitura) para contar todas. A aba **Clientes** do painel lateral lista tudo
   > o que já foi visto, inclusive o que não está na janela da lista.
2. **Sem resposta há X dias**: na aba Aguardando resposta, escolha 1, 3, 7 ou 15 dias (dias de
   calendário desde a última mensagem sua, no fuso de Fortaleza).
3. **Lembretes de follow-up**: botão de relógio no cabeçalho da conversa aberta → **amanhã 9h**,
   **em 3 dias**, **em 1 semana** (sempre às 9h) ou data/hora **personalizada**, mais um
   **rascunho opcional** (aceita `{primeiro_nome}` e `{nome}`). Na hora marcada o Chrome mostra
   uma notificação; **clicar nela abre o WhatsApp Web na conversa e cola o rascunho** (se a
   caixa já tiver texto seu, não mexe). O ícone da extensão mostra um **selo vermelho** com os
   lembretes vencidos. A **central** (sino na barra de abas e aba **Lembretes** do painel lateral)
   separa **Vencidos / Hoje / Próximos**, com Abrir, Concluir, Adiar (amanhã 9h) e Excluir.
   Lembrete vencido com o Chrome fechado aparece como vencido ao abrir.
4. **Notas, etiquetas e fase**: botão de etiqueta no cabeçalho da conversa abre o painel do
   cliente: **fase do funil** (Novo, Orçamento, Negociando, Fechado, Perdido), **etiquetas com
   cor** (crie ali mesmo) e **notas** (salvar, editar, excluir). O chip **Etiquetas** da barra
   filtra a lista por etiqueta ou fase (junto com a aba escolhida). Renomear, recolorir e
   excluir etiquetas: aba **Clientes** do painel lateral.
5. **Respostas rápidas**: botão **Respostas** junto à caixa de digitação (ou digite **`/atalho`**
   na caixa). Modelos com título, atalho e texto; variáveis **`{nome}`** e **`{primeiro_nome}`**.
   **Inserir** só cola o texto; se a caixa já tem texto, pergunta Substituir / Adicionar /
   Cancelar. Crie, edite e exclua modelos no próprio menu.
6. **Aba Clientes** (painel lateral): contatos com fase, etiquetas, última interação e próximo
   lembrete; **busca**, filtros por fase/etiqueta e ordenação, por padrão **mais tempo sem
   contato**. O botão Abrir leva ao WhatsApp Web na conversa.

**Contato = nome exibido** (ou só os dígitos, se o contato não está salvo). Dois contatos com o
mesmo nome dividem os dados. **Dados** → *CRM: backup (JSON)*: exportar e importar (mesclar ou
substituir) contatos, notas, etiquetas, fases, lembretes e respostas rápidas.

### 3.2 Campanhas "uma tecla" (varredura → prévia → envio)

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
   5. percebe a mensagem nova no chat, registra o envio, espera 60–120 s e abre o próximo.

   Botões durante a espera: **Pular**, **Não é cliente**, **Problema**, **Não enviar mais**,
   **Pausar**. Pular/Pausar tiram da caixa o texto colado (se você não o editou).
   Enter dentro do painel não aciona botão — o Enter é para o WhatsApp.

**Feche o painel = campanha pausada.** A lógica roda no painel; ao reabrir, use *Retomar*.

### Dados e backup

Campanhas: tudo fica **só neste navegador** (IndexedDB da extensão): contatos varridos, campanhas,
envios e a lista "Não enviar mais". O CRM usa `chrome.storage.local` (chaves `vz.*`). A extensão
só guarda telefone de contato **não salvo** (o próprio número que aparece como nome) ou quando o
WhatsApp o expõe no HTML da lista. Na aba **Dados**:
exportar backup (JSON), importar (mesclar ou substituir) e exportar campanhas em CSV
(separador `;`, abre no Excel em português).

## 4. Política de proteção (embutida)

| Regra | Valor | Onde |
|---|---|---|
| Público | só contato **salvo com nome** e **com conversa anterior**; grupos, transmissões, só-número e "Não enviar mais" ficam fora | `shared/filtros.ts` |
| Horário | seg–sex 08h–18h, sáb 08h–12h, **America/Fortaleza** | `shared/constantes.ts` |
| Teto diário | **30** por dia (todas as campanhas deste navegador/número). Configurável de 1 até `TETO_DIARIO_MAXIMO` (60) — nunca acima | `shared/politica.ts` |
| Intervalo | 60–120 s sorteado após cada envio. Pode ser aumentado, nunca reduzido | `shared/politica.ts` |
| Repetição | uma mensagem por contato por campanha; quem recebeu campanha há < 14 dias fica fora (piso fixo) | `shared/campanha.ts`, `shared/banco.ts` |
| Texto | sem link na 1ª mensagem (bloqueado), até 500 caracteres, só o marcador `{primeiroNome}`; sem mídia (a extensão só cola texto). **Sem** linha "responda SAIR" (decisão do dono) | `shared/texto.ts` |
| Freio | 3 problemas seguidos pausam a campanha; erro de seletor pausa na hora | `shared/politica.ts`, `sidepanel/executor.ts` |
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
- **CRM, última mensagem é minha?** A linha da lista só mostra o ícone de entrega/leitura
  (`data-icon` com `check`, `dblcheck`, `time`) quando a última mensagem foi sua. Sem esse ícone
  a conversa conta como "do cliente". Se **nenhuma** mensagem sua for reconhecida em 15+
  conversas, a barra avisa que "Precisa de resposta" pode estar inflada.
- **CRM, não lida:** selo com `aria-label` "não lida(s)". **Arquivadas:** título da coluna
  esquerda. **Tema escuro:** classe `dark` no `body`. Tudo em `selectors.ts` (seção "CRM").
- **Envio detectado:** a última mensagem do chat é sua (`data-id` começa com `true_`), não
  existia antes de colar, e a caixa ficou vazia.

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

CRM (v0.4), também **não verificado no WhatsApp real**: ícones de entrega da linha (decidem
"Precisa de resposta" x "Aguardando"), selo de não lida, nome/data/prévia da linha, ícone de
grupo (grupos com foto própria **não** são detectados como grupo: use **dispensar**), título
da visão "Arquivadas", onde a barra entra (antes de `#pane-side`), os botões no `#main header`,
o botão flutuante sobre a caixa de digitação, o recálculo do `translateY` das linhas ao filtrar
e se `execCommand('insertText')` cola o rascunho/modelo no editor.

**Rode o checklist abaixo antes da primeira campanha real** e a cada atualização do
WhatsApp Web. Se algo falhar, ajuste só `selectors.ts` (ou o sinal correspondente) e rode
`npm test` de novo.

## 7. Checklist de teste manual

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
- [ ] Após o intervalo, abre o próximo sozinho.
- [ ] *Pular* tira o texto da caixa e abre o próximo.
- [ ] Deixe um rascunho seu num contato da lista: a extensão não sobrescreve (marca problema).
- [ ] *Não enviar mais*: o contato some das próximas prévias (aba Dados lista ele).
- [ ] *Pausar* e *Retomar* funcionam; fechar o painel pausa.
- [ ] Contato inexistente/renomeado 3 vezes seguidas → campanha pausa (freio).
- [ ] Fora do horário (ou mude o relógio): *Iniciar* não abre ninguém.

**CRM (v0.4)**
- [ ] A barra de abas aparece acima da lista, no tema claro e no escuro, sem quebrar a tela.
- [ ] "Precisa de resposta" mostra conversas em que o cliente falou por último; uma conversa em
      que a sua mensagem foi a última aparece em "Aguardando resposta" com o tempo certo.
- [ ] Grupos e arquivadas não entram em nenhuma das duas; **dispensar** tira a linha e ela
      volta quando o cliente escreve de novo.
- [ ] Filtro 1/3/7/15 dias bate com as datas da lista; filtro por etiqueta/fase funciona junto
      com a aba.
- [ ] Clicar numa aba não deixa buraco na lista; voltar para Todas restaura a lista; rolar a
      lista com filtro ligado não quebra.
- [ ] Lembrete para daqui a 2 minutos: notificação aparece; clicar abre a conversa e cola o
      rascunho **sem enviar**; selo do ícone conta os vencidos.
- [ ] Notas, etiquetas e fase salvam e continuam depois de recarregar a aba (F5).
- [ ] Botão "Respostas" junto à caixa; `/atalho` abre o menu; Inserir cola e para; com texto
      na caixa aparece Substituir/Adicionar/Cancelar.
- [ ] Aba Clientes lista os contatos e ordena por mais tempo sem contato.
- [ ] Se algo falhar, o WhatsApp continua normal e o console mostra **um** aviso `[Vita Zap]`.

**Dados**
- [ ] Exportar backup JSON, importar em outro perfil do Chrome (mesclar) — campanhas e
      "não enviar" voltam.
- [ ] Exportar CSV e abrir no Excel: acentos certos, uma linha por contato.

## 8. Estrutura

```
extensoes/vita-zap/
├── public/manifest.json        Manifest V3 (sidePanel, scripting, storage, alarms, notifications + web.whatsapp.com)
├── sidepanel.html
├── src/
│   ├── background/service-worker.ts   ícone → abre o painel; lembretes (alarmes, notificações, selo)
│   ├── background/lembretes.ts        sincroniza alarmes, dispara a notificação, clique → abrir conversa
│   ├── content/                       roda dentro do WhatsApp Web
│   │   ├── selectors.ts               TODOS os seletores
│   │   ├── extrair.ts                 leitura de uma linha da lista (puro)
│   │   ├── varredura.ts               rolagem com pausas, só leitura
│   │   ├── execucao.ts                abrir + colar + observar envio
│   │   ├── abrir-conversa.ts          único clique simulado (linha da lista)
│   │   ├── dom.ts, lista.ts           utilidades
│   │   ├── crm/                       CRM injetado em Shadow DOM: barra de abas, filtro da lista,
│   │   │                              cabeçalho (lembrete/cliente), respostas rápidas, estado
│   │   └── index.ts                   recebe pedidos do painel
│   ├── shared/                        lógica pura + IndexedDB
│   │   ├── constantes.ts              política (pisos/tetos)
│   │   ├── datas.ts                   parser de datas (Fortaleza)
│   │   ├── nomes.ts, contatos.ts      normalização, dedup
│   │   ├── filtros.ts, politica.ts, texto.ts, campanha.ts
│   │   ├── banco.ts, exportar.ts      IndexedDB, backup JSON, CSV
│   │   ├── mensagens.ts               protocolo painel ↔ content (sem "enviar")
│   │   ├── crm-*.ts                   CRM: tipos, regras das abas, lembretes, contatos, modelos,
│   │   │                              clientes, armazenamento (chrome.storage.local) e JSON
│   │   └── ia.ts                      interface da fase 2 (desligada)
│   └── sidepanel/                     React: Lembretes, Clientes, Varredura, Prévia, Envio, Dados
└── tests/                             vitest (npm test)
```

## 9. Fase 2 (IA) — preparado, não implementado

A interface está em `src/shared/ia.ts` (`ProvedorIA`, hoje `IA_DESLIGADA`). Decisão do dono:
API **Gemini**, chamada por um **proxy no servidor**; a chave **nunca** fica na extensão. A
extensão enviará só um token pessoal revogável, o primeiro nome e o texto necessário — nunca
telefone.
