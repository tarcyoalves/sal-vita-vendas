# Correção da busca de conversas, inclusão da agenda e envio humano de lembretes

- **Agente:** hermes
- **Início:** 2026-10-27 10:55 BRT
- **Fim:** 2026-10-27 11:40 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

1. Corrigir a inclusão de contatos da agenda na Prévia: quando `incluirSemConversa` for marcado (ou clicado no botão rápido da Prévia), os contatos da agenda entram como marcados na campanha, permitindo disparar para os contatos que não têm mensagens recentes no navegador.
2. Corrigir a busca de conversas ao abrir lembrete/lead: busca inteligente tolerante a títulos compostos (ex: lead "D ENERGY - RIO DE JANEIRO - RJ" / termo "D ENERGY" localiza a conversa "Calixto D ENERGY Brasil...", e "GTEX - GUILHERME" localiza "Guilherme GTEX"), evitando ambiguidade falsa e eliminando o recarregamento desnecessário da página do WhatsApp Web.
3. Implementar execução e envio da mensagem com padrão humano (abrir chat, preparar mensagem, pausa humana de 2-3s e clique automático com confirmação) para lembretes com rascunho ou ao vencer o alarme agendado.

## Arquivos tocados

- `extensoes/vita-zap/src/shared/filtros.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`
- `extensoes/vita-zap/src/content/execucao.ts`
- `extensoes/vita-zap/src/content/abrir-por-telefone.ts`
- `extensoes/vita-zap/src/shared/abrir-por-telefone.ts`
- `extensoes/vita-zap/src/content/crm/acao-pendente.ts`
- `extensoes/vita-zap/src/sidepanel/Lembretes.tsx`
- `extensoes/vita-zap/src/shared/crm-acoes.ts`
- `extensoes/vita-zap/src/shared/crm-tipos.ts`
- `extensoes/vita-zap/src/content/crm/index.ts`
- `extensoes/vita-zap/tests/`

**Não foi tocado em:** Loja Premium, crédito, robô VPS, schema do banco.

## Progresso

- [x] Corrigir `Previa.tsx` para que `incluirSemConversa: true` gere contatos da agenda marcados na prévia
- [x] Melhorar busca por nome em `execucao.ts` e termos em `acao-pendente.ts` com match inteligente em vez de apenas estrito `===`
- [x] Melhorar `escolherResultado` em `abrir-por-telefone.ts` para reconhecer tokens do lead e evitar reload desnecessário
- [x] Implementar execução com disparo humano para lembretes com rascunho (botão `Abrir e Enviar` e disparo automático ao alarme)
- [x] Executar testes e build de validação (todos os 53 testes passando e check da raiz ok)
