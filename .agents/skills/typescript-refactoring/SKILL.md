---
name: typescript-refactoring
description: Refatoração segura, tipagem estrita, modularização e prevenção de regressões em TypeScript para extensões Chrome complexas. Contratos de domínio imutáveis, funções puras isoladas de efeitos colaterais e validação em tempo de execução com Zod.
---

# TypeScript Refactoring: Segurança, Tipagem Estrita e Regressão Zero

Esta skill define as regras de engenharia de software e TypeScript para refatorar e estender código em extensões de navegador sem introduzir bugs ou quebrar contratos existentes.

---

## 1. Princípio da Separação em Três Camadas

Para manter o código modular e imune a quebras com facilidade de testes:

1. **Camada de Domínio / Regras Puras (`src/shared/`)**:
   - Funções puras, determinísticas e sem acesso a DOM, `window`, `chrome.*` ou `fetch`.
   - Exemplos: ordenação de lembretes, cálculo de dias decorridos, formatação de telefone, saneamento de termos de busca, correspondência de nomes (`mesmoNome`).
   - Cobertura de testes unitários de 100%, rodando em milissegundos sem mocks complexos.

2. **Camada de Adaptação / Infraestrutura (`src/shared/repositorio-local.ts`, `src/content/selectors.ts`)**:
   - Encapsula APIs de terceiros e do navegador.
   - Trata exceções, erros de rede e ausência de elementos no DOM, convertendo para tipos de resultado explícitos (`Result<T, E>`).

3. **Camada de Interface / Apresentação (`src/sidepanel/`, `src/content/crm/`)**:
   - Componentes React e elementos de Shadow DOM focados apenas em renderização e captura de eventos do usuário.

---

## 2. Tipagem Estrita e Modelos Imutáveis

- **Sem `any` implícito ou desnecessário**: Use `unknown` com validação de tipo (`typeof`, `instanceof`) ou esquemas Zod (`z.infer<typeof Schema>`).
- **União Discriminada (Tagged Unions)**:
```ts
export type ResultadoAbertura =
  | { ok: true; tipo: 'conversaAberta'; nome: string }
  | { ok: false; motivo: 'naoEncontrado' | 'ambiguo' | 'timeoutCabecalho'; detalhes?: string };
```
- **Readonly por padrão para coleções e configurações**:
```ts
export interface ContatoCampanha {
  readonly id: string;
  readonly nome: string;
  readonly telefone?: string;
  readonly ultimaConversaEm?: string;
}
```

---

## 3. Protocolo de Refatoração Passo a Passo

Antes de alterar qualquer arquivo crítico:
1. **Verificar os testes existentes**: Execute `npx vitest run` no módulo alvo.
2. **Adicionar teste para o caso de borda**: Se você está corrigindo um bug (ex: GTEX não abre ou termos com hífen falham), escreva o teste que reproduz o problema ANTES de alterar a função.
3. **Refatorar sem quebrar assinaturas públicas**: Mantenha parâmetros opcionais ou crie sobrecargas compatíveis com código legado que possa chamar a função.
4. **Verificação de tipos estrita**: `npx tsc --noEmit` para validar que nenhum arquivo dependente teve quebra de contrato.
