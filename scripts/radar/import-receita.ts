// Importador offline da base aberta de CNPJ da Receita Federal para `radar_establishments`.
// Roda na VPS do dono, uma vez por mês, contra arquivos já baixados e descompactados.
// Ver `scripts/radar/README.md` para o passo a passo e `PLANO-RADAR-CARGAS.md` para o
// porquê. A lógica de parsing/filtro fica em `server/lib/radar/receitaParse.ts` (testada
// por `tests/radar-import.test.ts`) — este arquivo só cuida de I/O, CLI e banco.
//
// Uso:
//   npx tsx scripts/radar/import-receita.ts --dir ./receita-2026-09 --ufs PR,SC,RS --release 2026-09 --dry-run
//   npx tsx scripts/radar/import-receita.ts --dir ./receita-2026-09 --ufs PR,SC,RS --release 2026-09
//
// Também aceita arquivos explícitos em vez de --dir:
//   npx tsx scripts/radar/import-receita.ts K3241.K03200Y0.D40913.ESTABELE K3241.K03200Y0.D40913.EMPRECSV --ufs PR --release 2026-09
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

import { and, inArray, ne, sql } from 'drizzle-orm';

import {
  createPass1Accumulator,
  createPass2Accumulator,
  mergeEstabelecimentosComEmpresas,
  type RadarEstablishmentRow,
} from '../../server/lib/radar/receitaParse';
import { radarEstablishments } from '../../server/db/schema';
import { segmentsForCnaes } from '../../shared/radar';

interface Args {
  dir: string | undefined;
  explicitFiles: string[];
  ufs: string[];
  release: string;
  dryRun: boolean;
  maxMb: number;
  forceSize: boolean;
}

function parseArgs(argv: string[]): Args {
  const explicitFiles: string[] = [];
  let dir: string | undefined;
  let ufsRaw: string | undefined;
  let release: string | undefined;
  let dryRun = false;
  let maxMb = 150;
  let forceSize = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dir':
        dir = argv[++i];
        break;
      case '--ufs':
        ufsRaw = argv[++i];
        break;
      case '--release':
        release = argv[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--max-mb':
        maxMb = Number(argv[++i]);
        break;
      case '--force-size':
        forceSize = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Argumento desconhecido: ${arg}`);
        }
        explicitFiles.push(arg);
    }
  }

  if (!dir && explicitFiles.length === 0) {
    throw new Error('Informe --dir <pasta> (com os arquivos descompactados) ou os caminhos dos arquivos.');
  }
  const ufs = (ufsRaw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (ufs.length === 0) {
    throw new Error('Informe --ufs, ex.: --ufs PR,SC,RS');
  }
  if (!release || !/^\d{4}-\d{2}$/.test(release)) {
    throw new Error('Informe --release no formato AAAA-MM, ex.: --release 2026-09');
  }
  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    throw new Error('--max-mb precisa ser um número positivo.');
  }

  return { dir, explicitFiles, ufs, release, dryRun, maxMb, forceSize };
}

/** Classifica arquivos pelo nome, como a Receita nomeia os arquivos dentro dos zips
 * (`...ESTABELE`, `...EMPRECSV`) — não assume a numeração (`Estabelecimentos0..9`). */
async function resolveFiles(args: Args): Promise<{ estabelecimentos: string[]; empresas: string[] }> {
  const candidates = [...args.explicitFiles];
  if (args.dir) {
    const entries = await readdir(args.dir);
    for (const name of entries) candidates.push(path.join(args.dir, name));
  }

  const estabelecimentos: string[] = [];
  const empresas: string[] = [];
  for (const file of candidates) {
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) continue;
    const base = path.basename(file).toUpperCase();
    if (base.includes('ESTABELE')) estabelecimentos.push(file);
    else if (base.includes('EMPRECSV')) empresas.push(file);
  }
  return { estabelecimentos, empresas };
}

async function forEachLine(filePath: string, onLine: (line: string) => void): Promise<void> {
  const stream = createReadStream(filePath, { encoding: 'latin1' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    onLine(line);
  }
}

function byteLen(s: string | null | undefined): number {
  return s ? Buffer.byteLength(s, 'utf8') : 0;
}

/**
 * Estimativa grosseira do espaço que as linhas vão ocupar no Postgres: soma os bytes
 * dos campos de texto (o que mais pesa) mais uma sobrecarga fixa por linha (tupla,
 * índices, colunas numéricas/timestamp, MVCC). Não é exata — serve só para decidir se
 * vale a pena checar antes de gravar centenas de milhares de linhas num banco de 512 MB
 * (Neon free tier, compartilhado com o resto do CRM).
 */
const PER_ROW_OVERHEAD_BYTES = 150;

function estimateSizeMb(rows: readonly RadarEstablishmentRow[]): number {
  let bytes = 0;
  for (const r of rows) {
    bytes += PER_ROW_OVERHEAD_BYTES;
    bytes +=
      byteLen(r.cnpj) +
      byteLen(r.razaoSocial) +
      byteLen(r.nomeFantasia) +
      byteLen(r.cnaePrincipal) +
      r.cnaesAlvo.reduce((sum, c) => sum + byteLen(c), 0) +
      byteLen(r.endereco) +
      byteLen(r.cep) +
      byteLen(r.telefone1) +
      byteLen(r.telefone2) +
      byteLen(r.email) +
      byteLen(r.porte) +
      byteLen(r.dataInicio) +
      byteLen(r.uf);
  }
  return bytes / (1024 * 1024);
}

const BATCH_SIZE = 500;

async function writeToDatabase(rows: RadarEstablishmentRow[], release: string, ufs: readonly string[]): Promise<void> {
  // Import dinâmico de propósito: `server/db/index.ts` lê `DATABASE_URL` assim que é
  // carregado. Um import estático quebraria `--dry-run` sem a variável definida.
  const { db } = await import('../../server/db');

  console.log(`Gravando ${rows.length} linha(s) em lotes de ${BATCH_SIZE}...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      cnpj: r.cnpj,
      razaoSocial: r.razaoSocial,
      nomeFantasia: r.nomeFantasia,
      cnaePrincipal: r.cnaePrincipal,
      cnaesAlvo: r.cnaesAlvo,
      municipioIbge: r.municipioIbge,
      uf: r.uf,
      endereco: r.endereco,
      cep: r.cep,
      telefone1: r.telefone1,
      telefone2: r.telefone2,
      email: r.email,
      porte: r.porte,
      dataInicio: r.dataInicio,
      sourceRelease: release,
    }));

    // Upsert multi-linha parametrizado: `excluded.<coluna>` refere a linha da própria
    // inserção que colidiu — é o jeito padrão do Postgres/Drizzle de fazer upsert em
    // lote (um `set` com valor fixo aplicaria a MESMA linha para todo mundo do lote).
    await db
      .insert(radarEstablishments)
      .values(batch)
      .onConflictDoUpdate({
        target: radarEstablishments.cnpj,
        set: {
          razaoSocial: sql`excluded.razao_social`,
          nomeFantasia: sql`excluded.nome_fantasia`,
          cnaePrincipal: sql`excluded.cnae_principal`,
          cnaesAlvo: sql`excluded.cnaes_alvo`,
          municipioIbge: sql`excluded.municipio_ibge`,
          uf: sql`excluded.uf`,
          endereco: sql`excluded.endereco`,
          cep: sql`excluded.cep`,
          telefone1: sql`excluded.telefone1`,
          telefone2: sql`excluded.telefone2`,
          email: sql`excluded.email`,
          porte: sql`excluded.porte`,
          dataInicio: sql`excluded.data_inicio`,
          sourceRelease: sql`excluded.source_release`,
          importedAt: sql`now()`,
        },
      });

    console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }

  console.log('Removendo registros antigos das UFs importadas (empresa fechou, saiu do CNAE, ou a base mudou)...');
  await db
    .delete(radarEstablishments)
    .where(and(inArray(radarEstablishments.uf, [...ufs]), ne(radarEstablishments.sourceRelease, release)));
  console.log('Limpeza concluída.');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { estabelecimentos, empresas } = await resolveFiles(args);

  if (estabelecimentos.length === 0) {
    throw new Error('Nenhum arquivo ESTABELE encontrado (nome deve conter "ESTABELE").');
  }
  if (empresas.length === 0) {
    console.warn('Aviso: nenhum arquivo EMPRECSV encontrado (nome deve conter "EMPRECSV") — razão social ficará "NÃO INFORMADO" ou o nome fantasia.');
  }

  console.log(`Estabelecimentos: ${estabelecimentos.length} arquivo(s).`);
  console.log(`Empresas: ${empresas.length} arquivo(s).`);
  console.log(`UFs: ${args.ufs.join(', ')} · Release: ${args.release}${args.dryRun ? ' · --dry-run' : ''}`);

  const ufsSet = new Set(args.ufs);
  const pass1 = createPass1Accumulator({ ufs: ufsSet });
  for (const file of estabelecimentos) {
    console.log(`Lendo ${file}...`);
    await forEachLine(file, pass1.addLine);
  }

  console.log('--- Resumo do passo 1 (estabelecimentos) ---');
  console.log(`Linhas lidas: ${pass1.stats.linesScanned.toLocaleString('pt-BR')}`);
  console.log(`Candidatas ao pré-filtro de CNAE: ${pass1.stats.candidateLines.toLocaleString('pt-BR')}`);
  console.log(`Mantidas: ${pass1.stats.kept.toLocaleString('pt-BR')}`);
  console.log('Descartadas por motivo:', pass1.stats.skipped);

  const pass2 = createPass2Accumulator(pass1.cnpjBasicos);
  for (const file of empresas) {
    console.log(`Lendo ${file}...`);
    await forEachLine(file, pass2.addLine);
  }

  console.log('--- Resumo do passo 2 (empresas) ---');
  console.log(`Linhas lidas: ${pass2.stats.linesScanned.toLocaleString('pt-BR')}`);
  console.log(`CNPJs básicos casados: ${pass2.stats.matched.toLocaleString('pt-BR')} de ${pass1.cnpjBasicos.size.toLocaleString('pt-BR')}`);

  const { rows, semEmpresa } = mergeEstabelecimentosComEmpresas(pass1.rows, pass2.empresasByBasico);
  if (semEmpresa > 0) {
    console.log(`Sem correspondência em Empresas (razão social = nome fantasia ou "NÃO INFORMADO"): ${semEmpresa.toLocaleString('pt-BR')}`);
  }

  const porUf = new Map<string, number>();
  const porSegmento = new Map<string, number>();
  for (const row of rows) {
    porUf.set(row.uf, (porUf.get(row.uf) ?? 0) + 1);
    for (const seg of segmentsForCnaes(row.cnaesAlvo)) {
      porSegmento.set(seg, (porSegmento.get(seg) ?? 0) + 1);
    }
  }
  console.log('--- Resultado final ---');
  console.log(`Total de estabelecimentos: ${rows.length.toLocaleString('pt-BR')}`);
  console.log('Por UF:', Object.fromEntries(porUf));
  console.log('Por segmento:', Object.fromEntries(porSegmento));

  const estimatedMb = estimateSizeMb(rows);
  console.log(`Tamanho estimado no banco: ~${estimatedMb.toFixed(1)} MB (estimativa grosseira — ver comentário em ${path.basename(__filename)}).`);

  if (args.dryRun) {
    console.log('--dry-run: nada foi gravado no banco. Rode sem essa flag para gravar de verdade.');
    return;
  }

  if (rows.length === 0) {
    throw new Error(
      'Nenhuma linha sobrou depois dos filtros — abortando ANTES de gravar, para não rodar a limpeza de UF ' +
        'e apagar tudo que já estava no banco (proteção contra --dir errado ou UF sem CNAE-alvo).',
    );
  }

  if (estimatedMb > args.maxMb && !args.forceSize) {
    throw new Error(
      `Tamanho estimado (${estimatedMb.toFixed(1)} MB) passa de --max-mb (${args.maxMb} MB). ` +
        'Confira se as UFs/CNAEs estão certos, ou rode de novo com --force-size para gravar mesmo assim.',
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não está definida no ambiente. Veja scripts/radar/README.md.');
  }

  await writeToDatabase(rows, args.release, args.ufs);
  console.log('Importação concluída.');
}

main().catch((err) => {
  console.error('Erro:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
