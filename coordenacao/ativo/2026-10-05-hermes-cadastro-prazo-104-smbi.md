# Reivindicação de trabalho

- **Agente:** Hermes
- **Início:** 2026-10-05 10:48 BRT
- **Fim:** 
- **Status:** em andamento
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
- `coordenacao/ativo/2026-10-05-hermes-cadastro-prazo-104-smbi.md`
