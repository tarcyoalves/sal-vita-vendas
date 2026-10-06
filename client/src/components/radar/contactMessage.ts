// Radar de Cargas — mensagem padrão de contato, gerada no cliente quando o
// atendente ainda não pediu "Gerar mensagem" (IA). Curta, neutra, sem preço
// nem alegação de produto — só o suficiente para abrir a conversa.
//
// Cada atendente pode ter o próprio modelo (salvo no servidor). Campos entre
// chaves: {saudacao} (bom dia/boa tarde/boa noite pela hora), {nome},
// {regiao} ("para a região de X") e {sacos}.

export const DEFAULT_CONTACT_TEMPLATE =
  'Olá, {saudacao}! Aqui é {nome} da empresa Sal Vita de Mossoró-RN, tudo bem? ' +
  'Temos uma carreta indo {regiao} com espaço para {sacos} sacos de 25 kg. Posso te passar um orçamento?';

export const CONTACT_TEMPLATE_MAX = 1000;

export const CONTACT_TEMPLATE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'saudacao', label: 'bom dia / boa tarde / boa noite' },
  { key: 'nome', label: 'seu nome' },
  { key: 'regiao', label: 'região da carga' },
  { key: 'sacos', label: 'quantidade de sacos' },
];

/** "bom dia" até 11h59, "boa tarde" até 17h59, "boa noite" depois (hora local do navegador). */
export function saudacao(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'bom dia';
  if (h < 18) return 'boa tarde';
  return 'boa noite';
}

const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** "ANALICE" -> "Analice"; "MATHEUS PIRES" -> "Matheus Pires"; "maria da silva" -> "Maria da Silva". */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLocaleLowerCase('pt-BR');
      return i > 0 && NAME_PARTICLES.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

export interface ContactMessageVars {
  attendantName: string;
  cityLabel: string;
  bags: number;
}

/** Troca os campos {…} do modelo; chaves desconhecidas ficam como estão. */
export function renderContactMessage(template: string, vars: ContactMessageVars, now: Date = new Date()): string {
  const values: Record<string, string> = {
    saudacao: saudacao(now),
    nome: titleCaseName(vars.attendantName) || 'nossa equipe',
    regiao: vars.cityLabel ? `para a região de ${vars.cityLabel}` : 'para a sua região',
    sacos: String(vars.bags),
  };
  return template.replace(/\{(saudacao|nome|regiao|sacos)\}/g, (_m, key: string) => values[key]);
}

export function defaultContactMessage(
  input: ContactMessageVars & { template?: string | null; now?: Date },
): string {
  const template = input.template?.trim() ? input.template : DEFAULT_CONTACT_TEMPLATE;
  return renderContactMessage(template, input, input.now);
}
