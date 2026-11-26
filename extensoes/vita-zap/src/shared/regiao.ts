// Região de um contato: UF (2 letras) ou DDD (2 dígitos). Módulo puro: a tabela UF → DDDs do Brasil, a leitura do campo
// "Região" da Prévia e o DDD de um telefone já normalizado (55 + DDD + número, com ou sem o 9º dígito).

/** UF → DDDs (tabela da Anatel). Cada DDD pertence a uma só UF. */
export const DDDS_POR_UF: Readonly<Record<string, readonly string[]>> = {
  AC: ['68'],
  AL: ['82'],
  AM: ['92', '97'],
  AP: ['96'],
  BA: ['71', '73', '74', '75', '77'],
  CE: ['85', '88'],
  DF: ['61'],
  ES: ['27', '28'],
  GO: ['62', '64'],
  MA: ['98', '99'],
  MG: ['31', '32', '33', '34', '35', '37', '38'],
  MS: ['67'],
  MT: ['65', '66'],
  PA: ['91', '93', '94'],
  PB: ['83'],
  PE: ['81', '87'],
  PI: ['86', '89'],
  PR: ['41', '42', '43', '44', '45', '46'],
  RJ: ['21', '22', '24'],
  RN: ['84'],
  RO: ['69'],
  RR: ['95'],
  RS: ['51', '53', '54', '55'],
  SC: ['47', '48', '49'],
  SE: ['79'],
  SP: ['11', '12', '13', '14', '15', '16', '17', '18', '19'],
  TO: ['63'],
};

export const UFS_BRASIL: ReadonlySet<string> = new Set(Object.keys(DDDS_POR_UF));
export const DDDS_BRASIL: ReadonlySet<string> = new Set(Object.values(DDDS_POR_UF).flat());

export function ddsDaUf(uf: string): readonly string[] {
  return DDDS_POR_UF[uf.trim().toUpperCase()] ?? [];
}

export interface RegiaoLida {
  /** UFs válidas, em maiúsculas, sem repetir. */
  ufs: string[];
  /** DDDs válidos (2 dígitos), sem repetir. */
  ddds: string[];
  /** Um texto por item que não é UF nem DDD do Brasil (nunca ignorado em silêncio). */
  erros: string[];
}

/** "PR, 41, 45" → UFs e DDDs. Separadores: vírgula, ponto e vírgula, quebra de linha ou espaço; "(45)" vale como 45. */
export function lerRegiao(texto: string | readonly string[] | null | undefined): RegiaoLida {
  const itens = (Array.isArray(texto) ? texto.join(',') : (texto ?? '')).toString().split(/[,;\s]+/);
  const saida: RegiaoLida = { ufs: [], ddds: [], erros: [] };
  for (const bruto of itens) {
    const item = bruto.replace(/[()]/g, '').trim().toUpperCase();
    if (item === '') continue;
    if (/^[A-Z]{2}$/.test(item) && UFS_BRASIL.has(item)) {
      if (!saida.ufs.includes(item)) saida.ufs.push(item);
    } else if (/^\d{2}$/.test(item) && DDDS_BRASIL.has(item)) {
      if (!saida.ddds.includes(item)) saida.ddds.push(item);
    } else {
      saida.erros.push(`"${bruto.trim()}" não é UF nem DDD do Brasil`);
    }
  }
  return saida;
}

export const regiaoVazia = (r: RegiaoLida): boolean => r.ufs.length === 0 && r.ddds.length === 0;

/** Acrescenta ao texto do campo os DDDs da UF (sem repetir os que já estão). */
export function incluirDddsDaUf(texto: string, uf: string): string {
  const lida = lerRegiao(texto);
  const novos = ddsDaUf(uf).filter((d) => !lida.ddds.includes(d));
  if (novos.length === 0) return texto;
  const base = texto.trim().replace(/[,;\s]+$/, '');
  return base === '' ? novos.join(', ') : `${base}, ${novos.join(', ')}`;
}

/**
 * DDD de um telefone normalizado (55 + DDD + número). Telefone de fora do Brasil ou fora do formato → null.
 * Com ou sem o 9º dígito o DDD é o mesmo (posições 2-3).
 */
export function dddDoTelefone(telefone: string | null | undefined): string | null {
  const m = /^55(\d{2})\d{8,9}$/.exec(telefone ?? '');
  return m && DDDS_BRASIL.has(m[1]) ? m[1] : null;
}
