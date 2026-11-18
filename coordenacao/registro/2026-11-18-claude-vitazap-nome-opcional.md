# Vita Zap 0.7.58: {nome} opcional nos textos do dono

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** 2026-11-18
- **Status:** parcial (servidor em `main`; extensão só na branch, site ainda na 0.7.46)
- **Branch:** `claude/magical-fermi-wrdxjy` (servidor também em `main`)

## Objetivo

Pedido do dono: a mensagem é livre, o marcador {nome} não pode ser obrigatório (cobrança do follow-up, reativação, Pedir à IA).
Contato sem primeiro nome só vai para "escreva você" se o texto escolhido usa {nome}.

## Arquivos e áreas que vou tocar

- `server/lib/zapIa.ts`, `tests/zap-ia.test.ts`
- `extensoes/vita-zap/` (followup-estilo, followup, followup-motor, pedido-motor, reativacao-motor, editores, testes, README, versão 0.7.58)

## Progresso

- [x] servidor em main
- [x] extensão, testes, zip (sem `npm run publicar`)

## Resultado

`{nome}` deixou de ser obrigatório (validação, IA, motores). Chave quebrada vira "marcador incompleto". Contato sem nome: sorteia entre textos sem `{nome}`, senão "escreva você".

## Armadilhas encontradas

- `paraModelo` injetava "Oi, {nome}!" quando a IA não usava o nome: removido.
- O `usar_nome` é calculado dos exemplos CRUS (antes de trocar `{nome}` pelo nome real).
- `tests/publicacao.test.ts` falha por design até `npm run publicar` (versão do zip publicado).
