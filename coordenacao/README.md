# Coordenação entre IAs

**Obrigatório para qualquer agente que altere este repositório** — Hermes
(Antigravity/Gemini), Claude, Cursor, Windsurf, Kiro, Codex, ou humano usando
qualquer um deles.

Várias IAs trabalham aqui, às vezes ao mesmo tempo, e **o git é o único canal
que todas compartilham**. Sem registro, uma escreve por cima da outra — isso já
aconteceu (`HANDOFF-HERMES.md`, seção 7, caso A: o e-mail marketing do CRM foi
sobrescrito por outro agente e 59 procedures sumiram de produção).

---

## Como funciona

```
coordenacao/
├── README.md       este protocolo
├── MODELO.md       modelo para copiar
├── ativo/          o que está sendo feito AGORA — uma reivindicação por arquivo
└── registro/       o que já foi feito — histórico, uma entrada por sessão
```

**Não apague os `.gitkeep`.** O git não versiona pasta vazia: sem esse
arquivo, quando `ativo/` esvazia ela some dos clones dos outros agentes, e o
`ls coordenacao/ativo/` e o `cp` para dentro dela falham logo no primeiro passo.
(`ls` não mostra o `.gitkeep`, então ele não atrapalha a leitura.)

**Uma reivindicação por arquivo, de propósito.** Se todas as IAs editassem o
mesmo arquivo de controle, duas trabalhando juntas gerariam conflito de merge
nele. Com um arquivo por trabalho, nunca há disputa.

**Nome do arquivo:** `AAAA-MM-DD-agente-assunto.md`
- `agente`: nome curto e estável, em minúsculas — `hermes`, `claude`, `cursor`,
  `codex`, `humano-tarcyo`
- `assunto`: poucas palavras com hífen — `webhook-resend-crm`, `filtros-tarefas`

Exemplo: `coordenacao/ativo/2026-09-25-hermes-webhook-resend-crm.md`

Como o nome começa pela data, listar a pasta `registro/` já mostra tudo em
ordem cronológica.

---

## 1. ANTES de alterar qualquer coisa

```bash
git fetch origin main
git checkout main
git pull origin main
ls coordenacao/ativo/          # quem está trabalhando em quê agora
```

**Leia cada arquivo em `ativo/`.** Para cada um, compare a seção
"Arquivos e áreas" com o que você pretende tocar.

- **Sem sobreposição** → siga para o passo 2.
- **Com sobreposição** → **não toque nesses arquivos.** Escolha outra tarefa,
  ou reduza o seu escopo para fora dos arquivos dele, ou pare e pergunte ao
  dono. Nunca edite ou apague a reivindicação de outro agente.

**Leia também as entradas mais recentes de `registro/`** — o que acabou de ser
feito, e principalmente as "Armadilhas encontradas":

```bash
ls coordenacao/registro/ | tail -5
```

## 2. Reivindique — e publique ANTES de codar

```bash
cp coordenacao/MODELO.md coordenacao/ativo/AAAA-MM-DD-agente-assunto.md
# preencha: agente, início, objetivo, arquivos e áreas, branch
git add coordenacao/ativo/AAAA-MM-DD-agente-assunto.md
git commit -m "chore(coord): claim <assunto>"
git push origin main
```

**A reivindicação só vale depois do push.** Se ela ficar só na sua máquina,
nenhum outro agente a vê.

**Se o push for recusado** (`rejected` / `non-fast-forward`): outro agente
publicou antes. Isso é o protocolo funcionando.

```bash
git pull --rebase origin main
ls coordenacao/ativo/          # alguém reivindicou a mesma coisa?
```

Se alguém reivindicou os mesmos arquivos, desista da sua reivindicação
(`git rm` do seu arquivo, commit, push) e escolha outra tarefa. Se não, faça
`git push origin main` de novo.

## 3. DURANTE o trabalho

- **Fique dentro do escopo declarado.** Precisou tocar um arquivo que não
  estava listado? **Atualize a reivindicação e publique antes** de editar esse
  arquivo — e confira de novo se ele não está na reivindicação de outro.
- **Commits pequenos, push frequente.** Cada push em `main` gera deploy; isso é
  normal e esperado.
- **Sessão longa?** Marque o progresso na reivindicação e publique. Se a sua
  sessão morrer no meio, o próximo agente sabe exatamente em que estado o
  código ficou.
- **Antes de cada push**, puxe primeiro — outro agente pode ter publicado.
  **Commite antes de puxar**: o git recusa `pull --rebase` com mudança não
  commitada (`cannot pull with rebase: Your index contains uncommitted changes`).
  ```bash
  git commit -m "..."             # 1. commite
  git pull --rebase origin main   # 2. traga o que outros publicaram
  npm run check && npm test       # 3. o código de outro agente pode ter mudado o seu contexto
  git push origin main            # 4. publique
  ```

## 4. DEPOIS — conclua e registre

1. Preencha a reivindicação: status final, commits, o que verificou, o que não
   verificou, armadilhas encontradas.
2. **Mova** para o histórico (o mesmo arquivo vira o registro):
   ```bash
   git mv coordenacao/ativo/AAAA-MM-DD-agente-assunto.md coordenacao/registro/
   ```
3. Atualize o `ESTADO-DO-PROJETO.md`: o que concluiu vai para "O que está
   feito", sai das "Pendências".
4. Publique — **commite antes de puxar** (o git recusa `pull --rebase` com
   mudança não commitada):
   ```bash
   git add coordenacao/ ESTADO-DO-PROJETO.md
   git commit -m "chore(coord): finish <assunto>"
   git pull --rebase origin main
   git push origin main
   ```

**Status válidos no registro:**

| Status | Quando |
|---|---|
| `concluído` | Fez o que se propôs, está em `main` e o deploy subiu |
| `parcial` | Parte está em `main`; o resto está listado em "Pendente" |
| `interrompido` | Parou no meio — diga em que estado o código ficou |
| `abandonado` | Marcado por outro agente (ver seção 6) |

**Nunca deixe uma reivindicação esquecida em `ativo/`.** Se não vai terminar,
registre como `parcial` ou `interrompido` e mova assim mesmo. Uma reivindicação
esquecida bloqueia os arquivos para todos os outros agentes.

## 5. Trabalho em branch

Se você trabalhar numa branch em vez de `main`, **declare a branch na
reivindicação**. E ao concluir, confirme se chegou em produção:

```bash
git fetch origin main
git merge-base --is-ancestor <seu-commit> origin/main && echo "está em main"
```

Commit que ficou só na branch **não está pronto** — registre como `parcial` e
diga qual branch. Isso já enganou o dono uma vez (`HANDOFF-HERMES.md`, caso H).

## 6. Reivindicação abandonada

Se uma reivindicação em `ativo/` bloqueia o que você precisa fazer e parece
esquecida, confira a última atividade dela e dos arquivos que ela lista:

```bash
git log -1 --format="%cr — %s" -- coordenacao/ativo/<arquivo>.md
git log -1 --format="%cr — %s" -- <arquivos listados na reivindicação>
```

- **Menos de 72 horas** de atividade: está viva. Não mexa. Escolha outra tarefa
  ou pergunte ao dono.
- **Mais de 72 horas** sem nenhum commit nem no arquivo nem nos arquivos
  listados: você pode encerrá-la. Mude o status para `abandonado`, acrescente
  quem encerrou e quando, mova para `registro/`, publique — e **avise o dono no
  seu relatório**. Não apague o conteúdo: o próximo precisa saber em que estado
  o código ficou.

## 7. Conflito de merge

Se `git pull --rebase` parar com conflito:

- **Num arquivo de código que outro agente alterou:** pare. Não resolva
  escolhendo a sua versão — isso apaga o trabalho do outro, que é exatamente o
  que este protocolo existe para impedir. Leia as duas versões; se não for óbvio
  como juntar, `git rebase --abort` e pergunte ao dono.
- **No `ESTADO-DO-PROJETO.md`:** normalmente as duas mudanças valem. Mantenha as
  duas, remova só os marcadores `<<<<<<<`, `=======`, `>>>>>>>`.
- **Nunca `git push --force`** para "sair" de um conflito.

---

## Resumo de uma linha

**Puxe → leia `ativo/` → reivindique e publique → trabalhe dentro do escopo →
puxe antes de cada push → preencha, mova para `registro/`, atualize o ESTADO,
publique.**
