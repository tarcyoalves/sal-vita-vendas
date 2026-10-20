# Vita Zap — Fase 2: IA que lê o contexto e escreve como você

Status: **plano, nada implementado** (20/10/2026). Base: extensão 0.3.2 (varredura, prévia, envio manual
ou automático, freio, diagnóstico) + CRM com a cadeia de IA (OmniRoute/Gemini primeiro, Groq e outras de reserva).

## 1. Objetivo
1. **Ler as últimas mensagens** de cada cliente e entender o contexto antes de qualquer envio.
2. **Decidir se vale mandar** (e o quê), em vez de mandar o mesmo texto para todos.
3. **Começar a conversa de forma natural**, no seu jeito de escrever, citando o que faz sentido para
   aquele cliente — sem inventar nada.
4. **Ler as respostas** e sugerir o próximo passo.
5. Reduzir o risco de bloqueio pelo único caminho que funciona de verdade: **mensagens que o cliente
   quer receber** (relevantes, pessoais, poucas, para quem conversa com você) e **parar cedo** quando
   há sinal negativo. Não há truque técnico que "esconda" automação — e não vamos tentar.

## 2. Arquitetura
```
WhatsApp Web ──(lê conversa, só leitura)──► content script
                                              │ contexto mascarado
Painel Vita Zap ──HTTPS + token pessoal──► CRM /api/zap/ia ──► cadeia de IA (Gemini → reservas)
```
- A chave da IA fica **só na Vercel**. A extensão usa um **token pessoal** (gerado no CRM, revogável).
- A rota `/api/zap/ia` **não toca no banco** (token validado por variável de ambiente) → não acorda o Neon.
- Sem guardar conteúdo no servidor; log só de metadados (tamanho, modelo, tempo, custo estimado).

## 3. Leitura do contexto (content script, só leitura)
Para a conversa aberta, extrai as **últimas 20 mensagens** visíveis/carregadas:
- `quem`: eu (✓/✓✓) ou cliente; `quando` (data/hora do `data-pre-plain-text`); `texto` (com emoji).
- Ignora mensagens de sistema, áudio/imagem viram marcadores (`[áudio]`, `[foto]`).
- **Mascaramento antes de sair do navegador:** telefones, e-mails, CPF/CNPJ, chaves PIX e números
  longos viram `[número]`, `[email]` etc. Nome do contato vai só como **primeiro nome**.
- Se a conversa tiver poucas mensagens carregadas, rola para cima **uma vez** (com pausa) para
  tentar chegar a 20; não força carregar histórico antigo.

## 4. O que a IA faz (4 tarefas, todas com resposta em JSON validado)

### 4.1 Triagem (antes de enviar) — decide SE manda
Entrada: contexto + objetivo da campanha. Saída:
```json
{ "decisao": "enviar|nao_enviar|revisar",
  "motivo": "cliente pediu preço em 12/10 e ficou sem resposta",
  "situacao": "aguardando_nossa_resposta|cliente_sumiu|comprou_recente|reclamacao|pediu_parar|conversa_normal",
  "ultimoAssunto": "estoque de sal 25 kg",
  "risco": "baixo|medio|alto" }
```
Regras fixas (código, não IA) que mandam no resultado:
- **Pediu para parar / reclamou / xingou** → `nao_enviar` e entra em "Não enviar mais".
- **Última mensagem é do cliente sem resposta sua** → não manda campanha; vira **tarefa "responder"**
  (é a melhor oportunidade e a pior hora para mandar texto genérico).
- **Você já mandou 2 abordagens seguidas sem resposta** → `nao_enviar` por 30 dias (insistir em quem
  ignora é o que mais gera denúncia).
- **Conversa de grupo, número sem nome ou contexto vazio** → `revisar`.

### 4.2 Abertura personalizada — escreve O QUE manda
Entrada: contexto, triagem, objetivo da campanha, **seu estilo** (ver 4.4) e **fatos permitidos**
(produtos, condições e preços que VOCÊ cadastrou na extensão). Saída: 1 mensagem + 1 alternativa.
Regras (validadas por código; se falhar, usa o seu texto base):
- Curta (até ~280 caracteres), 1 pergunta no máximo, sem link, sem mídia.
- Pode citar o último assunto ("da última vez você comentou do sal 25 kg…").
- **Proibido inventar** preço, promoção, prazo, estoque ou fato que não esteja nos "fatos permitidos"
  ou na conversa. Números na mensagem só se vierem dos fatos permitidos.
- Português do seu jeito (saudação pelo horário, nome, emojis se você usa).
- Nunca se passar por outra pessoa; quem escreve é você.

### 4.3 Assistente de resposta — depois que o cliente responde
- Classifica: `interessado | pediu_preco | tem_estoque | vai_comprar_depois | reclamacao | pediu_parar | sem_relacao`.
- Extrai dados úteis (quantidade, produto, cidade, prazo) para o painel.
- Sugere a resposta (você edita e envia). **Nunca envia resposta sozinha**, mesmo no modo automático.
- `pediu_parar` → "Não enviar mais" na hora.

### 4.4 Seu estilo
Na primeira vez, a extensão separa ~30 mensagens **suas** (de várias conversas, mascaradas) e a IA
gera um "guia de estilo" curto (saudações, tamanho, emojis, expressões). Você revisa e salva. É usado
na 4.2 e na 4.3. Nada de mensagens dos clientes nesse guia.

## 5. Fluxo da campanha com IA
1. **Varredura** (igual hoje).
2. **Prévia com IA:** para cada contato, abre a conversa (só leitura), lê o contexto, roda a
   **triagem** e a **abertura**. A prévia mostra: decisão, motivo, último assunto e o texto sugerido.
   Contatos `nao_enviar`/`revisar` ficam separados com o motivo.
3. **Aprovação:** você aprova em lote ou edita um a um. **Nas primeiras 2 semanas, só lote aprovado
   por você** entra no automático (texto gerado nunca sai sem ter passado pela prévia).
4. **Envio** (manual ou automático, com todas as travas atuais). Imediatamente antes de colar, a
   extensão relê as 3 últimas mensagens: se o cliente escreveu algo novo desde a prévia, **não envia**
   e volta para revisão.
5. **Respostas:** painel "Hoje" lista quem respondeu, classificado, com resposta sugerida.

## 6. Proteções contra bloqueio (o que realmente ajuda)
| Proteção | Por quê |
|---|---|
| Só contatos salvos, com conversa de mão dupla nos últimos 12 meses (prioridade) | Quem conversa com você raramente denuncia |
| Triagem: não insistir em quem ignorou 2 vezes; não mandar para quem reclamou/pediu parar | Ignorar e denunciar é o principal sinal negativo |
| Mensagem relevante e pessoal (contexto real), não texto em massa | Reduz denúncia e aumenta resposta |
| Volume baixo e rampa: 10/dia na 1ª semana → 20 → 30 (teto) | Mudança brusca de volume é sinal de risco |
| Horário comercial, intervalos atuais, pausa longa a cada 10 | Já existe |
| **Monitor de saúde:** taxa de resposta das últimas 50; mensagens que ficam com 1 ✓ (não entregues) | Queda de resposta ou entrega → reduzir volume / pausar campanhas por 7 dias |
| Freio atual (avisos do WhatsApp, falhas de envio) | Já existe |
| Sem links/mídia na 1ª mensagem; sem pedir dados pessoais | Padrão de spam |
| Responder rápido quem respondeu (painel "Hoje") | Conversa de mão dupla melhora a reputação do número |

Limite honesto: isso **reduz** o risco no seu número pessoal; **não elimina**. Para volume maior, o
caminho continua sendo a API oficial do WhatsApp Business.

## 7. Privacidade e custo
- Sai do navegador só texto mascarado + primeiro nome. Sem telefone, sem foto, sem áudio.
- A camada gratuita da Gemini pode usar os dados para treino; o OmniRoute é seu (VPS), mas o provedor
  final é o Google. Para dados de clientes, preferir plano pago ou provedor com política de não-treino.
- Custo estimado: ~1.500–3.000 tokens por contato (triagem + abertura). 30/dia ≈ 90 mil tokens/dia —
  cabe com folga no Gemini Flash; cache por contato/dia para não pagar duas vezes.

## 8. Entregas
| Etapa | Entrega | Pronto quando |
|---|---|---|
| **2.1 Base** | Rota `/api/zap/ia` no CRM (token por atendente, sem banco), cliente na extensão, leitura de contexto + mascaramento, diagnóstico de IA | 10 conversas lidas e mascaradas corretamente (você confere no diagnóstico) |
| **2.2 Triagem** | Decisão enviar/não/revisar com motivo na prévia + regras fixas da seção 4.1 | Você concorda com ≥ 9 de 10 decisões num teste com contatos reais |
| **2.3 Abertura + estilo** | Guia de estilo, texto personalizado na prévia, validação anti-invenção, releitura antes de colar | 20 textos aprovados por você sem precisar reescrever |
| **2.4 Respostas** | Classificação, extração e resposta sugerida; painel "Hoje"; "parar" automático | Uma semana de uso real |
| **2.5 Saúde do número** | Rampa de volume, taxa de resposta, entrega (1 ✓), pausa automática por queda | Painel mostrando os indicadores |
| **2.6 CRM (opcional)** | Envia ao CRM: contatado, resposta classificada, tarefa de retorno | Funil do CRM refletindo o WhatsApp |

Cada etapa: testes automáticos + checklist no seu WhatsApp, como nas versões anteriores.

## 9. Decisões suas antes de começar
1. **Fatos permitidos:** quais produtos/condições/preços a IA pode citar (ou nenhum preço — mais seguro)?
2. **Provedor da IA para dados de clientes:** manter Gemini via OmniRoute (camada grátis?) ou usar plano pago?
3. **Rampa de volume:** aceitar 10 → 20 → 30 por semana?
4. **Regra "2 abordagens sem resposta = 30 dias sem enviar":** ok?
5. Começar pela 2.1 + 2.2 (ler e decidir, sem gerar texto ainda)?
