# Plano — "Vita Zap": copiloto comercial com IA no WhatsApp Web

Status: **fase 1 (MVP sem IA) implementada em `extensoes/vita-zap/`** — ainda não validada contra o
WhatsApp Web real (ver README da extensão). Versão 2.1 (19/10/2026), substitui a v1 centrada no CRM.
Decisões do dono registradas na seção 9. **17/11/2026: follow-up com IA (seção 10) implementado na extensão 0.7.54
e no servidor do CRM (`zapIa`)**, ainda não validado com o WhatsApp real nem com IA real.
Decisão do dono: começar **só no WhatsApp**, sem depender do CRM; público = contatos **já salvos
com nome e com conversa anterior**. Ligação com o CRM vem depois, por sincronização opcional.

---

## 1. Visão

Uma extensão do Chrome que vive dentro do WhatsApp Web e funciona como um assistente comercial:

- Você dá a ordem em português: *"Clientes com CLIENTE no nome, sem conversa desde 17/09:
  pergunte como estão de sal."*
- Ela encontra os contatos **nas suas próprias conversas**, monta a lista, escreve as mensagens
  (personalizadas) e conduz a campanha.
- Acompanha as respostas, classifica com IA (interessado, pediu preço, tem estoque, pediu para
  sair), sugere a resposta e lembra quem precisa de retorno.
- Guarda tudo localmente (histórico, campanhas, opt-outs) e, quando quiser, **sincroniza com o CRM**.

Princípio central: **a extensão faz todo o trabalho, você só confirma o envio** (uma tecla por
contato). Motivo na seção 6.

---

## 2. Componentes

```
┌─────────────── Chrome (seu computador) ───────────────┐
│ WhatsApp Web  ◄── content script (lê lista/conversa,   │
│                    abre chat, cola texto)              │
│ Painel lateral (side panel) — UI do Vita Zap           │
│ Service worker — fila, regras, horários                │
│ IndexedDB — contatos, campanhas, envios, opt-outs      │
└───────────────┬────────────────────────────────────────┘
                │ HTTPS (token pessoal)
        ┌───────▼─────────┐            (fase 2)
        │ Proxy de IA      │ ── Gemini (chave do dono, só no servidor)
        │ (sem banco)      │
        └───────┬─────────┘
                └──► Sync com CRM (/api/zap/sync)  ── fase 4
```

- **Extensão MV3** (TypeScript + Vite, React no painel lateral). Seletores do WhatsApp Web
  isolados em `selectors.ts`; se algum não for encontrado, a extensão **para e avisa** (falha fechada).
- **Proxy de IA**: a chave da IA **não pode ficar na extensão** (qualquer um extrai). Um endpoint
  pequeno (rota serverless no projeto Vercel existente, ou Cloudflare Worker gratuito) recebe o
  pedido com um token pessoal, chama a cadeia de IA e devolve. **Não toca no Neon** (token
  validado por variável de ambiente) — não gasta a cota do banco.
- **Armazenamento local** (IndexedDB) com exportação/importação em JSON/CSV (backup e migração).

---

## 3. Funcionalidades

### 3.1 Ordem em linguagem natural → plano estruturado
A IA converte a ordem em JSON validado (zod). Nunca executa nada sozinha.
```json
{
  "filtroNome": { "contem": ["CLIENTE"], "naoContem": ["FORNECEDOR"] },
  "ultimaConversaAntesDe": "2026-09-17",
  "ultimaConversaDepoisDe": null,
  "excluirQuemRespondeuNosUltimosDias": 14,
  "mensagemBase": "Boa tarde, {primeiroNome}, tudo bem? Como estão de sal por aí?",
  "variacoes": 3
}
```
Se faltar informação ("de quando?"), o painel pergunta em vez de adivinhar.

### 3.2 Varredura dos contatos (só leitura)
- Usa a busca do WhatsApp Web pelo termo (ex.: "CLIENTE") e lê a **lista de conversas**:
  nome salvo, data da última mensagem ("ontem", dia da semana ou dd/mm/aaaa → convertido para data).
- Elegível somente se: **contato salvo com nome** (não aparece só o número) **e** conversa existente.
- Grupos, contatos bloqueados, "Business" de terceiros e opt-outs ficam fora.
- Varredura em ritmo calmo (rolagem com pausas); resultado fica salvo localmente.

### 3.3 Prévia obrigatória
Lista com nome, última conversa, motivo de inclusão/exclusão, total, e o texto de cada um
(com as variações sorteadas). Você pode remover pessoas, editar o texto e só então **Aprovar**.

### 3.4 Execução assistida (modo "uma tecla")
1. A extensão abre a conversa do próximo contato e **cola o texto pronto** na caixa.
2. Você confere e aperta **Enter** (envio feito por você).
3. A extensão detecta que a mensagem saiu (aparece no chat), registra e, após o intervalo da
   política, **já abre o próximo** com o texto colado.
Resultado prático: ~3–5 s de atenção por contato; 30 contatos em poucos minutos.
Botões no painel: Pular, Não é cliente, Número com problema, Pausar.

### 3.5 Acompanhamento de respostas (o "pensar grande")
- Ao abrir o WhatsApp, a extensão confere as conversas da campanha que têm mensagem nova.
- A IA classifica a resposta: **interessado / pediu preço / tem estoque / vai comprar depois /
  reclamação / pediu para sair / sem relação**.
- Sugere a resposta (você edita e envia) e cria um **lembrete local** ("retornar em 7 dias").
- Pedido explícito de não receber na resposta ("não quero", "pare", "me tire da lista") →
  opt-out permanente (detecção na fase 2; a mensagem **não** traz linha "responda SAIR").
- Painel "Hoje": quem respondeu, quem pediu preço, retornos vencidos, campanhas em andamento.

### 3.6 Biblioteca e aprendizado
- Modelos de mensagem por situação (reativação, pós-venda, cobrança gentil, aviso de preço).
- Métrica por modelo: taxa de resposta e de interesse → você vê o que funciona.
- Etiquetas locais por contato (compra muito, atacado, cidade) usadas nos filtros.

### 3.7 Vários atendentes
Cada atendente instala no próprio Chrome com o próprio WhatsApp. Configuração (modelos, limites,
política) pode vir de um arquivo central; dados de cada um ficam no navegador dele até a fase 4.

---

## 4. Política de proteção (embutida, não editável abaixo do mínimo)

Reduz risco; **não garante** ausência de banimento.

| Regra | Valor inicial |
|---|---|
| Público | Só contatos salvos com nome **e** conversa anterior. Nunca número novo. |
| Teto diário de mensagens de campanha por número | **30** (configurável; nunca acima do máximo fixo no código — `TETO_DIARIO_MAXIMO`); subir aos poucos só se não houver bloqueio |
| Horário | seg–sex 08–18h, sáb 08–12h (America/Fortaleza) |
| Intervalo entre contatos | mínimo 60–120 s (ritmo de pessoa) |
| Repetição | uma mensagem por contato por campanha; não reenviar a quem foi contatado há < 14 dias |
| Texto | nome do contato, curto, **sem link e sem mídia na primeira mensagem**, variações reais |
| Saída (opt-out) | **sem** linha "responda SAIR" no texto (decisão do dono). Opt-out = botão "Não enviar mais" no painel (fase 1) + detecção de pedido explícito na resposta (fase 2). Quem está na lista nunca entra em campanha. |
| Freio | pausa a campanha se: 3 problemas seguidos (fase 1), aviso de restrição/conta, ou queda brusca de respostas (fases seguintes) |
| Número novo | número com menos de ~30 dias de uso não roda campanha |

---

## 5. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **1. MVP** | Painel lateral, varredura por termo + data, prévia, modo "uma tecla", registro local, opt-out, política da seção 4. Texto escrito por você (sem IA). | Uma campanha real de 30 contatos rodando sem erro de seletor. |
| **2. IA** | Proxy de IA; ordem em português → plano; variações de texto; classificação de respostas e sugestão. | 20 ordens reais interpretadas corretamente; classificação revisada por você numa semana. |
| **3. Gestão** | Painel "Hoje", lembretes locais, métricas por modelo, exportar CSV, configuração central para atendentes. | Uso diário por 2 semanas. |
| **4. Ligação com o CRM** | `/api/zap/sync` (token por atendente): envia contatos contatados, respostas classificadas e opt-outs; CRM cria/atualiza cliente, `last_contacted_at` e tarefa de retorno. Casamento por telefone. Lote ao fechar o dia (sem polling — cota do Neon). | Funil do CRM refletindo os contatos feitos pelo WhatsApp. |
| **5. Escala (se precisar)** | WhatsApp Business Platform oficial para campanhas grandes: número dedicado, modelos aprovados, webhook de respostas. A extensão continua como painel de atendimento. | Decisão por volume/custo. |

---

## 6. Por que "uma tecla" e não envio 100% automático

Envio automático pelo WhatsApp Web (extensão clicando sozinha, Evolution/Baileys, Claude no Chrome
disparando) **viola os Termos do WhatsApp**. O WhatsApp avalia denúncias, bloqueios e padrão de
envio; não existe intervalo "seguro". Se o número for banido, perde-se o histórico com todos os
clientes — o maior ativo comercial. Com você apertando Enter, o envio é seu, o volume é de pessoa
e a extensão continua economizando quase todo o trabalho (achar, escrever, abrir, registrar,
acompanhar). Para automação real em volume, o caminho é a API oficial (fase 5).

**A extensão não terá código que dispare o botão de enviar** — isso é coberto por teste.

---

## 7. Riscos e manutenção
- **HTML do WhatsApp Web muda**: seletores centralizados, teste de fumaça ao abrir, falha fechada.
- **Datas na lista de conversas** ("ontem", "segunda-feira", "17/09/2026"): parser testado com
  todos os formatos; em dúvida, o contato vai para "revisar" e não para a campanha.
- **Privacidade/LGPD**: dados ficam no seu computador; para a IA vai só o primeiro nome e o texto
  da mensagem quando for classificar resposta (nunca telefone). Opt-out sempre respeitado.
- **Chave de IA**: só no proxy; token pessoal revogável.

## 8. Testes mínimos
- Parser de datas da lista, filtro por nome/data, deduplicação, opt-out.
- Política: horário, teto diário, intervalo, freio.
- Teste de código-fonte: nenhum `click()`/evento de tecla no botão de enviar.
- Teste manual guiado (checklist) a cada atualização do WhatsApp Web.

## 9. Decisões

### Decididas (19/10/2026, pelo dono)
1. **Número:** o pessoal do dono, que já tem muitos contatos salvos com conversa anterior.
2. **Linha "responda SAIR": não vai.** Removida do texto e da política. O opt-out continua
   existindo como marcação manual "Não enviar mais" no painel (fase 1) e detecção de pedido
   explícito na resposta (fase 2).
3. **IA:** o dono tem chave da API **Gemini**. Fica para a **fase 2**, num proxy no servidor —
   **nunca** na extensão. Na fase 1 só existe a interface (`extensoes/vita-zap/src/shared/ia.ts`),
   desligada.
4. **Teto inicial: 30/dia**, configurável no painel, com máximo de segurança fixo no código.

### Ainda pendentes
1. Proxy de IA (fase 2) no projeto Vercel atual (simples) ou separado (Cloudflare Worker,
   isolado do CRM)?

---

## 10. Follow-up com IA (decisão do dono, 17/11/2026; extensão 0.7.54)

Pedido: *"uma IA fazer follow-up: mandei disparo de campanha, cobrar novamente quem não respondeu etc., que consiga ler
a mensagem e entender quem precisa"*. Esta seção substitui, para o follow-up, o "só uma tecla" da seção 6: **a cobrança
de quem não respondeu sai SOZINHA; todo o resto continua com humano.**

| Situação | O que acontece | Quem envia |
|---|---|---|
| **Não respondeu** há X dias (padrão 3, 1 a 30) | Entra em "Cobrança automática" com texto curto e gentil (IA; modelos locais variados se a IA estiver fora). Máximo de **2 cobranças** por contato por campanha, intervalo mínimo X dias entre elas. Depois da 2ª sem resposta: "Resolvido". | **A extensão**, pelo mesmo motor das campanhas |
| **Respondeu** e precisa de atenção (pediu preço, interessado, reclamação, vai comprar depois, pergunta, tem estoque) | Vai para "Precisa de você" com resumo de 1 frase e resposta sugerida editável. `compra_depois`/`tem_estoque` com prazo criam lembrete (9h de Fortaleza). | **Você**: "Abrir e colar" só cola o texto, você aperta Enter |
| **Respondeu** e não é comercial (só emoji, "ok") ou o atendente já respondeu depois | "Resolvido". | ninguém |
| **Pediu para sair** ("não, obrigado", "pare", "me tira da lista") | Opt-out automático ("Não enviar mais"), registrado; nunca cobra, nunca entra em campanha. | ninguém |
| **Dúvida** (grupo, nome repetido, identidade da conversa não confere, mensagem do disparo não achada, IA sem classificação válida) | "Precisa de você" com a etiqueta **revisar**. **Falha fechada: nunca cobra.** | você |

### Como funciona
1. **Fonte:** itens de campanha com status `enviado` dos últimos 21 dias (cada um vira um acompanhamento, IndexedDB `followups`).
2. **Leitura:** quando passam X dias (dias de calendário, Fortaleza) a extensão abre a conversa (identidade estrita, mesmo critério do
   envio automático; só individual) e lê as últimas mensagens. **Só leitura**: não escreve na caixa nem clica em nada além de abrir
   a conversa pela busca. Acha a **nossa mensagem** na conversa (texto exato ou hora do envio): se o cliente escreveu depois dela, respondeu.
   Cada conversa é lida no máximo 1 vez a cada 12 h (o botão "Verificar respostas agora" ignora isso e lê também disparos de 2 h para cima).
3. **IA no servidor do CRM** (`zapIa.classificarConversas`, `zapIa.gerarCobranca`; `server/routers/zapIa.ts`, `server/lib/zapIa.ts`),
   chamada só pelo service worker com a mesma sessão que a extensão já usa. Nunca na extensão; chave nunca no repositório.
4. **Envio da cobrança:** monta uma campanha de cobrança (`tipo: 'followup'`) e entrega ao **mesmo Executor**: teto diário
   compartilhado com as campanhas, horário comercial, intervalo 60–120 s, freio de 3 problemas, "Não enviar mais", número com mais de
   30 dias, conversa conferida antes do clique, marcador "em voo", painel fechado = nada é clicado. Não há outro caminho de clique
   (`tests/followup-arquitetura.test.ts`). Única diferença: o piso de 14 dias entre campanhas não vale para o follow-up (o disparo
   original é recente por definição); vale o intervalo de X dias.
5. **Leitura velha:** cobrança preparada há mais de 12 h volta a ser lida antes de enviar (o cliente pode ter respondido).

### Risco (dito ao dono e na tela, com confirmação antes de ligar)
Envio automático pelo WhatsApp Web **viola os Termos do WhatsApp** e pode levar ao bloqueio/banimento do número. Os limites reduzem o
risco; não o eliminam. A cobrança automática vem **desligada** e só liga depois de uma confirmação explícita do risco.
O painel precisa ficar aberto (a lógica roda nele): fechar ou esconder o painel pausa tudo.

### Contrato da IA (servidor)
- `zapIa.classificarConversas({ conversas: [{ ref, primeiroNome, mensagemCampanha, mensagens: [{ de: 'eu'|'cliente', texto, quando? }] }] })`,
  1 a 20 conversas (a extensão manda 10). Resposta: `{ ok: true, itens: [{ ref, classe, precisaAtencao, resumo, sugestao, lembreteDias? }], restantesHoje }`
  ou `{ ok: false, codigo: 'ia_indisponivel' | 'limite_diario', mensagem }`.
  Classes: `interessado | pediu_preco | tem_estoque | compra_depois | reclamacao | pediu_para_sair | pergunta | sem_resposta | sem_relacao`.
- `zapIa.gerarCobranca({ primeiroNome, mensagemCampanha, tentativa: 1|2 })` → `{ ok: true, texto }` ou `{ ok: false, codigo, mensagem }`.
- Saída da LLM validada com zod; item inválido vira `sem_relacao` + `precisaAtencao` ("revisar"). O código reforça o que a IA não pode decidir
  sozinha: `pediu_para_sair` nunca tem sugestão; pedido inequívoco de sair na última fala do cliente vale mesmo se a IA errar a classe;
  sugestão com link, preço, "%" ou alegação de saúde/produto (conformidade sanitária) é descartada; a IA não pode dizer "sem resposta" quando o cliente falou.
- **LGPD:** o servidor remove sequências de 8+ dígitos (telefone/CPF/CNPJ) e e-mails antes de chamar a IA; só o primeiro nome; o `ref` é
  "c1", "c2"… (nunca nome, chave ou telefone); o conteúdo das mensagens nunca é logado; texto cortado em 400 caracteres e no máximo as 12 últimas mensagens.
- **Limites:** 300 classificações e 300 cobranças por usuário por dia (contador em memória por instância serverless: é um teto de proteção, não contabilidade exata);
  lote máximo 20; temperatura 0,1 na classificação.
- **Provedores:** a cadeia existente `server/lib/llm.ts` (antigravity opcional → Groq → Cerebras → OpenRouter → NVIDIA). Variáveis (só nomes):
  `ANTIGRAVITY_BASE_URL`, `ANTIGRAVITY_API_KEY`, `ANTIGRAVITY_MODEL` (as três juntas), `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`.
  **Gemini:** o módulo fala o formato OpenAI (`POST <base>/chat/completions`, `Authorization: Bearer`). O endpoint "antigravity" do dono só funciona
  se for compatível com esse formato; **isso não foi verificado** (nome de modelo e URL ficam por conta do dono, nada foi inventado). Se não for
  compatível, a cadeia cai para o próximo provedor configurado.

### Não verificado
WhatsApp Web real (seletores de leitura da conversa, carimbo `data-pre-plain-text`, mídia do cliente), IA real (qualidade da classificação em português
real; só testada com LLM mockado), e o comportamento do número no WhatsApp depois de cobranças automáticas.

### 10.x A mensagem de cobrança é do dono (17/11/2026, extensão 0.7.55)

Pedido do dono: "eu que tenho que definir o estilo de mensagem". Os modelos genéricos deixam de ser enviados.
- **Usar os meus textos (padrão):** 1 a 10 variações para a 1ª cobrança e 0 a 10 para a 2ª, com `{nome}` opcional (primeiro nome; a mensagem é livre, 0.7.58). Contato sem primeiro nome só sorteia entre os textos sem `{nome}`, senão "escreva você". Sorteia uma por contato, sem repetir a mesma em sequência; sem IA. 2ª lista vazia = usa a da 1ª, sem repetir o que o contato já recebeu.
- **IA escreve no meu estilo:** campo "Como devo escrever" (até 500) + os textos do dono como exemplos (`zapIa.gerarCobranca` com `estilo` e `exemplos`, opcionais; chamadas antigas continuam iguais). Se a IA falhar ou o texto for recusado, sai um texto do dono, nunca um genérico.
- **Sem texto da 1ª cobrança, a cobrança automática não liga** ("Escreva sua mensagem de cobrança antes de ligar"). Config da 0.7.54 ligada vira desligada, com aviso.
- **Validação local = servidor:** `{nome}` opcional (chave que não seja exatamente `{nome}` = "marcador incompleto"), até 280 caracteres com o nome, sem link, sem "R$"/"%", sem os termos proibidos da conformidade sanitária (lista copiada do servidor; teste compara as duas).
- **Fila:** cada item guarda a assinatura da configuração (modo, textos, estilo) com que o texto foi feito; mudou a configuração, o texto é refeito ao salvar e de novo antes de montar a campanha (campanha pendente já montada é alinhada). A fila mostra "seu texto" ou "IA no seu estilo".
- Botão "Ver exemplo" (nome fictício "Maria", sem chamar a IA). Armazenamento: IndexedDB `followupConfig` (sem mudança de versão do banco).

---

## 11. Reativação por inatividade e trava de agendamento (decisão do dono, 17/11/2026; extensão 0.7.56)

Pedido: *"a versão web não puxa mais que 25/30/40 dias: os históricos antigos somem e ficam só no celular. A IA vê os clientes com 25 dias, lê a última conversa, entende se o cliente precisa agora ou de mais tempo. Se o cliente tem agendamento para 60 dias, não faz sentido entrar em campanha: o agendamento prevalece."*

### Reativação (aba "Reativação", desligada de fábrica)
- **Quem entra (etapa 1):** contatos da última varredura com a última conversa há `etapas[0]` dias ou mais (padrão 25), pelas mesmas regras de público da política (salvo com nome, individual, nunca grupo, nunca "Não enviar mais", sem campanha nos últimos 14 dias, termo "CLIENTE" no nome e sinal de mensagem minha, ambos configuráveis). Nome repetido, possível grupo e data incerta não entram sozinhos.
- **Leitura:** só leitura (`lerConversa`, identidade estrita; falha fechada → "Precisa de você"). A data real da última mensagem confirma os dias; conversa mais recente que a lista = nada a fazer.
- **Decisão da IA** (`zapIa.avaliarReativacao`, lote ≤ 20, mesma LGPD do `classificarConversas`): `precisa_agora` → mensagem do dono; `precisa_mais_tempo` / `aguardando_cliente` (7 a 120 dias) → agendamento no CRM para hoje + dias, 9h de Fortaleza, sem mensagem; `delicado` / `sem_contexto` → "Precisa de você" (a lista do Follow-up, marcada "reativação"); `pediu_para_sair` → opt-out. O código reforça: pedido inequívoco de sair vale mesmo se a IA errar; cliente que falou por último sem resposta nunca vira mensagem automática.
- **Contexto no CRM:** o resumo (1–2 frases, sem telefone/CPF) vai para as **notas do lead** (`tasks.notes`) por `zapCrm.registrarReativacao`, achado pelo vínculo ou pelo telefone lido da conversa (JID das mensagens). Não conta como contato (`contactCount`/`lastContactedAt` não mudam). O lead é criado se não existir (com lembrete só se houver agendamento). Sem tabela nem coluna nova (sem `SCHEMA_VERSION`).
- **Mensagens:** textos PRÓPRIOS por etapa, `{nome}`, modos "meus textos" / "IA no meu estilo" (0.7.55; `gerarCobranca` com `contexto: 'reativacao'`). Sem texto da etapa 1 não liga. Envio pelo MESMO Executor das campanhas (campanha `tipo: 'reativacao'`): teto diário compartilhado, horário, intervalo 60–120 s, freio, opt-out revalidado, conversa conferida antes do clique. Nenhum segundo caminho de clique.
- **Sequência:** etapas 2 e 3 (30 e 40 dias desde a última conversa real, mínimo 3 dias entre mensagens) só para quem recebeu a anterior e não respondeu. Respondeu → sai da sequência e vai para a classificação de respostas do follow-up. Depois da 3ª sem resposta (7 dias) → "Resolvido" e agendamento de nova tentativa (padrão 60 dias, configurável).
- **"Avaliar agora"** só lê/avalia (grava resumo e agendamentos no CRM), nunca envia.

### Trava de agendamento
Cliente com agendamento futuro pendente no CRM (tarefa com lembrete ligado, `status = pending`, data > agora, sem limite de antecedência) NÃO entra em reativação, campanha (Prévia e Executor) nem cobrança do follow-up. `zapCrm.agendamentosFuturos` (só leitura; mesma visibilidade de `tasks.list`) alimenta a trava, com cache de 5 min na extensão. Casamento: telefone → vínculo já gravado → nome (igual ou por palavras inteiras). Motivo "agendado para dd/MM (o agendamento prevalece)" na Prévia e nas listas. Revalidada antes de abrir cada contato no Executor. CRM indisponível/sem login/lista truncada: envio automático PAUSA sem enviar ("CRM indisponível"), reativação e cobrança não agem; campanha manual só avisa.

### Não verificado
WhatsApp Web real (telefone pelo JID: o WhatsApp de 10/2026 usa só hashes, então muitas vezes o telefone vem do índice local; sem telefone não se cria lead nem agendamento), IA real (só mockada), o servidor em produção (publicado em `main`, deploy não conferido aqui), e o efeito das mensagens automáticas no número.

## 12. Pedir à IA e Orientações para a IA (Vita Zap 0.7.57, decisão de 17/11/2026)

Pedido do dono: "colocar um local para orientar a IA também, ex.: filtre os clientes que eu mandei mensagem perguntando sobre estoque e não respondeu".

### Pedir à IA (aba própria)
- **Passo 1, `zapIa.interpretarPedido({texto, orientacoes?})`:** o pedido em português vira um plano validado (zod): `periodoDias` (1–60, padrão 30), `quemFalouPorUltimo` (`eu|cliente|tanto_faz`), `respondeu` (`true|false|null`), `assunto`, `termosNomeContato?`, `perguntas?` (quando ambíguo a IA pergunta em vez de adivinhar). Regra do código: `respondeu:false` força `quemFalouPorUltimo:'eu'`. O dono confirma/edita o plano antes de qualquer leitura. Limite do WhatsApp Web (~25–40 dias de histórico) avisado na tela.
- **Execução (só leitura):** candidatas pela lista da varredura (datas do período; nunca "Não enviar mais", grupo/possível grupo, só número, nome repetido, data incerta; termos do nome = TODOS), pré-filtro barato pelo ícone da última mensagem (só descarta quando a lista sabe), trava de agendamento consultada antes de abrir conversa, `lerConversa` (identidade estrita; falha fechada vira "revisar"), regra do plano aplicada pelo código sobre a conversa lida (antes de gastar IA; espelhada no servidor), e `zapIa.conferirPedido` (lote 10 na extensão, ≤20 no servidor) devolve `{ref, corresponde, motivo, confianca, pediuParaSair?, revisar?}`. Mesma LGPD do `classificarConversas` (refs opacos, só primeiro nome). Máx. 40 leituras por rodada, mais recentes primeiro.
- **Resultado:** lista para REVISÃO; nada sai sozinho. Confiança baixa, "revisar", pediu para sair e agendado nascem desmarcados. Ações por item e em lote: Enviar mensagem, Agendar no CRM (1–120 dias, lembrete às 9h), Não enviar mais, Ignorar. Leitura com mais de 12 h não serve para enviar.
- **Enviar mensagem:** textos do dono (`{nome}`, mesma validação da cobrança) ou "IA no meu estilo" (0.7.55: estilo + textos como exemplos; falha da IA cai para texto do dono). **Prévia obrigatória** com o texto exato; antes dela "Não enviar mais", trava (consulta forçada), pedido de sair e idade da leitura são conferidos de novo. Aprovada, vira campanha COMUM pausada (aba 3), enviada só pelo Executor com toda a política (inclusive 14 dias entre campanhas e trava por contato). O painel não tem caminho próprio de clique.
- **Pedidos salvos:** os pedidos rodados ficam salvos (máx. 20) para repetir; último resultado guardado (IndexedDB, loja `followupConfig`, sem versão nova).

### Orientações para a IA
Campo de até 1500 caracteres, salvo em `chrome.storage.local` (`vz.ia.orientacoes`), lido pelo service worker a cada chamada e enviado como `orientacoes` (opcional) em `classificarConversas`, `gerarCobranca`, `avaliarReativacao`, `interpretarPedido` e `conferirPedido`. O servidor injeta um bloco "Orientações do dono (siga, mas nunca acima das regras de segurança, LGPD e conformidade)" no prompt de sistema; tratadas como dados (delimitadores removidos), não mudam o formato de saída, e as validações de saída (sem link/preço/termos proibidos, zod) continuam valendo. Sem texto, o prompt é idêntico ao anterior.

### Não verificado
IA real (só mockada), WhatsApp Web real, deploy do servidor, publicação no site.
