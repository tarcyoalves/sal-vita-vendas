# Vita Zap + CRM Lembretes: integração pelo login do CRM (extensão v0.5.0)

- **Agente:** claude
- **Início:** 2026-10-21
- **Fim:** 2026-10-21
- **Status:** parcial: implementado e testado no branch; **não está em `main`**, **nada foi verificado em produção** nem no WhatsApp Web real
- **Branch:** `feat/vita-zap-crm` (worktree de `tarcyoalves/sal-vita-vendas`). Sem push, sem merge, sem mexer na Vercel. **Push em `main` = deploy de produção.**

## Objetivo

Deixar a extensão `extensoes/vita-zap` pronta para integrar com o CRM Lembretes
(`lembretes.salvitarn.com.br`) usando o login do CRM: lead (task) da conversa, registrar contato,
reagendar, etiquetas, converter e lembretes do CRM na central e nos alarmes. Sem login a extensão
continua 100% local (modo misto). Continua valendo: **a extensão nunca envia mensagem de WhatsApp**.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/**` (código, testes, README, manifest, versão 0.5.0, dependência `superjson`)
- `server/routers/tasks.ts` (procedure nova `findForWhatsapp`; `reminders` passou a devolver `phone`)
- `server/lib/whatsappLead.ts` (novo: validação do input e regras puras), `shared/extensao.ts` (novo)
- `api/index.ts` e `server/index.ts` (origem da extensão na lista de CORS/csrfGuard)
- `tests/extensao-vita-zap.test.ts` (novo)
- este arquivo

**Não toquei em:** schema, migrações, `client/`, `vercel.json`, variáveis da Vercel, `api/bundle.js`.
Nenhuma coluna ou tabela nova (não há migração nem `SCHEMA_VERSION`).

## Commits (do mais antigo ao mais novo, só os desta integração)

1. ID fixo da extensão (chave pública no manifest), host do CRM e versão 0.5.0
2. Servidor: origem da extensão no CORS/csrfGuard e `tasks.findForWhatsapp`
3. Adaptador `RepositorioCRM` e serviço do CRM (login, lead, fila offline, lembretes)
4. Faixa do lead no cabeçalho da conversa e ações
5. Login do CRM na aba Dados
6. Central do painel abre lembrete do CRM pelo telefone
7. Documentação (README da extensão, seção 3.3, e este registro)

## O que mudou

### Servidor (mudança mínima)

- **ID fixo:** par RSA 2048 gerado com `node:crypto`; a chave **pública** está em `key` no
  `extensoes/vita-zap/public/manifest.json`; o ID resultante é **`anlifdaoagpcbdjpbflodkcialbdbghh`**
  (`shared/extensao.ts` e `extensoes/vita-zap/src/shared/constantes.ts`; um teste em cada lado confere
  que ID e chave batem). A chave **privada não está no repositório**.
- **Origem permitida:** `chrome-extension://anlifdaoagpcbdjpbflodkcialbdbghh` entra em `ALLOWED_ORIGINS`
  do `api/index.ts` (usada pelo CORS e pelo `csrfGuard`) e na lista do `server/index.ts`, em código,
  somada ao `ALLOWED_ORIGINS` da Vercel: **não precisa de variável nova**. A env opcional
  `EXTENSION_ORIGINS` (lista separada por vírgula) **substitui** o ID padrão; só vale
  `chrome-extension://` + 32 letras a-p, o resto é descartado; nunca `*` e nunca "qualquer extensão".
  Efeito colateral: o CORS é global, então a extensão também passa a ser aceita nas rotas da loja
  Premium (que já eram abertas a origens permitidas).
- **`tasks.findForWhatsapp`** (`protectedProcedure`): input `{ phone?, q? }` (pelo menos um; `q` de 2 a
  100 caracteres), no máximo **20** resultados, **mesmo filtro de dono** de `list`/`update`
  (`userTaskFilter`; admin vê tudo). Telefone casa pelos **dígitos normalizados**, com e sem DDI 55 e
  com e sem o 9 extra do celular. Devolve só `id, title, phone, tags, reminderDate, reminderEnabled,
  status, lastContactedAt, contactCount, convertedAt` e os **últimos 500 caracteres** de `notes`.
- **`tasks.reminders`** ganhou o campo `phone` (a extensão abre a conversa por ele). Mudança aditiva.

### Extensão (v0.5.0)

- **`RepositorioCRM`** (`src/shared/repositorio-crm.ts`) implementa `RepositorioContatos` por cima do
  `RepositorioLocal`; os lembretes do CRM entram na central, no selo e nos alarmes. O `RepositorioLocal`
  continua o único arquivo com `chrome.storage` (teste de arquitetura intacto).
- **Cliente tRPC mínimo** (`src/shared/crm-rede.ts`, `superjson`) e **`ServicoCrm`**
  (`src/shared/servico-crm.ts`) rodam **só no service worker**; o WhatsApp Web e o painel o chamam por
  mensagem (`crm-transporte.ts`; o content script não pode usar o cookie do CRM por causa do CORS da
  página). O service worker aceita mensagens só da própria extensão e só os métodos de `LeadsCRM`.
- **Login:** `auth.login` + `auth.me`; "logado como"; `auth.logout`. A senha não é guardada. Erros em
  português: senha errada, 401/sessão, IP, sem rede, 429, origem recusada (403).
- **Lead da conversa:** vínculo conversa→task guardado localmente (por id do contato, telefone e nome);
  sem vínculo, busca por telefone; sem lead: **Vincular** (busca por `q`) ou **Criar lead** (nome +
  telefone; o CRM exige `reminderDate`, então nasce com lembrete para amanhã 9h).
- **Faixa do lead** no cabeçalho + ações: Registrar contato (anexa `[data hora] texto` às notas),
  Reagendar, Etiquetas, Marcar convertido (valor opcional).
- **Lembretes do CRM** a cada 5 min (`chrome.alarms`); dedupe por `crm:<taskId>:<horário>`; os vencidos há
  mais de 15 min vistos pela 1ª vez entram sem notificação. Clique abre `web.whatsapp.com/send?phone=…`.
- **Fila offline:** ações sem rede ou com a sessão caída ficam em `vz.crm.fila` e são reenviadas
  (alarme, login, botão), por usuário e na ordem, sem duplicar a linha de contato.

### Decisão que foge do pedido (precisa do seu OK)

O pedido era `host_permissions` para o domínio do CRM, **mas** `tests/sem-envio-automatico.test.ts` exige
`host_permissions == ['https://web.whatsapp.com/*']` e o teste "continua intacto". Então o CRM entrou em
**`optional_host_permissions`** (`lembretes.salvitarn.com.br`, `https://*/*` para o endereço configurável e
`http://localhost/*`): o Chrome pede a permissão **uma vez**, no clique de **Entrar**. Ganho: o painel de
permissões da extensão continua mostrando só o WhatsApp até o usuário optar pelo CRM. Se preferir
`host_permissions` fixo, é preciso atualizar aquele teste de propósito (decisão do dono).

## Para ir ao ar (nada disto foi feito)

1. Revisar o branch. **Antes do merge**, rodar `npm run check` e `FB_CAPI_TOKEN=x WA_API_KEY=y npm test` na
   raiz **com checkout em LF** (ver "Testes" abaixo).
2. `git push origin main` (ou merge): **isto publica em produção** (Vercel). Confirmar com o dono. O
   `api/bundle.js` **não foi regenerado** (HANDOFF-HERMES, passo 9: é regerado no deploy). Se o deploy não
   o regenerar, rodar `npm run build:api` e commitar.
3. Na máquina de quem vai usar: `cd extensoes/vita-zap && npm install && npm run build`; em
   `chrome://extensions` recarregar (↻) a extensão (**conferir que o ID é `anlifdaoagpcbdjpbflodkcialbdbghh`**:
   se a extensão já estava carregada sem `key`, o ID muda e é preciso **remover e carregar de novo**) e dar F5
   na aba do WhatsApp Web.
4. Dados → CRM Lembretes → Entrar com **um usuário de teste**, e rodar o bloco "CRM Lembretes" do checklist
   do README (seção 7).
5. Só depois liberar para os atendentes. Guardar a chave privada (abaixo) se um dia for publicar na Chrome
   Web Store (a loja gera o próprio ID; aí o ID do servidor precisa mudar via `EXTENSION_ORIGINS`).

Chave privada (fora do repositório): `C:\Users\TARCYO~1\AppData\Local\Temp\claude\C--Users-Tarcyo-Alves--claude\86bb7ddf-14d9-4732-9542-af999bb85975\scratchpad\vita-zap-key.pem`
(pasta temporária da sessão: **copie para um cofre** se quiser guardá-la; sem ela só se perde a
possibilidade de reassinar um `.crx` com o mesmo ID, o modo "carregar sem compactação" não precisa dela).

## O que NÃO foi verificado em produção

- **Nada rodou contra o CRM real nem contra o WhatsApp Web real.** Os testes usam `fetch` falso falando o
  protocolo tRPC + superjson, chrome falso e HTML sintético.
- O **formato exato** de requisição/resposta tRPC v11 (GET `?input=` com `{json,meta}`, POST com o input no
  corpo, erro em `error.json`) foi seguido do que o cliente do próprio CRM usa (`httpLink` + superjson);
  não foi testado contra o servidor de verdade. `auth.logout` e `auth.me` não têm input: o POST de
  logout vai com corpo `{"json":null}`.
- Que o **Chrome envia o cookie de sessão** nas requisições do service worker (ver Riscos).
- Que `tasks.findForWhatsapp` roda no Postgres (a SQL com `regexp_replace`/`translate`/`position` não foi
  executada; só a validação do input, as variantes de telefone e a forma da procedure têm teste). **Teste
  com banco antes de liberar.** A busca por telefone faz varredura da tabela `tasks` (sem índice na coluna
  normalizada): custo pequeno por busca, mas veja o risco de consumo abaixo.
- Que a faixa do lead se encaixa no layout do WhatsApp Web (inserida logo após `#main header`), nos dois
  temas, e que `web.whatsapp.com/send?phone=` abre o chat de números não salvos.
- A permissão opcional do Chrome (o popup aparece no clique de Entrar).

## Riscos e pontos de atenção

1. **Cookie `SameSite=Lax` na requisição da extensão (principal risco).** O JWT de 7 dias é `HttpOnly;
   SameSite=Lax`. O fetch do service worker com `credentials: 'include'` deve enviar o cookie por a
   extensão ter permissão de host, mas **isso não foi comprovado aqui**. Se o Chrome não enviar (ou não
   guardar o `Set-Cookie` do login), o sintoma é: login "aceito" e `auth.me` devolvendo `null` logo em
   seguida; a extensão mostra "o CRM aceitou o login, mas não reconheceu a sessão… IP… ou cookie". O mesmo
   sintoma aparece com **IP restrito**: `createContext` trata IP fora da lista como "não logado" (não há
   erro específico de IP), então a extensão só consegue dizer "uma das duas causas".
2. **Plano B (não implementado): token Bearer.** (a) procedure nova, por exemplo `auth.extensionLogin`,
   que valida e-mail/senha como `auth.login` e devolve o JWT **no corpo**, só para origem de extensão;
   (b) `createContext` aceitar `Authorization: Bearer <jwt>` além do cookie, **com as mesmas checagens**
   (versão da senha `pv`, usuário ativo, restrição de IP); o CORS já permite o header `Authorization`;
   (c) a extensão guarda o token em `chrome.storage.session` (some ao fechar o Chrome; nunca
   `local`), manda no header e trata 401 como hoje; (d) considerar validade menor que 7 dias e revogação ao
   trocar a senha (o `pv` já faz isso). Custo: token em memória da extensão e mais uma porta de entrada
   no servidor: revisar com o dono antes.
3. **Consumo do banco (Neon).** Cada usuário logado consulta `tasks.reminders` a cada 5 min e o lead da
   conversa aberta a cada minuto. O repositório acabou de cortar acordadas do Neon (commit `37c29c0`);
   veja `docs/COTAS-E-LIMITES.md` antes de liberar para todos. O intervalo é a constante
   `INTERVALO_SYNC_MIN` (`extensoes/vita-zap/src/background/crm-sync.ts`) e o minuto da faixa é
   `leadCache` em `src/content/crm/index.ts`.
4. **Alerta de rajada no CRM:** `tasks.update` com nota nova marca contato; 10 ou mais contatos em 10 min do
   mesmo usuário ligam `burstWarning` (`fraudAlerts`). Esvaziar uma fila longa de uma vez pode disparar o
   aviso. Os contatos só entram por ação explícita do usuário.
5. **Rate limit do login:** 10 tentativas por e-mail em 15 min (`authLimiter`); a extensão mostra "muitas
   tentativas".
6. **`/send?phone=` recarrega a aba do WhatsApp Web** (perde o foco do que estava na tela; o rascunho do
   WhatsApp é guardado por ele). Os lembretes locais continuam abrindo pelo nome, sem recarregar.
7. **Concluir/Excluir** um lembrete do CRM só o esconde na extensão (no CRM os lembretes são recorrentes e
   nada muda). **Adiar** muda `reminderDate` no CRM.
8. **Dois dispositivos/abas:** a fila e o cache são por navegador; a nota é anexada sobre as notas
   **atuais** do CRM (lê de novo antes de gravar), mas duas pessoas editando a mesma task ao mesmo tempo
   ainda podem se sobrepor (o CRM não tem controle de versão nas notas).
9. **Telefone só no título/notas do lead** (sem a coluna `phone`) não é achado pela busca por telefone: use
   **Vincular a um lead** (vale para sempre naquele navegador).
10. O `key` no manifest vale para "carregar sem compactação". Publicar na Chrome Web Store muda o ID.

## Testes (resultado nesta máquina)

- Extensão (`extensoes/vita-zap`): `npm test` e `npm run build` passam (veja o relatório final do
  commit/entrega para os números). `tests/sem-envio-automatico.test.ts` e
  `tests/arquitetura-repositorio.test.ts` **não foram alterados**.
- Raiz: `npm run check` passa. Em `FB_CAPI_TOKEN=x WA_API_KEY=y npm test`, **dois testes antigos falham neste
  worktree do Windows por causa de CRLF** (o `git config core.autocrlf=true` deixa os arquivos com CRLF e
  eles comparam texto com `\n`): `tests/schema-preguicoso.test.ts` ("o middleware do tRPC usa a decisão por
  requisição") e `tests/smbi-multi-item-tool.test.ts`. Falham **igual no commit anterior, sem as minhas
  mudanças**. Num checkout com `core.autocrlf=false` (LF, como no Linux/Vercel) a suíte da raiz passa
  inteira. Os testes novos (`tests/extensao-vita-zap.test.ts`) passam nos dois casos.

## Como verificar

```bash
# raiz
npm run check
FB_CAPI_TOKEN=x WA_API_KEY=y npm test
# extensão
cd extensoes/vita-zap && npm install && npm test && npm run build
```

## Nota (v0.5.1): consumo do banco, "consulta só por uso, com teto"

O banco do CRM é Neon no plano grátis (compute suspende após ~5 min sem consultas; horas por mês limitadas).
A v0.5.0 mantinha o banco ligado: alarme `vzcrm-sync` a cada 5 min, `tasks.reminders` a cada despertar do
service worker e o lead da conversa a cada ~60 s. Mudanças (só em `extensoes/vita-zap`, nada no servidor):

- Removido o alarme `vzcrm-sync` (limpo com `chrome.alarms.clear` no `onInstalled`) e a busca em `iniciarCrm()`.
- Lembretes: só no login, ao abrir o painel lateral, quando a aba do WhatsApp Web carrega (no máximo 1 busca por hora,
  guardada em `vz.crm.lembretes.em`, sobrevive ao service worker dormir) e no botão "Atualizar do CRM" (ignora o mínimo;
  também reenvia a fila). Notificações: alarmes locais a partir do cache, como antes.
- Lead da conversa: só ao abrir a conversa, com cache de 30 min por contato (inclusive "não achei"/"vários",
  `vz.crm.buscas`). O ciclo de 30 s e o MutationObserver não fazem rede. Ações do usuário atualizam o cache com a
  resposta da própria mutation. Fila offline: só reenvia por ação do usuário, login ou "Atualizar do CRM".
- Toda chamada ao CRM é logada em `console.debug` com o motivo. Testes: `tests/crm-consumo.test.ts` e
  `tests/crm-consumo-conteudo.test.ts` (relógio falso: 8 h sem ação = zero rede; 50 despertares = no máximo 1 busca).
- Mudança de contrato: `leadDoContato(ref, { forcar? })` e `sincronizarLembretes(motivo?)` ganharam parâmetros
  opcionais; os testes antigos que dependiam de reconsulta a cada chamada passaram a usar `forcar`.

## Nota (v0.6.0): barra superior do CRM

Só em `extensoes/vita-zap` (nada no servidor nem no CRM). A barra superior de largura total (48 px, Shadow DOM)
substitui a barra de abas acima da lista: abas fixas, de funil e personalizadas ("+"), ajustes de filtro,
respostas rápidas, central de lembretes, Clientes, conta e ajuda; ícones de lembrete e respostas rápidas na caixa
de digitação (só colam/agendam, nunca enviam); chip "Etiquetas" e faixa do lead com o mesmo estilo; opção
"Mostrar barra superior" na aba Dados (padrão ligado; desligada volta o layout antigo).

- Layout: `#app` (seletor `raizApp`) recebe `calc(100vh - 48px)` + margem de 48 px, revertidos ao desligar; se o
  seletor falhar a barra flutua com sombra e há um `console.warn` (uma vez). Seletor novo `microfone` posiciona
  os ícones da caixa. **Nenhum dos dois foi validado no WhatsApp Web real.**
- Neon: nenhuma consulta nova nem periódica; `crm-consumo*` continuam verdes.
- Harness: `npm run harness` (porta 5288) serve `dev/harness.html`, um WhatsApp falso estático que carrega o
  `dist/content.js` com `chrome.*` falso (`?crm=1` simula login e lead). Layout, tema claro/escuro e rolagem
  conferidos ali, não no WhatsApp real.
- Teste `crm-painel-clientes` ("há 1 dia"): falhava só porque a data estava fixa em 2026-10-20 e o relógio
  passou de 21/10; agora a data é "ontem", calculada em tempo de execução. Não era regressão da v0.6.
- Testes jsdom novos: `tests/crm-barra-superior.test.ts` e `tests/crm-abas.test.ts`.


## 22/10/2026: distribuição pelo CRM (extensão 0.7.0, branch local `wip/vita-zap-0.6-barra`)

Status: implementado e testado no branch; **sem push, sem merge, nada em produção**. Push em `main` = deploy.

- Extensão 0.7.0: `externally_connectable` (CRM + `http://localhost:5173`); o service worker só responde a essas origens e
  só ao `{tipo:'ping'}` com `{ok, versao, conectadoAoCrm, temPermissao}` (sem dado pessoal; `tests/mensagem-externa.test.ts`).
- Login automático: `ServicoCrm.conectarPelaSessao()` (um `auth.me`, mesmo cookie do site); botão "Conectar ao CRM" na barra e
  na aba Dados; ao abrir o painel só consulta se a permissão do domínio já existe. E-mail e senha só se o site disser que
  não há sessão. Nada periódico.
- Aviso "Nova versão X disponível" lendo `/vita-zap/versao.json` estático (no máximo 1 vez a cada 6 h, só com a permissão).
- `npm run publicar` (em `extensoes/vita-zap`): build + `client/public/vita-zap/{vita-zap.zip, versao.json, Instalar-VitaZap.cmd,
  Atualizar-VitaZap.ps1}`. O zip é determinístico. `tests/publicacao.test.ts` reprova se o publicado ficar atrás do manifest.
- Instalador Windows (`extensoes/vita-zap/instalador/`): PowerShell 5.1, sem admin. Confere o ID da extensão, troca a pasta por
  renomeação e mantém a antiga se falhar. Testado com Pester e com execução real contra servidor local (instalar, mesma versão,
  atualizar, zip de outro ID, zip corrompido, sem rede, origem insegura).
- CRM: página `/vita-zap` (menu para todos os papéis), `client/src/lib/vitaZap.ts`, `tests/vita-zap-pagina.test.ts`.
  `vercel.json` passou a servir `.zip/.cmd/.ps1` (antes caíam no index.html) e o PWA ganhou `navigateFallbackDenylist` para `/vita-zap/`.
- Não toquei em: servidor, schema, migrações. Nenhuma procedure nova.
- Não verificado: instalação no Chrome real, `externally_connectable` com a extensão carregada, cookie da sessão chegando ao
  service worker, a página em produção/navegador, SmartScreen com o `.cmd` baixado, e o deploy na Vercel.
