# Vita Zap CRM: CRM dentro do WhatsApp Web (extensão v0.4.0)

- **Agente:** claude
- **Início:** 2026-10-21
- **Fim:** 2026-10-21
- **Status:** parcial: implementado e testado no branch; **não está em `main`** e **nada foi verificado no WhatsApp Web real**
- **Branch:** `feat/vita-zap-crm` (worktree de `tarcyoalves/sal-vita-vendas`). Sem push e sem merge: o dono revisa.

## Objetivo

Transformar a extensão `extensoes/vita-zap` num CRM dentro do WhatsApp Web, para o vendedor não
perder cliente por esquecimento, seguindo `docs/VITA-ZAP-SPEC-CRM.md` (seções 3, 4 e 5), com código
próprio. Regras: dados só do DOM (nada de script injetado na página nem módulos internos do
WhatsApp), armazenamento só em `chrome.storage.local`, **nenhuma mensagem enviada sozinha**, UI em
Shadow DOM que degrada em silêncio.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/**` (código, testes, README, manifest 0.4.0, ícone `public/icon-128.png`)
- `docs/VITA-ZAP-SPEC-CRM.md` (arquivo que estava sem versionar; só entrou no commit)
- este arquivo

**Não toquei em:** `server/`, `client/`, `api/`, schema, migrações, `vercel.json`, raiz do repositório.
`extensoes/vita-zap/vite*.config.ts` e `vitest.config.ts` ganharam `css.postcss.plugins = []` para a
extensão não herdar o `postcss.config.js` (tailwind) da raiz: sem isso o build quebra num worktree
sem `node_modules` na raiz.

## O que mudou

1. **Abas de triagem** acima da lista de conversas (Todas, Não lidas, Precisa de resposta,
   Aguardando resposta), com contadores. Precisa = última mensagem não foi minha, sem grupos e sem
   arquivadas, com botão **dispensar** por linha (volta quando chega mensagem nova). Aguardando =
   última foi minha, com tempo decorrido na linha. Clicar numa aba **esconde as linhas** que não batem
   (`display:none` e reescrita do `translateY` para não deixar buraco; o DOM do WhatsApp não é
   reordenado). Estado guardado conforme as linhas aparecem (lista virtualizada), `MutationObserver`
   com debounce, e a barra diz que os contadores são das conversas **já vistas** (link "ler a lista
   toda" rola a lista, só leitura).
2. **Sem resposta há X dias** (1/3/7/15) na aba Aguardando (dias de calendário, fuso de Fortaleza).
3. **Lembretes de follow-up**: botão no cabeçalho da conversa (amanhã 9h, 3 dias, 1 semana,
   personalizada, rascunho opcional); `chrome.alarms` + `chrome.notifications` no service worker;
   clique na notificação abre a conversa e **cola** o rascunho (reaproveita `abrir-conversa.ts`);
   central Vencidos / Hoje / Próximos no painel lateral e no WhatsApp; selo com os vencidos no ícone.
4. **Notas, etiquetas com cor e fase do funil** (Novo, Orçamento, Negociando, Fechado, Perdido) por
   contato; chip "Etiquetas" na barra filtra por etiqueta/fase.
5. **Respostas rápidas** com atalho (`/oi`), botão junto à caixa, variáveis `{nome}` e
   `{primeiro_nome}`; só cola (Substituir/Adicionar/Cancelar se a caixa já tem texto).
6. **Aba Clientes** no painel lateral (fase, etiquetas, última interação, próximo lembrete, busca e
   ordenação por mais tempo sem contato); backup JSON do CRM na aba Dados (mesclar ou substituir).
7. **Ajuste de arquitetura pedido pelo coordenador**: todo acesso a dados atrás da interface
   `RepositorioContatos` (`src/shared/repositorio.ts`), implementada por `RepositorioLocal`
   (`src/shared/repositorio-local.ts`), que é o **único** arquivo que usa `chrome.storage`
   (`tests/arquitetura-repositorio.test.ts`). Contato tem **id interno** (nome e telefone são atributos,
   com aliases e `vincular`); **telefone normalizado só com dígitos e DDI 55**, lido do DOM (nome
   exibido numérico, `@c.us` das mensagens, painel de dados); campos prontos para o futuro adaptador do
   CRM Lembretes: `telefone`, `notas`, `etiquetas`, `fase`, lembretes (`venceEm`), `ultimoContatoEm`,
   `convertidoEm`. **Nenhum código de rede.**

## Garantia de não enviar sozinho

`tests/sem-envio-automatico.test.ts` continua igual e passando: nenhum evento de teclado, nenhum
clique no botão de enviar, `dispatchEvent` só em `dom.ts` (evento `input`) e `abrir-conversa.ts`,
`execCommand` só `insertText`/`delete`. Lembretes e respostas rápidas só colam o texto; o usuário
aperta Enter. O menu por `/atalho` só escuta o evento `input` (não usa eventos de teclado).

## O que NÃO foi verificado no WhatsApp real

Tudo foi testado com **HTML sintético** (jsdom) e chrome falso. Não verificado:

- que a barra entra certo antes de `#pane-side` e não quebra o layout (altura da lista, tema escuro);
- o ícone de entrega/leitura da linha (decide Precisa x Aguardando) e o selo de não lida;
- nome, data e prévia da linha; ícone de grupo (grupo com foto própria **não** é reconhecido como
  grupo: use dispensar);
- título da visão "Arquivadas" (o filtro só se desliga se esse texto for achado);
- o `translateY` das linhas e o recálculo ao filtrar, e o comportamento ao rolar com filtro ligado
  (a virtualização só renderiza a janela perto da tela; as linhas que ficam são encostadas no início
  da janela);
- botões no `#main header` e o botão flutuante sobre a caixa de digitação (posição por
  `getBoundingClientRect`);
- `execCommand('insertText')` colando no editor do WhatsApp; abrir a conversa pela busca ao clicar na
  notificação; notificações do Chrome no Windows (foco do SO);
- de onde sai o telefone: ids `@c.us` das mensagens e o painel "Dados do contato".

## Seletores que podem quebrar (todos em `src/content/selectors.ts`, seção "CRM")

`iconeMinhaMensagem` (`data-icon` com `check`, `dblcheck`, `time`), `seloNaoLida` (`aria-label`),
`linhaArquivadas`, `idDaLinha` (`[data-id*="@"]`), `cabecalhoColunaEsquerda` (`#side header`),
`cabecalhoConversa` (`#main header`), `rodapeConversa`, `temaEscuro` (`body.dark`),
`painelDadosContato`, mais os já existentes: `painelLateral` (`#pane-side`), `linhaConversa`
(`role="listitem"`), `tituloLinha`, `iconeGrupo`, `caixaBusca`, `caixaMensagem`, `tituloCabecalho`,
`mensagem` (`#main [data-id]`). Se nenhum bater, a UI some em silêncio e há um único `console.warn`
com prefixo `[Vita Zap]`. Se nenhuma mensagem sua for reconhecida em 15+ conversas, a barra avisa que
"Precisa de resposta" pode estar inflada.

## Pendências e decisões abertas

- Rodar o checklist manual do README (seção 7, bloco "CRM") com uma conta real e 2 ou 3 contatos de
  confiança antes de usar de verdade.
- `ultimoContatoEm` é o instante estimado da **última mensagem de qualquer lado** (data do rótulo da
  linha); se o CRM Lembretes quiser "última vez que EU falei", falta um campo próprio.
- Contato = id interno; a ligação por nome é aproximada (nome normalizado). Dois contatos com o mesmo
  nome e sem telefone dividem registro até o telefone aparecer.
- Respostas rápidas não têm anexos (só texto), por decisão de escopo.

## Como verificar

```bash
cd extensoes/vita-zap
npm install
npm test          # 23 arquivos, 342 testes
npm run build     # typecheck + build em dist/
```

Carregar `extensoes/vita-zap/dist` em `chrome://extensions` (modo desenvolvedor) e recarregar a aba
do WhatsApp Web (F5).
