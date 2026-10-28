---
name: code-reviewer
description: Revisão multidimensional de código com quality gates obrigatórios em 5 eixos fundamentais (correção lógica, legibilidade, integridade arquitetural, segurança e performance).
metadata:
  author: addyosmani
  version: "1.0.0"
---

# Code Reviewer Skill

Revisão técnica multidimensional inspirada nos padrões de engenharia de software sênior. Avalia alterações de código através de 5 quality gates antes de qualquer homologação ou merge.

## Os 5 Eixos de Revisão (Quality Gates)

1. **Eixo 1: Correção Lógica e Casos de Borda**:
   - O código resolve exatamente o problema sem efeitos colaterais ocultos?
   - Valores nulos/undefined, arrays vazios, divisões por zero e timeouts foram tratados defensivamente?
   - O fluxo de estados (loading, error, success, empty) está completo e consistente?

2. **Eixo 2: Legibilidade e Manutenibilidade**:
   - Nomes de variáveis, funções e componentes revelam explicitamente sua intenção.
   - Funções são pequenas e respeitam o princípio de responsabilidade única (SRP).
   - Ausência de código duplicado, números mágicos ou aninhamentos profundos (early return pattern).

3. **Eixo 3: Integridade Arquitetural e Convenções**:
   - O código respeita os limites de contexto do projeto (ex.: nunca misturar produtos distintos no mesmo repositório).
   - O gerenciamento de estado e fluxo de dados segue a arquitetura estabelecida (ex.: tRPC, TanStack Query, Drizzle).
   - Não há acoplamentos impróprios entre camadas de apresentação e persistência.

4. **Eixo 4: Segurança e Validação de Entrada**:
   - Todas as entradas externas (URL params, formulários, webhooks, headers) são validadas com schemas (ex.: Zod).
   - Proteção contra OWASP Top 10 (SQL Injection, XSS, CSRF, bypass de autenticação/autorização, IDOR).
   - Não há segredos, chaves de API ou credenciais expostas no cliente ou versionadas em código.

5. **Eixo 5: Performance e Eficiência**:
   - Não há consultas N+1 ao banco de dados ou re-renderizações desnecessárias no React.
   - Operações assíncronas concorrentes usam `Promise.all` quando apropriado.
   - Bundle size sob controle: imports seletivos, sem bibliotecas duplicadas ou pacotes desnecessários.

## Formato do Relatório de Revisão

Ao executar a auditoria de código, estruture a saída em:
- **Resumo Geral**: Veredito (Aprovado / Mudanças Solicitadas / Bloqueante).
- **Achados Críticos (Blockers)**: Problemas funcionais, de segurança ou violação de regras que impedem o deploy.
- **Sugestões de Refatoração (Improvements)**: Otimizações de legibilidade, performance ou manutenibilidade.
- **Diff Sugerido**: Código corrigido pronto para aplicação.
