/**
 * Janela de atendimento do robô do SMBI (economia de computação do Neon).
 *
 * O robô da VPS chama o CRM a cada ~2 min; isso mantém o banco acordado 24h. Fora da janela as
 * rotas de polling respondem sem tocar no banco. Fuso fixo America/Fortaleza (sem horário de
 * verão), todos os dias da semana. Fim EXCLUSIVO: 11:00 já está fora.
 *
 * Config (env SMBI_JANELA): "08:00-11:00,14:00-17:00" (padrão) ou "sempre" (desliga o portão).
 * Config inválida => fail open (trata como "sempre") e avisa uma única vez.
 */

export const SMBI_JANELA_PADRAO = '08:00-11:00,14:00-17:00';
export const SMBI_JANELA_FUSO = 'America/Fortaleza';

type Faixa = { ini: number; fim: number }; // minutos desde 00:00 local

const RE_FAIXA = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
const avisados = new Set<string>();

function avisar(config: string): void {
  if (avisados.has(config)) return;
  avisados.add(config);
  console.warn(`[smbi] SMBI_JANELA inválida (${JSON.stringify(config)}): portão desligado (fail open). Formato: "08:00-11:00,14:00-17:00" ou "sempre".`);
}

/** Faixas em minutos; `null` = sem portão (sempre atende), inclusive config inválida. */
export function interpretarJanela(config?: string | null): Faixa[] | null {
  const txt = (config ?? '').trim() || SMBI_JANELA_PADRAO;
  if (txt.toLowerCase() === 'sempre') return null;
  const faixas: Faixa[] = [];
  for (const parte of txt.split(',')) {
    const m = RE_FAIXA.exec(parte.trim());
    if (!m) { avisar(txt); return null; }
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) { avisar(txt); return null; }
    const ini = h1 * 60 + m1;
    const fim = h2 * 60 + m2;
    if (fim <= ini) { avisar(txt); return null; }
    faixas.push({ ini, fim });
  }
  return faixas.sort((a, b) => a.ini - b.ini);
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: SMBI_JANELA_FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Minutos desde a meia-noite em Fortaleza. */
export function minutoLocal(agora: Date): number {
  const partes = fmt.formatToParts(agora);
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** true se o robô pode ser atendido agora. */
export function dentroDaJanelaDoRobo(agora: Date, config?: string | null): boolean {
  const faixas = interpretarJanela(config);
  if (!faixas) return true;
  const min = minutoLocal(agora);
  return faixas.some((f) => min >= f.ini && min < f.fim);
}

/**
 * Texto da próxima abertura ("14:00" ou "08:00 de amanhã"), para a tela.
 * `null` se o portão está desligado ou se já está dentro da janela.
 */
export function proximaAberturaDaJanela(agora: Date, config?: string | null): string | null {
  const faixas = interpretarJanela(config);
  if (!faixas || dentroDaJanelaDoRobo(agora, config)) return null;
  const min = minutoLocal(agora);
  const hoje = faixas.find((f) => f.ini > min);
  return hoje ? hhmm(hoje.ini) : `${hhmm(faixas[0].ini)} de amanhã`;
}

/**
 * Decisão do portão das rotas de polling. `?id=` (reconferência de pedido em andamento) e
 * `?simular=1` passam sempre; fora da janela, o resto NÃO pode tocar o banco.
 */
export function pollingBarradoPelaJanela(
  opts: { id?: string; simular?: boolean; agora?: Date; config?: string | null },
): boolean {
  if (opts.id || opts.simular) return false;
  return !dentroDaJanelaDoRobo(opts.agora ?? new Date(), opts.config);
}

/** Texto do campo `aviso` das respostas de polling fora da janela. */
export const AVISO_FORA_DA_JANELA =
  'Fora da janela de atendimento do robô (08:00-11:00 e 14:00-17:00, Fortaleza). Nada foi consultado nem reservado.';

/** Config vinda do ambiente do servidor (vazia = padrão). */
export function janelaDoAmbiente(): string {
  return process.env.SMBI_JANELA?.trim() || SMBI_JANELA_PADRAO;
}
