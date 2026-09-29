# Bloquear salsalinasrn@gmail.com, endereços "salinas" e (a confirmar) domínios de empresas de sal

- **Agente:** claude
- **Início:** 2026-09-29
- **Fim:** 2026-09-29
- **Status:** concluído no código; aguardando conferir o log do deploy
- **Branch:** `main`

## Objetivo

Pedido do dono: retirar e bloquear `salsalinasrn@gmail.com`, qualquer e-mail com essa aparência e
e-mail com domínio de empresa de sal.

## Arquivos tocados

- `shared/blockedEmailDomains.ts`, `scripts/purge-blocked-emails.ts`, `tests/blocked-email-domains.test.ts`

## Resultado

- Endereço exato bloqueado; palavra `salinas` bloqueia o endereço inteiro (nome ou domínio).
- `salvitarn.com.br` é **protegido**: nunca é bloqueado nem apagado (a Sal Vita é empresa de sal).
- A limpeza do build agora imprime `RELATÓRIO domínios com "sal"` (só leitura) para o dono escolher
  quais domínios de outras empresas de sal entram em `BLOCKED_EMAIL_DOMAINS`.

## Verificado

`npm run check` 0 erros; testes e builds ok localmente.

## Não verificado / pendente

- Domínios de empresas de sal: NÃO foram inventados. Depende da lista do dono (ver relatório no log).
- Palavra `salinas` também pega quem tem "Salinas" no sobrenome.

## Atualização (dono escolheu os domínios)

Bloqueados: salmaranata.com.br, salina.com.br, finosal.com.br, sal.com, salminas.com.br,
grupososal.com.br. Mantidos de propósito: agrosal.com.br e fortsal.com.br (testes garantem que não são
pegos). Domínios de alimentos que casam "sal" por acaso (saladao, salgadinhosclick, bemmaisalimentos,
nutribrasalimentos, jimenesalimentos) também não são bloqueados.
