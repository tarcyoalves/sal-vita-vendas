// Extração de cidade/UF de uma tarefa.
//
// Contexto: cidade e estado NÃO são colunas da tabela `tasks`. Na importação
// (parseImportLine em Tasks.tsx) eles são detectados na linha crua e gravados
// em dois lugares:
//   - `description` = "CIDADE - UF"  (formato limpo, fonte preferida)
//   - `title`       = "... - CIDADE - UF" (sufixo do título montado)
//
// Tarefas criadas manualmente podem não ter nenhum dos dois. Por isso a leitura
// é tolerante: tenta a description, cai pro título, e devolve vazio se não achar
// — nunca inventa localização.

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export interface TaskLocation {
  city: string;
  state: string;
}

const EMPTY: TaskLocation = { city: '', state: '' };

// Descarta pedaços que claramente não são nome de cidade: telefone, e-mail,
// CNPJ/CPF e qualquer coisa que comece com dígito.
function isCityLike(part: string): boolean {
  if (part.length < 2) return false;
  if (/\d/.test(part)) return false;
  if (part.includes('@')) return false;
  if (UFS.has(part.toUpperCase())) return false;
  return true;
}

function splitParts(text: string): string[] {
  return text
    .replace(/\s{2,}-\s*/g, ' - ')
    .replace(/\s*-\s{2,}/g, ' - ')
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Procura o último token que seja UF válida e usa o pedaço "cidade-like"
// imediatamente anterior como cidade.
function fromParts(parts: string[]): TaskLocation {
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].toUpperCase();
    if (!UFS.has(candidate)) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (isCityLike(parts[j])) {
        return { city: normalizeCity(parts[j]), state: candidate };
      }
    }
    return { city: '', state: candidate };
  }
  return EMPTY;
}

// Normaliza a grafia da cidade para agrupar variações do mesmo lugar
// ("Campinorte", "CAMPINORTE", "campinorte " → "CAMPINORTE").
export function normalizeCity(city: string): string {
  return city.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function extractLocation(task: {
  description?: string | null;
  title?: string | null;
}): TaskLocation {
  // 1) description no formato "CIDADE - UF" (gravado pela importação)
  const desc = (task.description ?? '').trim();
  if (desc) {
    const fromDesc = fromParts(splitParts(desc));
    if (fromDesc.state) return fromDesc;
    // description com um único token que é UF pura (sem cidade)
    if (UFS.has(desc.toUpperCase())) return { city: '', state: desc.toUpperCase() };
  }

  // 2) sufixo do título
  const title = (task.title ?? '').trim();
  if (title) return fromParts(splitParts(title));

  return EMPTY;
}

export function isValidUF(uf: string): boolean {
  return UFS.has(uf.toUpperCase());
}
