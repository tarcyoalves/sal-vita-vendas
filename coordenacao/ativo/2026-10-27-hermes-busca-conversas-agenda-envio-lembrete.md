# Correção da busca de conversas, inclusão da agenda e envio humano de lembretes

- **Agente:** hermes
- **Início:** 2026-10-27 10:55 BRT
- **Fim:** 
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

1. Corrigir a inclusão de contatos da agenda na Prévia: quando `incluirSemConversa` estiver ativo (ou clicado no botão da Prévia), os contatos da agenda entram como `incluido` (não `revisar`), e a rotina Reativação ativa `incluirSemConversa` por padrão para alcançar os contatos sem conversa recente.
2. Corrigir a busca de conversas ao abrir lembrete/lead: permitir correspondência inteligente/parcial (ex: lead "D ENERGY - RIO DE JANEIRO - RJ" / termo "D ENERGY" abrir a conversa "Calixto D ENERGY Brasil...", e "GTEX - GUILHERME" abrir contato pelo telefone sem cair no fallback de recarregar a página). Permitir também clicar em contatos da agenda na lista da busca.
3. Permitir execução e envio da mensagem com padrão humano (abrir, colar, pausa humana de 2-3s e clique no botão Enviar com confirmação) para lembretes/mensagens agendadas com rascunho.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/src/shared/filtros.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`
- `extensoes/vita-zap/src/content/execucao.ts`
- `extensoes/vita-zap/src/content/abrir-por-telefone.ts`
- `extensoes/vita-zap/src/shared/abrir-por-telefone.ts`
- `extensoes/vita-zap/src/content/crm/acao-pendente.ts`
- `extensoes/vita-zap/src/sidepanel/Lembretes.tsx`
- `extensoes/vita-zap/src/shared/crm-acoes.ts`
- `extensoes/vita-zap/tests/`

**Não vou tocar em:** Loja Premium, crédito, robô VPS, schema do banco.

## Progresso

- [ ] Corrigir `filtros.ts` para que `incluirSemConversa: true` coloque contatos da agenda como `incluido` mesmo com filtro de data
- [ ] Ativar `incluirSemConversa: true` por padrão na rotina de reativação e manter checkbox marcado
- [ ] Melhorar busca por nome em `execucao.ts` e termos em `acao-pendente.ts` com match inteligente em vez de apenas estrito `===`
- [ ] Melhorar `escolherResultado` em `abrir-por-telefone.ts` para reconhecer tokens do lead e evitar reload desnecessário
- [ ] Implementar execução com envio humano para lembretes com rascunho
- [ ] Executar testes e build de validação
