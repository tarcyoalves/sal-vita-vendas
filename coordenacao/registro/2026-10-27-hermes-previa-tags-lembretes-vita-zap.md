# Correções na Prévia, Tags do CRM, Respostas Rápidas e Lembretes (Vita Zap)

- **Agente:** hermes
- **Início:** 2026-10-27 09:50 BRT
- **Fim:** 2026-10-27 10:25 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Corrigir a visualização e inclusão de contatos na Prévia do Vita Zap (motivos detalhados de exclusão sempre visíveis com contagens exatas, suporte a contatos da agenda sem data recente quando a opção de incluir agenda estiver marcada com filtro de data, botão para inclusão em lote dos contatos da agenda), sincronizar catálogo de tags reais do CRM na Prévia e no painel de lead sem dados estáticos mockados, notificação em tela (toast no WhatsApp Web) para lembretes agendados e feedback de persistência nas respostas rápidas.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/src/shared/filtros.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`
- `extensoes/vita-zap/src/content/crm/painel-lead.ts`
- `extensoes/vita-zap/src/content/crm/painel-respostas.ts`
- `extensoes/vita-zap/src/background/lembretes.ts`
- `extensoes/vita-zap/src/content/crm/index.ts`
- `extensoes/vita-zap/tests/`

**Não vou tocar em:** Loja Premium, crédito, robô VPS, schema do banco.

## Progresso

- [x] Corrigir `filtros.ts` para permitir contatos da agenda sem data quando `incluirSemConversa` estiver ativo com filtro de data
- [x] Exibir breakdown completo de motivos de exclusão na Prévia (mesmo quando houver contatos incluídos) com botões de ação rápida
- [x] Sincronizar catálogo de tags do CRM em `Previa.tsx` e remover fallback mockado de produtos em `painel-lead.ts`
- [x] Adicionar notificação em aba do WhatsApp Web para disparos de lembretes
- [x] Adicionar confirmação visual ao salvar resposta rápida
- [x] Criar testes unitários para os cenários e validar build
