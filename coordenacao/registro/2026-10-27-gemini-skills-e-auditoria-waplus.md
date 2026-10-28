# Auditoria da extensão Vita Zap e Criação das Agent Skills especializadas (WAPlus style)

- **Agente:** hermes (Gemini / Antigravity)
- **Início:** 2026-10-27 12:05 BRT
- **Fim:** 2026-10-28 11:22 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Auditar a arquitetura real da extensão Vita Zap (`extensoes/vita-zap/`), identificar ferramentas instaladas no Antigravity e criar as 6 Agent Skills especializadas em `.agents/skills/` (whatsapp-web-dom, chrome-extension-architecture, playwright-extension-testing, typescript-refactoring, extension-security-audit, wa-extension-quality-gates) com YAML válido e documentação detalhada. Em seguida, aplicar as boas práticas dessas skills para sanar os problemas de busca/abertura de conversa e exibição de contatos da agenda na prévia.

## Arquivos e áreas que vou tocar

- `.agents/skills/whatsapp-web-dom/SKILL.md`
- `.agents/skills/chrome-extension-architecture/SKILL.md`
- `.agents/skills/playwright-extension-testing/SKILL.md`
- `.agents/skills/typescript-refactoring/SKILL.md`
- `.agents/skills/extension-security-audit/SKILL.md`
- `.agents/skills/wa-extension-quality-gates/SKILL.md`
- `extensoes/vita-zap/src/content/` (correção pontual de busca e abertura)
- `extensoes/vita-zap/src/sidepanel/` (melhoria de prévia)
- `extensoes/vita-zap/src/shared/`

**Não vou tocar em:**
- Loja Premium
- Robô VPS
- Schema do banco / migrações do CRM

## Progresso

- [x] Auditoria da arquitetura real do projeto (Manifest V3, Vite + TS + React no sidepanel, Vanilla TS em Shadow DOM no content script)
- [x] Verificação de skills oficiais no Antigravity (modern-web-guidance e chrome-extensions já presentes no catálogo global)
- [x] Criação das 6 Agent Skills em `.agents/skills/` (whatsapp-web-dom, chrome-extension-architecture, playwright-extension-testing, typescript-refactoring, extension-security-audit, wa-extension-quality-gates)
- [x] Correção da abertura por busca sem recarregar a página e conferência flexível de cabeçalho
- [x] Correção e destaque para inclusão em 1 clique dos contatos da agenda na prévia
- [x] Execução de todos os 53 arquivos de teste (754 testes passando, 0 falhas)
- [x] Typecheck (`tsc --noEmit`) 100% limpo
- [x] Build e publicação (`npm run publicar`) para v0.7.34
- [x] Correção do canal de transporte de etiquetas do CRM: inclusão de `catalogoTags` em `METODOS_LEADS` para o content script carregar as etiquetas reais do CRM via `tags.list`
- [x] Cache resiliente de tags no CRM e auto-inclusão de tags adicionadas pelo atendente
- [x] Atualização de reatividade de tags no sidepanel (`Previa.tsx`)
- [x] Todos os 756 testes unitários e E2E passando com 100% de sucesso
- [x] Sincronização automática da versão 0.7.34 nas 5 pastas de distribuição
- [x] Correção do design do painel lateral (sem quebra de linhas nas abas `Acompanhar` e `1. Varredura`, badges e cards elegantes)
- [x] Implementação de segurança de bloqueio total (Frosted Glass / Vidro Embaçado) em `extensoes/vita-zap/src/content/crm/bloqueio-tela.ts` e no painel lateral
- [x] Tela do WhatsApp Web 100% desfocada (`backdrop-filter: blur(24px)`) até autenticação no CRM com sessão ou credenciais
- [x] Adição da suíte de testes `tests/crm-bloqueio-tela.test.ts` (8 testes cobrindo render, desbloqueio, credenciais e lifecycle)
- [x] 100% dos testes verdes (54 arquivos de teste, 764 testes passando com zero falhas)
- [x] Typecheck (`tsc --noEmit`) 100% limpo
- [x] Build e publicação (`npm run publicar`) para v0.7.36
- [x] Sincronização da v0.7.36 em todas as 5 pastas de distribuição do Windows
- [x] Correção de classificação de chat individual no envio automático (suporte a nomes CRM com "Cliente", "-" e agenda com 0 mensagens prévias sem disparar falso "revisar")
- [x] Re-execução com 100% dos testes verdes (54 arquivos de teste, 766 testes passando com zero falhas)
- [x] Atualização uniforme de versão para v0.7.36 em todos os locais (manifest, package, README, versao.json, ESTADO-DO-PROJETO.md)
