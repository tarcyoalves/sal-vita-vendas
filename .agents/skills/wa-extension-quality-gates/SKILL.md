---
name: wa-extension-quality-gates
description: Checklist obrigatório de qualidade, verificação e gates antes de concluir qualquer tarefa ou liberar versão da extensão Vita Zap. Testes 100% verdes, typecheck sem erros, validação de publicação, sincronização da pasta de distribuição e instruções operacionais.
---

# Quality Gates: Checklist Obrigatório para Extensões WhatsApp Web

Esta skill descreve o protocolo inegociável de validação de qualidade que **deve ser executado integralmente** antes de marcar qualquer tarefa como concluída ou realizar commits no repositório.

---

## 1. Os 6 Portões de Qualidade (Quality Gates)

Qualquer alteração na extensão deve passar rigorosamente pelos seguintes gates em sequência:

```
┌────────────────────────────────────────────────────────┐
│  Portão 1: TypeScript Check (tsc --noEmit)            │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Portão 2: Suíte Completa de Testes (vitest run)       │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Portão 3: Portão de Isolamento de Envio               │
│  (tests/envio-isolado.test.ts)                         │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Portão 4: Build de Produção (npm run build)           │
│  (dist/ + dist/content.js gerados sem aviso)          │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Portão 5: Publicação & Versionamento                  │
│  (manifest.json == package.json == extensao-id.test)   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Portão 6: Sincronização Local e Instruções Claras     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Comandos de Execução dos Portões

Execute a rotina abaixo a partir da pasta `extensoes/vita-zap/`:

```bash
# 1. Checagem de Tipos
npx tsc --noEmit

# 2. Execução da Suíte de Testes (mais de 750 testes unitários e de integração)
npx vitest run

# 3. Build Completo da Extensão
npm run build

# 4. Publicação e Criação do Pacote ZIP do CRM
npm run publicar
```

### Se houver alteração de versão:
1. Suba a versão em `public/manifest.json`.
2. Suba a versão em `package.json`.
3. Suba a versão esperada em `tests/extensao-id.test.ts`.
4. Execute `npm run publicar` para atualizar `client/public/vita-zap/vita-zap.zip` e `versao.json`.

---

## 3. Sincronização da Máquina do Usuário (Ambiente Local)

O navegador do usuário carrega a extensão desempacotada a partir da pasta:
`C:\Users\Tarcyo Alves\Downloads\vita-zap`

Sempre copie os artefatos de `dist/` para essa pasta local ao concluir alterações:
```powershell
Copy-Item -Path "extensoes\vita-zap\dist\*" -Destination "C:\Users\Tarcyo Alves\Downloads\vita-zap" -Recurse -Force
```

---

## 4. O que NUNCA fazer
- ❌ **Nunca commitar com testes falhando**.
- ❌ **Nunca desativar testes de segurança arquitetural** (`envio-isolado`, `crm-consumo`, `schema-migrations`).
- ❌ **Nunca usar `--force` no git push em `main`**.
- ❌ **Nunca declarar uma tarefa como concluída sem antes testar e verificar a saída no console**.
