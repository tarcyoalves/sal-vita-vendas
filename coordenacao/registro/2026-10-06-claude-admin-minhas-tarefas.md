# Tarefas: admin abre só com as próprias tarefas (admin = atendente, sem distinção)

- **Quem:** Claude · **Quando:** 2026-10-06
- Pedido do dono: admin e "Tarcyo" são a mesma pessoa; ao entrar em Tarefas ver só
  as dele, como atendente; "todos" só se escolher no filtro.
- `client/src/lib/myTasks.ts` (novo): identidade = nome da conta + atendente(s) com
  o mesmo userId ou e-mail; `isMine` (atribuída a mim, ou sem responsável e criada
  por mim); `applyAssigneeFilter`; `otherAttendantNames` (sem repetir "eu").
- `Tasks.tsx`: filtro "Responsável" abre em "Minhas tarefas" (antes "Todos"); o
  dropdown não lista mais admin e atendente como duas pessoas; aviso "Mostrando só
  as suas tarefas (N de M) · ver de todos os atendentes"; "Limpar tudo" volta a
  "Minhas tarefas". Servidor inalterado (a lista completa continua vindo, o recorte
  é no cliente).
- Não mexi nos recursos exclusivos de atendente (meta diária, sessão de trabalho).
- Testes: tests/my-tasks.test.ts (+6). Gates: check ok, 420 testes.

## Complemento (mesmo dia): nome duplicado nos menus de designar
- Print do dono: "Tarcyo Alves" aparecia 2x no menu "Atendente..." (designação em lote).
  Mesmo padrão em 3 menus de Tasks.tsx (lote, importação CSV, modal "Designar para"):
  conta admin + registro de atendente homônimo.
- `assignableNames` (myTasks.ts): eu uma vez só (nome do meu atendente, senão o da
  conta) + os outros sem repetir. Os 3 menus usam essa lista.
- Testes: 422.
