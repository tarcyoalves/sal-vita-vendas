# Vita Zap v0.7.27: correção dos marcadores de rotinas e filtros de data da última conversa na prévia

- **Agente:** hermes
- **Início:** 2026-10-26 16:20 BRT
- **Fim:** 2026-10-26 16:38 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Corrigir problemas relatados pelo dono na versão 0.7.26:
1. Validação de marcadores: aceitar `{primeiro_nome}` e `{primeiroNome}` nas campanhas e rotinas rápidas sem dar erro "marcador desconhecido".
2. Filtros de data na prévia: contatos com conversa antiga (ex: antes de 10/09 ou 30d+) entram como `incluido`, não ficando bloqueados em "revisar" por `soMinha`.
3. Desativar `soMinha` por padrão (default `false`) na tela de prévia.
4. Quando houver filtro de data ativo (`usaData`), contatos da agenda sem conversa anterior não entram como `incluido`.
5. A prévia mantém e exibe com clareza a data da última conversa de cada chat no card.
6. A contagem das rotinas rápidas considera o termo do filtro e reflete os contatos elegíveis.

## Arquivos e áreas tocados

- `extensoes/vita-zap/src/shared/constantes.ts`
- `extensoes/vita-zap/src/shared/texto.ts`
- `extensoes/vita-zap/src/shared/filtros.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`
- `extensoes/vita-zap/tests/texto.test.ts`
- `client/public/vita-zap/` (publicação 0.7.27)
- `coordenacao/`
- `ESTADO-DO-PROJETO.md`
