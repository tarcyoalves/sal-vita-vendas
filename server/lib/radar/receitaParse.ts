// Parsing da base aberta de CNPJ da Receita Federal, para o importador do Radar de
// Cargas (`scripts/radar/import-receita.ts`). Funções puras, sem I/O e sem dependência
// externa, de propósito: `scripts/` não entra no `tsconfig` (ver comentário lá), então a
// lógica que precisa ser tipada e testada por `npm test` mora aqui.
//
// Formato oficial (layout da Receita): ISO-8859-1 (latin1), separador `;`, todo campo
// entre aspas duplas, aspas literais dentro do campo aparecem dobradas (`""`), sem
// cabeçalho. Ver PLANO-RADAR-CARGAS.md e a descrição de colunas na tarefa que gerou
// este arquivo.
import { RADAR_ALL_CNAES } from '../../../shared/radar';
import { municipioBySiafi } from './geo';

// ── CSV quotado da Receita ──────────────────────────────────────────────────────────

/** Remove um `\r` final (arquivo com quebra de linha CRLF). */
function stripTrailingCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/**
 * Faz o parsing de uma linha no formato da Receita: campos entre aspas duplas,
 * separados por `;`, com `""` representando uma aspa literal dentro do campo.
 * Tolera campos sem aspas (defensivo — não é o formato oficial, mas alguns exports
 * "corrigidos" na internet vêm assim).
 */
export function parseReceitaLine(rawLine: string): string[] {
  const line = stripTrailingCr(rawLine);
  const fields: string[] = [];
  const len = line.length;
  let i = 0;

  while (i <= len) {
    if (line[i] === '"') {
      i++;
      let value = '';
      while (i < len) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // aspas de fechamento
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
    } else {
      const start = i;
      while (i < len && line[i] !== ';') i++;
      fields.push(line.slice(start, i));
    }

    if (line[i] === ';') {
      i++;
      continue;
    }
    break;
  }

  return fields;
}

/**
 * Pré-filtro barato: os arquivos da Receita somam dezenas de GB, e a imensa maioria
 * das linhas não interessa (CNAE fora da lista). Testar se a linha crua contém algum
 * dos CNAEs-alvo (7 dígitos, sem pontuação — aparecem assim tanto no campo principal
 * quanto no secundário) evita fazer o parsing completo (aspas, `;`) da maior parte do
 * arquivo. É deliberadamente "generoso": pode aceitar linha que o parser completo
 * depois rejeita (por UF, situação etc.), mas nunca rejeita uma que o parser aceitaria,
 * porque o CNAE-alvo sempre aparece como substring da linha quando é o valor do campo.
 */
export function lineMightMatchCnaes(rawLine: string, targetCnaes: readonly string[] = RADAR_ALL_CNAES): boolean {
  for (const cnae of targetCnaes) {
    if (rawLine.includes(cnae)) return true;
  }
  return false;
}

/**
 * Extrai só o primeiro campo de uma linha quotada, sem fazer o parsing completo.
 * Usado no passo 2 (EMPRECSV) para descartar rapidamente empresas cujo CNPJ básico
 * não está entre os que o passo 1 coletou — a maioria da base de Empresas.
 */
export function extractFirstQuotedField(rawLine: string): string {
  const line = stripTrailingCr(rawLine);
  if (line[0] !== '"') {
    const end = line.indexOf(';');
    return end === -1 ? line : line.slice(0, end);
  }
  const end = line.indexOf('"', 1);
  return end === -1 ? line.slice(1) : line.slice(1, end);
}

// ── Normalização de campos ──────────────────────────────────────────────────────────

function onlyDigits(s: string | undefined | null): string {
  return (s ?? '').replace(/\D/g, '');
}

/** DDD + número, só dígitos. `null` se o resultado tiver menos de 10 dígitos. */
export function buildPhone(ddd: string | undefined | null, numero: string | undefined | null): string | null {
  const digits = onlyDigits(ddd) + onlyDigits(numero);
  return digits.length >= 10 ? digits : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + minúsculas; `null` se não tiver cara de e-mail. */
export function normalizeEmail(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

/** `YYYYMMDD` → `YYYY-MM-DD`. `null` para `0`, `00000000`, vazio ou mês/dia zerado. */
export function normalizeDate(raw: string | undefined | null): string | null {
  const d = (raw ?? '').trim();
  if (!d || d === '0' || !/^\d{8}$/.test(d)) return null;
  const year = d.slice(0, 4);
  const month = d.slice(4, 6);
  const day = d.slice(6, 8);
  if (month === '00' || day === '00') return null;
  return `${year}-${month}-${day}`;
}

/**
 * Endereço legível numa linha só, a partir de tipo de logradouro, logradouro, número,
 * complemento e bairro. Campos vazios são pulados. `null` se não sobrar nada.
 */
export function buildEndereco(
  tipoLogradouro: string | undefined | null,
  logradouro: string | undefined | null,
  numero: string | undefined | null,
  complemento: string | undefined | null,
  bairro: string | undefined | null,
): string | null {
  const tipo = (tipoLogradouro ?? '').trim();
  const log = (logradouro ?? '').trim();
  const num = (numero ?? '').trim();
  const comp = (complemento ?? '').trim();
  const bai = (bairro ?? '').trim();

  const logradouroCompleto = [tipo, log].filter(Boolean).join(' ').trim();
  const pieces: string[] = [];
  if (logradouroCompleto) pieces.push(num ? `${logradouroCompleto}, ${num}` : logradouroCompleto);
  else if (num) pieces.push(num);
  if (comp) pieces.push(comp);

  let result = pieces.join(', ');
  if (bai) result = result ? `${result} - ${bai}` : bai;
  return result || null;
}

/**
 * CNAEs-alvo presentes no estabelecimento (principal + lista de secundários separada
 * por vírgula), na ordem: principal primeiro (se for alvo), depois secundários, sem
 * repetir.
 */
export function computeCnaesAlvo(
  cnaePrincipal: string,
  cnaeSecundariaRaw: string | undefined | null,
  targetCnaes: readonly string[] = RADAR_ALL_CNAES,
): string[] {
  const targetSet = new Set(targetCnaes);
  const secundarias = (cnaeSecundariaRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const cnae of [cnaePrincipal.trim(), ...secundarias]) {
    if (targetSet.has(cnae) && !seen.has(cnae)) {
      seen.add(cnae);
      result.push(cnae);
    }
  }
  return result;
}

// ── ESTABELECIMENTOS ────────────────────────────────────────────────────────────────

/** Exatamente as colunas de `radar_establishments` que vêm do arquivo ESTABELE (sem
 * `razaoSocial`/`porte`, que só existem no arquivo EMPRESAS, e sem `sourceRelease`/
 * `importedAt`, preenchidos pelo importador). */
export interface EstabelecimentoRow {
  cnpjBasico: string; // 8 dígitos — chave para casar com EMPRESAS
  cnpj: string; // 14 dígitos
  cnaePrincipal: string;
  cnaesAlvo: string[];
  municipioIbge: number;
  uf: string;
  endereco: string | null;
  cep: string | null;
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  dataInicio: string | null;
  nomeFantasia: string | null;
}

export type EstabelecimentoSkipReason =
  | 'campos_insuficientes'
  | 'situacao'
  | 'uf'
  | 'cnae'
  | 'siafi_nao_mapeado';

export type EstabelecimentoParseResult =
  | { ok: true; row: EstabelecimentoRow }
  | { ok: false; reason: EstabelecimentoSkipReason };

const SITUACAO_ATIVA = '02';
const ESTABELECIMENTO_MIN_FIELDS = 28; // os 2 últimos campos (situação especial) podem faltar em exports antigos

/**
 * Faz o parsing de uma linha de ESTABELECIMENTOS já dividida em campos (ver
 * `parseReceitaLine`). Mantém só quem está com situação cadastral ativa (`02`), cuja UF
 * está no conjunto pedido, e cujo CNAE principal ou algum secundário está em
 * `targetCnaes`. Descarta (e diz por quê) quem não bate no código SIAFI de nenhum
 * município conhecido.
 */
export function parseEstabelecimento(
  fields: readonly string[],
  opts: { ufs: ReadonlySet<string>; targetCnaes?: readonly string[] },
): EstabelecimentoParseResult {
  if (fields.length < ESTABELECIMENTO_MIN_FIELDS) return { ok: false, reason: 'campos_insuficientes' };

  const situacao = (fields[5] ?? '').trim();
  if (situacao !== SITUACAO_ATIVA) return { ok: false, reason: 'situacao' };

  const uf = (fields[19] ?? '').trim().toUpperCase();
  if (!opts.ufs.has(uf)) return { ok: false, reason: 'uf' };

  const cnaePrincipal = (fields[11] ?? '').trim();
  const cnaesAlvo = computeCnaesAlvo(cnaePrincipal, fields[12], opts.targetCnaes);
  if (cnaesAlvo.length === 0) return { ok: false, reason: 'cnae' };

  const siafi = (fields[20] ?? '').trim();
  const municipio = municipioBySiafi(siafi);
  if (!municipio) return { ok: false, reason: 'siafi_nao_mapeado' };

  const cnpjBasico = (fields[0] ?? '').trim().padStart(8, '0');
  const cnpjOrdem = (fields[1] ?? '').trim().padStart(4, '0');
  const cnpjDv = (fields[2] ?? '').trim().padStart(2, '0');

  return {
    ok: true,
    row: {
      cnpjBasico,
      cnpj: `${cnpjBasico}${cnpjOrdem}${cnpjDv}`,
      cnaePrincipal,
      cnaesAlvo,
      municipioIbge: municipio.ibge,
      uf,
      endereco: buildEndereco(fields[13], fields[14], fields[15], fields[16], fields[17]),
      cep: onlyDigits(fields[18]) || null,
      telefone1: buildPhone(fields[21], fields[22]),
      telefone2: buildPhone(fields[23], fields[24]),
      email: normalizeEmail(fields[27]),
      dataInicio: normalizeDate(fields[10]),
      nomeFantasia: (fields[4] ?? '').trim() || null,
    },
  };
}

// ── EMPRESAS ─────────────────────────────────────────────────────────────────────────

export interface EmpresaRow {
  cnpjBasico: string; // 8 dígitos
  razaoSocial: string;
  porte: string | null; // "00" não informado, "01" ME, "03" EPP, "05" demais
}

const EMPRESA_MIN_FIELDS = 6;

export function parseEmpresa(fields: readonly string[]): EmpresaRow | null {
  if (fields.length < EMPRESA_MIN_FIELDS) return null;
  const cnpjBasico = (fields[0] ?? '').trim().padStart(8, '0');
  const razaoSocial = (fields[1] ?? '').trim();
  if (!cnpjBasico || !razaoSocial) return null;
  return {
    cnpjBasico,
    razaoSocial,
    porte: (fields[5] ?? '').trim() || null,
  };
}

// ── Passo 1 (ESTABELE) e passo 2 (EMPRECSV), como acumuladores linha a linha ────────
//
// Expostos como "acumuladores" (um `addLine` chamado por linha) em vez de função que
// recebe um iterável pronto: assim o importador real chama `addLine` dentro do loop
// `for await` do `readline` (streaming, sem carregar o arquivo inteiro em memória) e o
// teste chama o mesmo `addLine` sobre um array de linhas fixas — a lógica de filtro e
// contagem é a mesma nos dois casos.

export interface Pass1Stats {
  linesScanned: number;
  candidateLines: number; // passaram no pré-filtro de CNAE
  kept: number;
  skipped: Record<EstabelecimentoSkipReason, number>;
}

export interface Pass1Accumulator {
  addLine: (rawLine: string) => void;
  /** Estabelecimentos mantidos, por CNPJ completo (14 dígitos). */
  rows: Map<string, EstabelecimentoRow>;
  /** CNPJs básicos (8 dígitos) distintos entre os mantidos — para filtrar o passo 2. */
  cnpjBasicos: Set<string>;
  stats: Pass1Stats;
}

export function createPass1Accumulator(opts: {
  ufs: ReadonlySet<string>;
  targetCnaes?: readonly string[];
}): Pass1Accumulator {
  const rows = new Map<string, EstabelecimentoRow>();
  const cnpjBasicos = new Set<string>();
  const stats: Pass1Stats = {
    linesScanned: 0,
    candidateLines: 0,
    kept: 0,
    skipped: {
      campos_insuficientes: 0,
      situacao: 0,
      uf: 0,
      cnae: 0,
      siafi_nao_mapeado: 0,
    },
  };

  function addLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line) return;
    stats.linesScanned++;

    if (!lineMightMatchCnaes(line, opts.targetCnaes)) return;
    stats.candidateLines++;

    const fields = parseReceitaLine(line);
    const result = parseEstabelecimento(fields, opts);
    if (!result.ok) {
      stats.skipped[result.reason]++;
      return;
    }

    rows.set(result.row.cnpj, result.row);
    cnpjBasicos.add(result.row.cnpjBasico);
    stats.kept++;
  }

  return { addLine, rows, cnpjBasicos, stats };
}

export interface Pass2Stats {
  linesScanned: number;
  matched: number;
}

export interface Pass2Accumulator {
  addLine: (rawLine: string) => void;
  /** Empresa por CNPJ básico, só para os básicos que o passo 1 pediu. */
  empresasByBasico: Map<string, EmpresaRow>;
  stats: Pass2Stats;
}

export function createPass2Accumulator(cnpjBasicos: ReadonlySet<string>): Pass2Accumulator {
  const empresasByBasico = new Map<string, EmpresaRow>();
  const stats: Pass2Stats = { linesScanned: 0, matched: 0 };

  function addLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line) return;
    stats.linesScanned++;

    if (cnpjBasicos.size === 0) return;
    const basico = extractFirstQuotedField(line).trim().padStart(8, '0');
    if (!cnpjBasicos.has(basico)) return;

    const fields = parseReceitaLine(line);
    const empresa = parseEmpresa(fields);
    if (empresa) {
      empresasByBasico.set(empresa.cnpjBasico, empresa);
      stats.matched++;
    }
  }

  return { addLine, empresasByBasico, stats };
}

/** Exatamente as colunas de `radar_establishments` (menos `sourceRelease`/`importedAt`,
 * que o importador preenche na hora de gravar). */
export interface RadarEstablishmentRow extends EstabelecimentoRow {
  razaoSocial: string;
  porte: string | null;
}

/**
 * Junta o resultado do passo 1 (estabelecimentos) com o do passo 2 (empresas). Quem não
 * tem correspondência em EMPRESAS (arquivo incompleto, ou básico baixado depois) usa o
 * nome fantasia como razão social, ou "NÃO INFORMADO" se nem isso tiver.
 */
export function mergeEstabelecimentosComEmpresas(
  rows: ReadonlyMap<string, EstabelecimentoRow>,
  empresasByBasico: ReadonlyMap<string, EmpresaRow>,
): { rows: RadarEstablishmentRow[]; semEmpresa: number } {
  const result: RadarEstablishmentRow[] = [];
  let semEmpresa = 0;

  for (const row of rows.values()) {
    const empresa = empresasByBasico.get(row.cnpjBasico);
    if (empresa) {
      result.push({ ...row, razaoSocial: empresa.razaoSocial, porte: empresa.porte });
    } else {
      semEmpresa++;
      result.push({ ...row, razaoSocial: row.nomeFantasia ?? 'NÃO INFORMADO', porte: null });
    }
  }

  return { rows: result, semEmpresa };
}
