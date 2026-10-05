# Reivindicação de trabalho

- **Agente:** Hermes
- **Início:** 2026-10-05 10:48 BRT
- **Fim:** 2026-10-05 11:03 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Cadastrar a condição de pagamento no CRM Lembretes vinculada ao ERP SMBI:
- Código SMBI: `104`
- Descrição: `15/25 DIAS`
- Parcelas: `2`

Atualizar o catálogo compartilhado (`shared/smbiCondicoes.ts`), a documentação de integração e a suíte de testes unitários para garantir que o dropdown de pedidos e a API do robô SMBI reconheçam a nova condição automaticamente.

## Arquivos e áreas que vou tocar

- `shared/smbiCondicoes.ts`
- `tests/smbi-condicoes.test.ts`
- `docs/INTEGRACAO-SMBI.md`
- `coordenacao/registro/2026-10-05-hermes-cadastro-prazo-104-smbi.md`

## Verificação e Resultados

- Adicionada condição `{ cod: '104', descricao: '15/25 DIAS', parcelas: 2 }` ao catálogo oficial `SMBI_CONDICOES_PAGAMENTO`.
- `condicaoPorTexto` reconhece variações como `'15/25'`, `'15/25 DIAS'` e `'15/25 dias'` mapeando automaticamente para o ID SMBI `104`.
- Frontend (`OrderDialog.tsx`) passa a exibir a opção no dropdown de sal e frete.
- Backend (`server/lib/smbi.ts`) vincula automaticamente ao payload do SMBI.
- Testes unitários (`vitest run tests/smbi-condicoes.test.ts`): 24/24 testes aprovados.
- Checagem estática (`npm run check` / `tsc --noEmit`): 0 erros.
