Você é um engenheiro sênior de extensões Chrome. Construa, do zero e completa, a extensão **Vita Zap**: um copiloto comercial que roda dentro do WhatsApp Web (web.whatsapp.com) para a Sal Vita (sal marinho, Mossoró/RN). Responda e comente em português do Brasil. Entregue TODOS os arquivos com conteúdo completo (nada de "..." ou "implemente aqui").

## 1. Objetivo
O usuário dá uma ordem, por exemplo: "contatos com CLIENTE no nome, sem conversa desde 17/09/2026: mande 'Boa tarde, {primeiroNome}, tudo bem? Como estão de sal por aí?'". A extensão:
1. encontra esses contatos nas conversas do próprio WhatsApp do usuário;
2. mostra uma prévia para aprovação;
3. conduz o envio no modo "uma tecla": abre a conversa, cola o texto e espera o usuário apertar Enter;
4. registra tudo localmente.
O número é o pessoal do usuário. Só entram contatos **salvos com nome** e **com conversa anterior**.

## 2. Regra inviolável: o envio é sempre do usuário
Envio automático pelo WhatsApp Web viola os Termos do WhatsApp e pode banir o número. Portanto:
- A extensão NUNCA clica no botão de enviar e NUNCA simula Enter/teclas de envio (sem `click()`, `dispatchEvent(new KeyboardEvent(...))`, `execCommand('insertText')` seguido de envio, etc. no botão/caixa para enviar).
- Ela só: abre a conversa, insere o texto na caixa de mensagem e para. O usuário aperta Enter.
- Crie um teste automatizado que leia o código-fonte e FALHE se encontrar disparo de click/teclado direcionado ao envio.

## 3. Stack e estrutura
- Chrome Manifest V3, TypeScript estrito, Vite (com @crxjs/vite-plugin ou build manual equivalente), React 18 no Side Panel, Tailwind, Vitest.
- Sem dependências pesadas. IndexedDB via `idb`. Zod para validação.
- Permissões mínimas: `sidePanel`, `storage`, `activeTab`; `host_permissions`: `https://web.whatsapp.com/*`.

```
vita-zap/
  manifest.config.ts
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  README.md
  src/
    background/service-worker.ts      # abre side panel, roteia mensagens, relógio da política
    content/
      selectors.ts                     # TODOS os seletores do WhatsApp Web, num lugar só
      dom.ts                           # esperar elemento, rolar lista com pausas, abrir chat
      scanner.ts                       # varredura (somente leitura)
      composer.ts                      # insere texto na caixa (NÃO envia)
      sentDetector.ts                  # detecta que a mensagem saiu (nova bolha "saída" no chat)
      index.ts                         # ponte com o service worker
    sidepanel/
      App.tsx  pages/{Nova,Previa,Execucao,Historico,Config}.tsx  components/*
    core/
      dates.ts         # parser das datas da lista de conversas
      filters.ts       # filtro por nome/data/exclusões
      policy.ts        # horário, teto diário, intervalo, freio
      template.ts      # {primeiroNome}, variações, bloqueio de URL
      db.ts            # IndexedDB
      export.ts        # JSON/CSV
      types.ts
    ai/client.ts       # FASE 2 — interface preparada, desligada
  tests/*.test.ts
```

## 4. Funcionalidades (fase 1, sem IA)
### 4.1 Varredura (somente leitura)
- Usa a caixa de busca do WhatsApp Web com o termo informado (ex.: "CLIENTE") e lê a lista de conversas resultante, rolando com pausas de 400–900 ms.
- Para cada item: nome exibido, data/hora da última mensagem, se é grupo.
- Elegível somente se: o nome exibido NÃO é só um número de telefone (contato salvo), não é grupo, e existe conversa.
- Seletores: prefira `aria-label`, `role`, `data-testid`, `title`; documente cada um em `selectors.ts` com comentário. Se um seletor obrigatório não for encontrado, PARE e mostre erro claro ("O WhatsApp Web mudou; atualize selectors.ts") — falha fechada, nunca "chute".

### 4.2 Parser de datas (core/dates.ts) — fuso America/Fortaleza (UTC−3, sem horário de verão)
Formatos da lista: "14:32" (hoje), "Ontem", dia da semana ("segunda-feira"... "domingo", últimos 7 dias), "17/09/2026" e "17/09/26". Use `Intl` com timeZone. Datas como string pura `YYYY-MM-DD` (nunca converter data pura com `new Date('YYYY-MM-DD')`, que desloca um dia). Formato desconhecido → status "revisar" (não entra na campanha).

### 4.3 Filtros (core/filters.ts)
- Nome contém (lista) / não contém (lista), sem diferenciar maiúsculas e acentos ("Araxá" = "araxa").
- Última conversa antes de / depois de (datas).
- Excluir: grupos, "revisar", marcados "Não enviar mais", quem recebeu mensagem de campanha há menos de 14 dias, duplicados (mesmo nome).
- Cada contato sai com `motivo` de inclusão/exclusão.

### 4.4 Prévia
Tabela: nome, última conversa, incluído/excluído + motivo, texto final. Permite remover pessoas, editar texto base e até 3 variações (sorteio por contato). Texto aceita `{primeiroNome}` (primeira palavra do nome, sem "CLIENTE" e sem emojis, com capitalização correta). Bloqueia aprovar se o texto contiver URL ou se não houver ninguém incluído. Botão "Aprovar campanha" congela a lista.

### 4.5 Execução "uma tecla"
Loop:
1. Verifica a política (horário, teto, intervalo). Se não puder, mostra quando poderá.
2. Abre a conversa do próximo contato (via busca pelo nome exato; se houver mais de um resultado com o mesmo nome, marcar "Problema" e pular).
3. Insere o texto na caixa de mensagem (composer.ts) e mostra no painel: "Confira e aperte Enter".
4. `sentDetector` observa (MutationObserver) a chegada de uma nova mensagem de saída com o mesmo texto → registra "enviado" com data/hora.
5. Aguarda intervalo aleatório entre 60 e 120 s (contagem regressiva visível) e segue.
Botões: Pular, Não é cliente, Problema, Não enviar mais, Pausar/Retomar. Atalho no painel: Alt+→ = pular.

### 4.6 Política (core/policy.ts)
- Horário permitido: seg–sex 08:00–18:00, sáb 08:00–12:00 (Fortaleza). Domingo não.
- Teto diário: 30 mensagens de campanha (configurável até o máximo constante `TETO_MAXIMO = 60`).
- Intervalo entre contatos: aleatório 60–120 s (mínimo configurável nunca abaixo de 45 s).
- Uma mensagem por contato por campanha; nunca repetir quem recebeu nos últimos 14 dias.
- Freio: 3 "Problema" seguidos, ou detecção de aviso de restrição/desconexão do WhatsApp → pausa a campanha e exibe alerta.
- Sem link e sem mídia na primeira mensagem.

### 4.7 Armazenamento e histórico
IndexedDB: `contatos` (nome, ultimaConversa, status, etiquetas), `campanhas` (texto, variações, filtros, criadaEm, status), `envios` (campanhaId, contato, texto, status, em), `naoEnviar`. Página Histórico com campanhas, totais por status e exportação JSON (backup completo) e CSV (envios). Importar JSON restaura.

## 5. Fase 2 (deixar a interface pronta, desligada)
`ai/client.ts` com funções `interpretarOrdem(texto)`, `gerarVariacoes(textoBase)`, `classificarResposta(mensagem)` que chamam um PROXY HTTPS próprio (`https://<servidor>/api/zap/ai`) com token pessoal no header. A chave da Gemini fica SÓ no servidor (variável de ambiente), NUNCA na extensão. A resposta de `interpretarOrdem` é um JSON validado com zod:
`{ filtroNome: {contem: string[], naoContem: string[]}, ultimaConversaAntesDe: string|null, ultimaConversaDepoisDe: string|null, mensagemBase: string, variacoes: number }`.
Para a IA vai só o primeiro nome e o texto; nunca telefone. Classificações: interessado, pediu_preco, tem_estoque, comprar_depois, reclamacao, pediu_parar, sem_relacao. `pediu_parar` → marca "Não enviar mais".

## 6. Testes obrigatórios (Vitest)
- dates: todos os formatos, virada de ano, instante UTC que cai em outro dia em Fortaleza, formato desconhecido → revisar.
- filters: acento/maiúscula, antes/depois, exclusões e motivos, duplicados, "só número" não é elegível.
- policy: bordas de horário (07:59, 08:00, 17:59, 18:00, sábado 11:59/12:00, domingo), teto, intervalo, freio.
- template: {primeiroNome}, bloqueio de URL, variações.
- Teste de código-fonte da regra da seção 2.

## 7. README (português)
Instalação (`npm install`, `npm run build`, chrome://extensions → Modo do desenvolvedor → Carregar sem compactação → pasta `dist`), uso passo a passo, explicação da política e do porquê do "uma tecla", como atualizar `selectors.ts` quando o WhatsApp mudar, e um **checklist de teste manual** (varrer 5 contatos de teste, prévia, enviar para 2 contatos próprios, pular, pausar, freio, exportar).

## 8. Forma de entrega
1. Primeiro, a árvore de arquivos.
2. Depois, cada arquivo completo, na ordem: configs → core → content → background → sidepanel → ai → tests → README.
3. Ao final, liste os seletores que precisam ser confirmados no WhatsApp Web real e como confirmar cada um no DevTools.
Não invente APIs do WhatsApp; se algo não puder ser feito com segurança só lendo o DOM, diga.
