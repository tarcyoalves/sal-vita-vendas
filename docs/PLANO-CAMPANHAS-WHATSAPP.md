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
