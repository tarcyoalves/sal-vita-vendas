# Importador do Radar de Cargas (base aberta de CNPJ da Receita)

Preenche a tabela `radar_establishments` do CRM (banco `DATABASE_URL`, Neon) a partir
dos arquivos abertos de CNPJ que a Receita Federal publica. Roda **na VPS do dono**,
por fora da Vercel, uma vez por mês — não existe API gratuita que liste empresas por
CNAE e cidade (ver `PLANO-RADAR-CARGAS.md`, item 2 da tabela de correções).

## Onde baixar

Confira o caminho atual no portal de dados abertos do CNPJ antes de baixar — a URL
abaixo é a que se acredita correta em 2026-09, mas a Receita já mudou esse endereço
antes:

```
https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/AAAA-MM/
```

Baixe e descompacte:

- `Estabelecimentos0.zip` até `Estabelecimentos9.zip` (10 arquivos)
- `Empresas0.zip` até `Empresas9.zip` (10 arquivos)

Você **não precisa** dos outros arquivos do pacote (Sócios, Simples, CNAEs, Municípios,
Naturezas, Qualificações, Motivos) — o importador só lê Estabelecimentos e Empresas.

**Espaço em disco:** a base completa descompactada passa de 15 GB. Baixe e
descompacte num disco com espaço de sobra; depois de rodar o importador, os arquivos
`.zip` e os `.ESTABELE`/`.EMPRECSV` podem ser apagados (o resultado já está no banco).

## O que o script faz

1. **Passo 1** — lê todos os arquivos `...ESTABELE` linha a linha (streaming, sem
   carregar em memória) e mantém só quem: está com situação cadastral **ativa**, tem UF
   dentro do `--ufs` pedido, e tem CNAE principal ou secundário em `RADAR_ALL_CNAES`
   (`shared/radar.ts`).
2. **Passo 2** — lê os arquivos `...EMPRECSV` e completa razão social e porte dos CNPJs
   básicos coletados no passo 1. Quem não aparece em Empresas fica com o nome fantasia
   (ou "NÃO INFORMADO") no lugar da razão social.
3. Imprime um resumo (linhas por UF, por segmento, descartes por motivo, tamanho
   estimado em MB) e, se não for `--dry-run`, grava no banco em lotes (upsert por
   `cnpj`) e depois **apaga** da tabela quem é das UFs importadas mas ficou de fora
   desta leva (`source_release` diferente — empresa fechou, mudou de CNAE, ou saiu do
   raio pesquisado).

A lógica de parsing e filtro (com testes) está em
`server/lib/radar/receitaParse.ts`; este script só cuida de ler arquivo, CLI e banco.

## Comandos

Sempre rode primeiro com `--dry-run` para conferir os números antes de gravar:

```bash
cd sal-vita-vendas
npx tsx scripts/radar/import-receita.ts --dir /caminho/para/receita-2026-09 --ufs PR,SC,RS --release 2026-09 --dry-run
```

Conferido o resumo, rode de verdade (sem `--dry-run`):

```bash
npx tsx scripts/radar/import-receita.ts --dir /caminho/para/receita-2026-09 --ufs PR,SC,RS --release 2026-09
```

Também aceita arquivos explícitos em vez de `--dir` (útil para testar com um só
arquivo dos dez):

```bash
npx tsx scripts/radar/import-receita.ts \
  /caminho/K3241.K03200Y0.D40913.ESTABELE \
  /caminho/K3241.K03200Y0.D40913.EMPRECSV \
  --ufs PR --release 2026-09 --dry-run
```

### Opções

| Opção | Obrigatória | Para quê |
|---|---|---|
| `--dir <pasta>` | sim (ou arquivos explícitos) | pasta com os arquivos descompactados; o script pega os que têm `ESTABELE` ou `EMPRECSV` no nome |
| `--ufs PR,SC,RS` | sim | UFs a importar — comece pequeno, o Neon free tier é 512 MB para o CRM inteiro |
| `--release 2026-09` | sim | mês da base, grava em `source_release` |
| `--dry-run` | não | só mostra o resumo, não grava nada |
| `--max-mb 150` | não (padrão 150) | o script recusa gravar se a estimativa de tamanho passar disso |
| `--force-size` | não | grava mesmo passando de `--max-mb` |

### Proteções

- **Não roda a limpeza se o passo 1 não achou nada.** Se `--dir` estiver errado (pasta
  vazia, ou arquivos de outro layout), o script para antes de apagar o que já existia
  no banco para aquelas UFs.
- **Recusa gravar se a estimativa de tamanho passar de `--max-mb`.** Avisa antes de
  estourar o banco compartilhado com o resto do CRM.

## `DATABASE_URL` na VPS

O script lê `DATABASE_URL` só do ambiente — nunca coloque a connection string num
arquivo deste repositório (ele é **público**). Na VPS, uma forma simples:

```bash
# uma vez, fora do repositório git (ex.: /root/.env-radar, permissão 600)
echo 'DATABASE_URL=postgres://...' > ~/.env-radar
chmod 600 ~/.env-radar

# ao rodar
set -a; source ~/.env-radar; set +a
npx tsx scripts/radar/import-receita.ts --dir ... --ufs PR,SC,RS --release 2026-09
```

(O script também lê um `.env` na raiz do repositório, se existir, via `dotenv` — mas
esse `.env` já está no `.gitignore`; não confie só nisso na VPS, prefira um arquivo
fora do repositório como acima.)

## Cron mensal sugerido

A Receita publica a base nos primeiros dias do mês. Um cron simples (ajuste o caminho
e o mês/UFs):

```cron
# todo dia 5 às 3h da manhã, hora do servidor
0 3 5 * * cd /caminho/para/sal-vita-vendas && set -a && source ~/.env-radar && set +a && npx tsx scripts/radar/import-receita.ts --dir /caminho/para/receita-mais-recente --ufs PR,SC,RS --release "$(date +\%Y-\%m)" >> /var/log/radar-import.log 2>&1
```

Ajuste manualmente `--dir` para a pasta do mês baixado (o script não baixa nada
sozinho) e confira o log antes de considerar rodado.

## LGPD

- Só ficam no banco estabelecimentos **ativos** e cujo CNAE está na lista de segmentos
  compradores de sal (`shared/radar.ts`) — não é uma cópia da base inteira.
- MEI e empresário individual são pessoas físicas; ainda assim o dado gravado é o
  mesmo que a Receita já publica como aberto (CNPJ, endereço comercial, telefone e
  e-mail informados ao Cadastro Nacional).
- Cada linha registra `source_release` (mês da base) — dá para saber a origem e a
  idade do dado.
- As exclusões que o CRM já respeita (`task_deletion_logs` por CNPJ/telefone,
  `email_suppressions`) são cruzadas **na hora da busca** pelo router
  `prospectingRadar` (não aqui no importador) — quem pediu para não ser contatado
  continua marcado mesmo depois de uma nova importação.
- O envio de mensagem é sempre manual (link `wa.me` que o atendente clica) — este
  importador nunca dispara nada, só alimenta uma lista para o atendente escolher.
