---
name: vita-zap
description: Manutenção da extensão Vita Zap (Chrome MV3, CRM dentro do WhatsApp Web) e da integração com o CRM Lembretes (lembretes.salvitarn.com.br). Use quando o pedido falar de Vita Zap, extensão do WhatsApp, abas Precisa/Aguardando resposta, faixa do lead, lembretes da extensão, campanha/varredura/envio, instalador Vita Zap, ou quando um print do WhatsApp Web com a barra "VZ" mostrar erro.
---

# Vita Zap: como diagnosticar, corrigir e publicar

Responda sempre em português do Brasil, em linguagem simples (o dono não é programador). Economize tokens: leia arquivos por trechos (`grep -n`, `sed -n 'A,Bp'`), nunca bundles inteiros.

## 1. Onde está tudo

- Repositório: `tarcyoalves/sal-vita-vendas` (mesmo repo do CRM Lembretes e da loja Premium). Push em `main` = deploy de PRODUÇÃO na Vercel (projeto `sal-vita-vendas`, team `tarcyoalves-projects`).
- Extensão: `extensoes/vita-zap/` (Vite + TypeScript + React no painel lateral). Projeto separado: `package.json` e testes próprios.
  - `src/content/` roda dentro do WhatsApp Web. `selectors.ts` concentra TODOS os seletores frágeis do WhatsApp.
  - `src/content/crm/` = barra superior, abas, faixa do lead, lembretes, respostas rápidas (tudo em Shadow DOM).
  - `src/background/` = service worker (alarmes, notificações, chamadas ao CRM, mensagens externas).
  - `src/shared/` = regras puras (testáveis) e repositórios (`RepositorioLocal` é o ÚNICO que toca `chrome.storage`).
  - `src/sidepanel/` = painel lateral (abas Lembretes, Clientes, Varredura, Prévia, Envio, Dados).
  - `instalador/` = `Instalar-VitaZap.cmd` + `Atualizar-VitaZap.ps1` (Windows, sem admin).
- CRM (servidor): `server/routers/tasks.ts` (`findForWhatsapp`, `reminders`, `meusLeadsFilter`), `shared/extensao.ts` (ID e origem da extensão), `server/lib/csrfGuard.ts`.
- Página de instalação no CRM: `client/src/pages/VitaZap.tsx` (rota `/vita-zap`). Arquivos publicados: `client/public/vita-zap/` (zip, `versao.json`, instalador).
- Especificação: `docs/VITA-ZAP-SPEC-CRM.md`. Registro: `coordenacao/registro/2026-10-21-claude-vita-zap-crm*.md`.

## 2. Regras que NUNCA se quebram

1. **A extensão nunca envia mensagem sozinha.** Ela abre a conversa e cola o texto; quem aperta Enter é a pessoa. `tests/sem-envio-automatico.test.ts` reprova: `.click()`, `KeyboardEvent`, `dispatchEvent` fora de `dom.ts`/`abrir-conversa.ts`, `MouseEvent/PointerEvent` fora de `abrir-conversa.ts`. NUNCA edite esse teste nem `tests/arquitetura-repositorio.test.ts` para "passar".
2. **Banco Neon no plano grátis: nada de consulta periódica ao CRM.** Só por ação do usuário (abrir conversa, abrir painel, botão "Atualizar do CRM", login). Os testes `crm-consumo*` garantem isso. Arquivo estático (`/vita-zap/versao.json`) não conta.
3. **Cada atendente vê só os próprios leads e lembretes** (inclusive o admin): `tasks.reminders({ meus: true })` e `findForWhatsapp` usam `meusLeadsFilter`.
4. **Faixa do lead, consulta ao CRM e aba Clientes só para contatos com "cliente" no nome** (`ehContatoCliente` em `src/shared/crm-regras.ts`). Contato pessoal não aparece.
5. **Origem da extensão no servidor é exata**: `chrome-extension://anlifdaoagpcbdjpbflodkcialbdbghh`. Nunca `*` nem "qualquer chrome-extension". O ID vem do `key` do manifest; a chave privada NÃO fica no repo.
6. **Nunca commitar com teste falhando.** Rode e confira o resultado ANTES do `git commit` (não encadeie com `;`).
7. **Push em `main` só com OK explícito do dono**, a cada vez. Branch atual de trabalho: confira com `git branch --show-current`.
8. Não mexer em `vercel.json`, `vite.config.ts` da raiz nem em nada da loja Premium sem avisar: são compartilhados.

## 3. Rotina de qualquer correção

```bash
cd extensoes/vita-zap
npx vitest run            # todos têm de passar
npm run build             # typecheck + build em dist/
```
Para cada versão nova:
1. Suba a versão em `public/manifest.json`, `package.json` e `tests/extensao-id.test.ts` (as três iguais).
2. `npm run publicar` (gera `client/public/vita-zap/vita-zap.zip` e `versao.json`; `tests/publicacao.test.ts` reprova se ficar atrás do manifest).
3. Rode os testes de novo. Se mexeu no servidor/CRM, na raiz: `npm run check` e `FB_CAPI_TOKEN=x WA_API_KEY=y npx vitest run` (no Windows, `schema-preguicoso` e `smbi-multi-item-tool` falham por CRLF também no main: ignore só esses dois).
4. O Chrome do dono carrega a pasta `C:\Users\Tarcyo Alves\Downloads\vita-zap` (e mantenha também `vita-zap-0.6.0` sincronizada). Copie o `dist` para lá (apague só a subpasta `assets` antes) e peça: ↻ em `chrome://extensions` + F5 na aba do WhatsApp.
5. Commit em português com a linha final `Co-Authored-By: ...` do agente. Pergunte antes do push.
6. Depois do push: acompanhe até `https://lembretes.salvitarn.com.br/vita-zap/versao.json` mostrar a versão nova (o build leva 5 a 7 min). Atendentes com o instalador recebem em até 1 hora (ou pelo atalho "Atualizar Vita Zap").

## 4. Armadilhas do WhatsApp Web já vistas (10/2026)

| Sintoma | Causa | Como foi resolvido |
|---|---|---|
| Aviso "Não reconheci nenhuma mensagem sua"; Precisa/Aguardando errados | Ícones viraram `<svg><title>wds-ic-read</title>` sem `data-icon` | `TITULOS_ICONE` em `selectors.ts`: `encontrar`/`existeAlgum` também procuram pelo `<title>` do svg |
| Faixa do lead apagada e sem clique | Painel de mensagens fica por cima | host da faixa com `position: relative; z-index: 5` |
| Barra de formatação (B, I…) foi para o canto | O WhatsApp posiciona a barra por `transform`; zerar quebra | usar a propriedade CSS `translate`, nunca sobrescrever `transform` |
| "Painel da conversa não encontrado (#main)" na campanha | O clique na linha não abria a conversa (WhatsApp Business) | `abrirLinhaDaLista`: pointerdown/mousedown/pointerup/mouseup/click no elemento do centro da linha (`elementFromPoint`) |
| Barra "Etiquetas" duplicada; "A extensão não respondeu" | Extensão atualizada com a aba aberta: script antigo continua vivo | script órfão (`chrome.runtime.id` vazio) se desliga; o novo apaga `[data-vita-zap]` antigos; mensagem pede F5 |
| "Não encontrei caixa de busca" | Variações do campo (placeholder, inglês, sem aria-label) | mais alternativas em `caixaBusca`; mensagem manda abrir a lista de Conversas e dar F5 |
| Versão não muda após ↻ | O ↻ só relê a pasta; ninguém trocou os arquivos | no PC do dono copiar o dist; nos atendentes, instalador (tarefa de hora em hora) |

**Em aberto (22/10/2026):** a campanha abre a conversa mas não cola. Suspeita: `#main [data-id]` sumiu, então `classificarConversa` devolve `desconhecido`. Peça o diagnóstico abaixo antes de mudar a regra de segurança de grupo.

## 5. Diagnóstico sem acesso ao WhatsApp do usuário

Você NÃO vê o WhatsApp dele. Nunca chute seletor: peça para colar no Console (F12 → Console) um código que só LÊ estrutura, sem texto de mensagem nem nomes. Exemplos:

Ícones e estado das linhas da lista:
```js
(() => { const rows=[...document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')].slice(0,6); console.log(JSON.stringify(rows.map((r,i)=>({i, icones:[...r.querySelectorAll('[data-icon]')].map(e=>e.getAttribute('data-icon')), svgs:[...r.querySelectorAll('svg title')].map(t=>t.textContent)})),null,1)); })();
```
Conversa aberta (mensagens, caixa e cabeçalho):
```js
console.log(JSON.stringify({ comDataId: document.querySelectorAll('#main [data-id]').length, exemplos: [...document.querySelectorAll('#main [data-id]')].slice(0,3).map(e => e.getAttribute('data-id').replace(/\d/g,'9')), caixa: !!document.querySelector('#main footer [contenteditable="true"]'), titulo: document.querySelector('#main header span[dir="auto"]')?.textContent }));
```
Campos de texto (busca):
```js
console.log(JSON.stringify([...document.querySelectorAll('input, [contenteditable="true"]')].map(e => ({ tag: e.tagName, role: e.getAttribute('role'), label: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'), dentroSide: !!e.closest('#side') })), null, 1));
```
Peça também: a versão em `chrome://extensions` (confirme que é a esperada) e o motivo do erro em "Contatos da campanha" (painel → 3. Envio).

Com o resultado: corrija em `selectors.ts` (acrescente alternativas, não remova as antigas), crie um teste em `tests/` com o HTML real reduzido, rode tudo e siga a rotina da seção 3.

## 6. Instalador e atualização dos atendentes

- `Instalar-VitaZap.cmd` (página `/vita-zap` do CRM): instala em `%LOCALAPPDATA%\VitaZap\extensao`, cria atalho na pasta Inicializar, atalho "Atualizar Vita Zap" na área de trabalho e a tarefa agendada do usuário "Vita Zap - atualizador" (`schtasks /SC HOURLY`, via `.vbs` para não piscar janela). Sem admin, sem registro.
- Troca de versão: só se `versao.json` for maior; confere o ID pelo `key` do manifest do zip; extrai em `extensao.novo` e renomeia; em falha mantém a antiga. Log: `%LOCALAPPDATA%\VitaZap\atualizador.log`.
- Pester: `cd extensoes/vita-zap/instalador; Invoke-Pester -Script .\Atualizar-VitaZap.Tests.ps1`. Para teste real use `-Origem http://localhost:PORTA -Pasta <temp> -PastaInicializar <temp> -PastaAreaTrabalho <temp>` e, ao final, `schtasks /Delete /F /TN "Vita Zap - atualizador"` e apague a pasta temporária. Não deixe nada instalado na máquina do dono.
- Se o Windows mostrar SmartScreen: "Mais informações" → "Executar assim mesmo".

## 7. Ao terminar

Diga ao dono, em poucas linhas: o que mudou, o que foi testado (números), o que NÃO foi verificado no WhatsApp real, e o que ele precisa fazer (↻ + F5, ou rodar o instalador). Pergunte antes de qualquer push.
