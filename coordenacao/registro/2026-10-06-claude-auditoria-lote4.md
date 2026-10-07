# Auditoria do CRM — Lote 4 (regressões, segurança 2ª rodada, mobile 3ª passada)

- **Quem:** Claude (arquiteto) com 3 agentes Sonnet · **Início:** 2026-10-06
- **4A backend:** api/index.ts, server/** (trpc, auth, routers, lib, db/migrate só se indicado), client/src/components/ActiveTimer.tsx
  (só o batimento da sessão), docs/MIGRACAO-INDICES-UNICOS.md (novo), scripts/db/* (novos, NÃO executados), tests/
- **4B1 e-mail marketing:** client/src/pages/EmailMarketing.tsx
- **4B2 frontend restante:** client/src/** exceto EmailMarketing.tsx e ActiveTimer.tsx
- Hermes: não tocar nestes arquivos até o registro.

## Concluído (Lote 4)
- 11e7678 (frontend): confirmação antes de 'Criar e Enviar'; cartões no celular (itens do pedido, relatório,
  campanhas, contatos); confirm()/prompt() viraram diálogos (useConfirm único); painel de filtros em folha;
  dvh; alvos 40px; WhatsApp/Ligar na linha da tarefa; Buscador na barra do atendente.
- Backend: horas não zeram mais (heartbeat de 5 min + reserva min(fim do dia, início+meta/8h)); sessão esquecida
  não aparece como ativa; purge de sessões 400 dias (SCHEMA_VERSION 2026-10-07a); espelho SMBI devolve
  espelhoProtegido (tela avisa e recarrega); etiqueta paga retoma generate/print; login de inativo diz 'Conta
  desativada'; CSRF (POST /api/trpc exige JSON, recusa cross-site/origem fora da lista); limiter por IP no login;
  pedido novo de atendente com itens/comissão do catálogo e taskId próprio; carrinho público valida nome/e-mail e
  1 cadência por telefone a cada 30 dias; JWT revogável por 'pv' (tokens antigos valem até 2026-10-13);
  criar tarefa valida responsável; descarte 'não contatar' só staff; seed/update-admin recusam produção.
- docs/MIGRACAO-INDICES-UNICOS.md + scripts/db/indices-unicos/*.sql: NADA executado (decisão do dono).
- Testes: 590. Gates: check, vitest, build:client, build:api.

## Lote 5 (revisão final das regressões do Lote 4)
- Heartbeat só vale para sessão do dia ou com sinal < 15 min (não ressuscita sessão esquecida).
- Pedido de atendente: preço/quantidade do vendedor mantidos (regra do dono: ajuste de sal x frete);
  do catálogo/gravado vêm só comissaoFixaPct e isentoFrete, por item; resposta `itensAjustados` avisa a tela.
- IA e 'Meu progresso' usam a mesma conta de horas do servidor; descarte 'não contatar' oculto para atendente;
  carrinho público aceita nomes de empresa com números/&; tarefa criada com telefone nas anotações já ganha `phone`.
- Testes: 599.
