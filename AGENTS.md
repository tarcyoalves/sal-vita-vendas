> # ⚠️ PARE — LEIA `HANDOFF-HERMES.md` PRIMEIRO
>
> Este repositório tem **dois produtos distintos** (CRM de Lembretes e loja
> Premium) no mesmo código, e regras de conformidade sanitária que já foram
> violadas por IA antes.
>
> **Ordem de leitura antes de escrever qualquer linha de código:**
>
> 1. `HANDOFF-HERMES.md` — regras invioláveis, arquitetura verificada, fluxo de
>    trabalho, os portões de qualidade e **os erros reais já cometidos por IA
>    neste repositório** (seção 7). Obrigatório.
> 2. `ESTADO-DO-PROJETO.md` — estado atual, pendências e a **seção 4 de
>    conformidade sanitária**, obrigatória antes de escrever qualquer texto que o
>    cliente leia.
> 3. `CLAUDE.md` — convenções de código.
>
> **Regras que não admitem exceção:**
>
> - Deploy é `git push origin main` (a Vercel publica sozinha). Nunca
>   `git push --force` em `main`.
> - Antes de todo commit: `npm run check && npm test` e ler `git diff --stat`.
> - O repositório é **público**: nunca escreva token, senha ou chave em arquivo.
> - Feature nova vai em arquivo novo e namespace novo — nunca sobrescreva um
>   arquivo existente para outra finalidade.
> - Nunca invente dado técnico, regulatório ou financeiro.

<!-- code-review-graph MCP tools -->
## Ferramentas MCP: code-review-graph (se disponíveis)

**Só se o seu ambiente tiver o servidor MCP `code-review-graph` conectado.**
Se as ferramentas abaixo não aparecerem na sua lista de ferramentas, ignore esta
seção inteira e use as ferramentas normais de busca e leitura de arquivos. Não
tente chamar uma ferramenta que você não tem.

Quando disponível, o grafo dá contexto estrutural (quem chama, quem depende,
cobertura de teste) mais barato que ler arquivo por arquivo:

| Ferramenta | Use quando |
|---|---|
| `semantic_search_nodes` | Encontrar funções/classes por nome ou palavra-chave |
| `query_graph` | Rastrear quem chama, o que importa, testes de um símbolo |
| `get_impact_radius` | Entender o alcance de uma mudança |
| `get_affected_flows` | Ver quais caminhos de execução uma mudança afeta |
| `detect_changes` + `get_review_context` | Revisar uma alteração |
| `get_architecture_overview` | Visão geral da estrutura |
| `refactor_tool` | Planejar renomeação, achar código morto |

Mesmo com o grafo, **antes de apagar qualquer arquivo, confirme com `grep`
quem o importa** — um "órfão" já foi apagado aqui e era dependência de outro
arquivo (ver `HANDOFF-HERMES.md`, seção 7, caso J).
