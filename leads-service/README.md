# Sal Vita Leads — Serviço de triagem de leads via WhatsApp

Serviço que roda 24 horas por dia na VPS Oracle, recebe mensagens de leads pelo WhatsApp
(via Evolution API), responde com IA, e permite que um humano assuma a conversa quando necessário.

Este é o início do projeto (Fase 0): apenas a base rodando, conectada ao banco, com uma
rota de verificação de saúde (`/health`). As próximas fases vão adicionar o webhook,
as respostas automáticas da IA, a detecção de handoff e o painel da equipe.

## Pré-requisitos na VPS Oracle

- Node.js 20+ instalado
- PM2 instalado globalmente: `npm install -g pm2`

## Passo a passo para instalar e rodar

1. **Copiar os arquivos para a VPS** (pasta `leads-service/`).

2. **Instalar as dependências:**
   ```bash
   cd leads-service
   npm install
   ```

3. **Criar o arquivo `.env`** copiando o exemplo:
   ```bash
   cp .env.example .env
   ```
   Depois abra o `.env` e preencha:
   - `DATABASE_URL`: a string de conexão do banco Neon Postgres (pode ser um banco novo, dedicado a este projeto)
   - `WA_SERVER_URL` e `WA_API_KEY`: endereço e chave da Evolution API já instalada na VPS
   - `WEBHOOK_SECRET`: invente uma frase longa e aleatória (vai ser usada para validar que os avisos vêm mesmo da Evolution)
   - `GEMINI_API_KEY` / `GROQ_API_KEY`: as mesmas chaves de IA usadas no sistema principal

4. **Criar as tabelas no banco** (roda automaticamente também ao iniciar o serviço, mas dá pra rodar manualmente para conferir):
   ```bash
   npm run db:migrate
   ```

5. **Rodar uma vez para testar (modo desenvolvimento):**
   ```bash
   npm run dev
   ```
   Acesse `http://IP-DA-VPS:3100/health` (ou a porta que você definiu no `.env`).
   Se aparecer `{"ok":true,"service":"sal-vita-leads"}`, está funcionando.

6. **Colocar para rodar 24h por dia com o PM2** (gerenciador que mantém o serviço ligado e reinicia sozinho se cair):
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```
   Para conferir se está rodando:
   ```bash
   pm2 status
   ```
   Deve aparecer `sal-vita-leads` com status `online`.

   Para ver os logs (mensagens que o serviço vai imprimindo):
   ```bash
   pm2 logs sal-vita-leads
   ```

## Como saber que a Fase 0 funcionou

- `pm2 status` mostra o serviço como `online`
- Acessar `http://IP-DA-VPS:PORTA/health` retorna `{"ok": true, ...}`
- No painel do Neon (banco escolhido), aparecem as 5 tabelas: `leads`, `conversations`,
  `messages`, `handoff_events`, `webhook_log`

## Próximas fases (visão geral)

1. **Fase 1** — receber mensagens do WhatsApp via webhook da Evolution API e salvar no banco
2. **Fase 2** — IA responde automaticamente e qualifica o lead (tipo de interesse, região, volume)
3. **Fase 3** — detecção de quando a conversa precisa de um humano (handoff)
4. **Fase 4** — painel web para a equipe visualizar leads e conversas
5. **Fase 5** — equipe assume/devolve o controle da conversa + notificações
6. **Fase 6** — robustez: evitar mensagens duplicadas, limitar velocidade de envio (proteger o número de WhatsApp contra bloqueio)
