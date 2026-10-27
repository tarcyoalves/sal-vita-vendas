---
name: whatsapp-web-dom
description: |
  Use ao mexer em QUALQUER código da extensão Vita Zap (extensoes/vita-zap) que lê ou escreve no WhatsApp Web:
  seletores, varredura da lista, abrir conversa, colar texto, detectar envio, classificar individual x grupo.
  Registra o DOM REAL coletado em campo (out/2026) e as regras que já causaram erro em produção.
---

# DOM real do WhatsApp Web (coletado pelo dono, out/2026)

Regra nº 1: **o repositório oficial é `extensoes/vita-zap` no GitHub (main)**. Antes de editar: `git pull origin main`.
Nunca crie pasta paralela nem copie a extensão para outro lugar: duas cópias fizeram uma IA desfazer o trabalho da outra.

## Fatos observados (não presuma outros)
- **Busca:** `#side input[role="textbox"][data-tab="3"]`. O `aria-label` fica **vazio** quando há texto digitado — nunca localize a busca por aria-label.
  O botão de limpar (X) tem `aria-label="End icon button"`, só existe com texto, dentro de `#side` (fora de `#pane-side` e de `#main`).
- **Lista:** `#pane-side`, linhas `[role="row"]` **virtualizadas** (translateY): só as visíveis existem. Nome em `span[dir="auto"][title]`.
  Data da última mensagem: "14:32", "Ontem", dia da semana, "17/09/2026". Ícones são **SVG com `<title>`** (ex.: msg-dblcheck, default-group), não `data-icon`.
  Resultado de busca tem seções "Contatos" e "Mensagens": a seção "Mensagens" repete chats já listados (não é duplicata).
  Contato não salvo aparece como "+55 84 9…". Grupo com foto própria **não** tem ícone de grupo; a prévia é "Fulano: texto".
- **Conversa aberta:** cabeçalho `#main header span[dir="auto"]`; mensagens `#main [role="row"]` com filho `[data-testid="conv-msg-<ID>"]`.
  `data-id` é **só o hash** (sem `true_`/`false_` e **sem JID**). **Não existem** `.message-in`/`.message-out`.
  Autor/horário: `.copyable-text[data-pre-plain-text="[07:37, 20/10/2026] Nome: "]`. Minha mensagem = ícone de status (msg-check/dblcheck/time) em `msg-meta`.
  Mensagens de sistema ("código de segurança mudou", "carregar mensagens mais antigas") não têm copyable-text.
- **Rodapé:** caixa `#main footer div[contenteditable="true"][role="textbox"]`; botão enviar `aria-label="Enviar"`/"Send" **só com texto**; sem texto aquele botão é o **microfone**.

## Regras que já custaram erro
1. Seletores só em `src/content/selectors.ts`, com alternativas; sem classes com hash (`_ak72`, `x1n2onr6`).
2. Comparar nomes: **igualdade normalizada**. Nunca `includes`/`startsWith` entre autor e título (aceitou "Ana" em "Ana e Equipe"). Prefixo só se o título veio cortado com "…" e tem ≥ 5 letras.
3. Classificação individual x grupo: individual exige **sinal positivo**; dúvida = `desconhecido` = não cola. No envio automático use a regra **estrita** (recebida sem autor legível = desconhecido).
4. Envio automático: antes do clique reconferir título, conversa individual, caixa com o texto exato, aviso do WhatsApp; nunca clicar no microfone; só vale como enviado se a mensagem aparecer no chat em até 20 s; marcador "em voo" para não repetir ao reabrir o painel.
5. Cliques simulados só nos pontos já permitidos pelos testes (`envio-isolado`); não afrouxe nenhum teste de segurança de envio.
6. Datas no fuso America/Fortaleza; nunca `new Date('YYYY-MM-DD')` nem `new Date()` local em teste de "ontem".
7. Consumo do banco Neon do CRM: a extensão só consulta o CRM por ação do usuário (nada de timer de rede).

## Antes de concluir qualquer mudança
`cd extensoes/vita-zap && npm test && npx tsc --noEmit -p . && npm run build && npm run publicar`; na raiz `npm run check`.
Teste novo de DOM: reaproveite `tests/ajuda/whatsapp-web-2026.ts` (fixture fiel ao DOM acima) e `tests/e2e-varredura-previa.test.ts`.
Sincronize versão (manifest, package, lock, testes de versão, `versao.json`), atualize o README e dê push em main.
Declare o que NÃO foi validado no WhatsApp real.
