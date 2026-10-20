# Vita Zap — extensão do Chrome para o WhatsApp Web (fase 1, sem IA) — versão 0.2.0

Copiloto comercial que vive num **painel lateral** ao lado do WhatsApp Web. Ele acha os
contatos nas suas conversas, monta a lista, escreve a mensagem e abre cada conversa com o
texto pronto. **Quem envia é você, apertando Enter.** Especificação completa:
[`docs/PLANO-CAMPANHAS-WHATSAPP.md`](../../docs/PLANO-CAMPANHAS-WHATSAPP.md).

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

## 0. O que mudou na 0.2.0

Versão de correção (manifest e `package.json` em 0.2.0). Nenhuma regra de proteção foi
afrouxada; o teste `tests/sem-envio-automatico.test.ts` continua valendo e ganhou verificações
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
│   │   ├── abrir-conversa.ts          únicos cliques simulados (linha da lista; X de limpar busca)
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
│   │   ├── mensagens.ts               protocolo painel ↔ content (sem "enviar")
│   │   ├── avisos.ts                  padrões de aviso/grupo (texto puro)
│   │   └── ia.ts                      interface da fase 2 (desligada)
│   └── sidepanel/                     React: Varredura, Prévia, Envio, Dados + executor.ts
└── tests/                             vitest (npm test)
```

## 9. Fase 2 (IA) — preparado, não implementado

A interface está em `src/shared/ia.ts` (`ProvedorIA`, hoje `IA_DESLIGADA`). Decisão do dono:
API **Gemini**, chamada por um **proxy no servidor**; a chave **nunca** fica na extensão. A
extensão enviará só um token pessoal revogável, o primeiro nome e o texto necessário — nunca
telefone.
