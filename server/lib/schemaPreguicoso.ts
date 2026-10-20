/**
 * Migração de schema PREGUIÇOSA e memoizada (uma por instância serverless).
 *
 * Antes, `api/index.ts` rodava as migrações no carregamento do módulo: todo cold start — até
 * requisição que não usa banco (robô SMBI fora da janela, login da loja) — conectava nos DOIS
 * bancos Neon e os acordava (cobrança por CU-hora). Agora cada migração só começa na primeira
 * vez que alguém precisa daquele banco.
 *
 * Regras:
 *  - promessa única por instância: requisições simultâneas esperam a MESMA execução;
 *  - espera limitada (`timeoutMs`): estourou, a requisição segue (como antes) e a migração
 *    continua em segundo plano; requisições seguintes não esperam de novo enquanto ela roda;
 *  - falha (exceção) NÃO é memoizada para sempre: nova tentativa numa requisição futura, com
 *    backoff para não martelar um banco fora do ar;
 *  - esta função nunca rejeita: quem espera segue o fluxo e o erro aparece no log.
 *
 * Sem dependência de banco: testável com relógio injetado.
 */

export type SchemaPreguicosoOpts = {
  /** Nome para os logs, ex.: 'ensureTablesExist'. */
  nome: string;
  /** Roda a migração. Deve LANÇAR se ela não terminou bem (para permitir nova tentativa). */
  executar: () => Promise<unknown>;
  /** Quanto uma requisição espera, no máximo, pela migração. */
  timeoutMs: number;
  /** Espera (ms) antes de tentar de novo após a 1ª, 2ª, 3ª… falha; a última se repete. */
  backoffMs?: number[];
  /** Relógio injetável (testes). */
  agora?: () => number;
};

export type SchemaPreguicoso = {
  /** Dispara a migração se preciso e espera por ela (limitado por `timeoutMs`). Nunca rejeita. */
  garantir: () => Promise<void>;
  /** Estado para testes/diagnóstico. */
  estado: () => { ok: boolean; emAndamento: boolean; falhas: number };
};

export const BACKOFF_PADRAO_MS = [5_000, 15_000, 60_000, 120_000];

export function criarSchemaPreguicoso(opts: SchemaPreguicosoOpts): SchemaPreguicoso {
  const { nome, executar, timeoutMs } = opts;
  const backoff = opts.backoffMs && opts.backoffMs.length ? opts.backoffMs : BACKOFF_PADRAO_MS;
  const agora = opts.agora ?? Date.now;

  let ok = false;
  let emAndamento = false;
  let esperaEstourou = false;
  let espera: Promise<void> = Promise.resolve();
  let falhas = 0;
  let proximaTentativaEm = 0;

  function iniciar(): void {
    emAndamento = true;
    esperaEstourou = false;
    let terminou = false;
    let avisoTimer: ReturnType<typeof setTimeout> | undefined;
    let limiteTimer: ReturnType<typeof setTimeout> | undefined;

    let execucao: Promise<unknown>;
    try {
      execucao = Promise.resolve(executar());
    } catch (err) {
      execucao = Promise.reject(err);
    }

    execucao.then(
      () => {
        terminou = true;
        ok = true;
        emAndamento = false;
        falhas = 0;
        clearTimeout(avisoTimer);
        clearTimeout(limiteTimer);
      },
      (err) => {
        terminou = true;
        emAndamento = false;
        clearTimeout(avisoTimer);
        clearTimeout(limiteTimer);
        const espera_ms = backoff[Math.min(falhas, backoff.length - 1)];
        falhas += 1;
        proximaTentativaEm = agora() + espera_ms;
        console.error(`[schema] ${nome} falhou (tentativa ${falhas}); nova tentativa em ${Math.round(espera_ms / 1000)} s:`, err);
      },
    );

    espera = new Promise<void>((resolve) => {
      limiteTimer = setTimeout(() => {
        esperaEstourou = true;
        // A Vercel pode congelar a instância e o cronômetro vence ao acordar mesmo com o banco
        // respondendo. Só avisa se AINDA não terminou 5 s depois do limite — aí é migração travada
        // ou incompleta (faturamento zerado em 28/09, HANDOFF-HERMES.md caso N).
        avisoTimer = setTimeout(() => {
          if (!terminou) console.warn(`[startup] ${nome} ainda não terminou ${Math.round((timeoutMs + 5000) / 1000)} s depois de iniciar — a migração pode ter ficado incompleta`);
        }, 5000);
        resolve();
      }, timeoutMs);
      execucao.then(() => resolve(), () => resolve());
    });
    // Evita segurar o processo (testes/dev) só por causa dos cronômetros.
    (limiteTimer as { unref?: () => void } | undefined)?.unref?.();
  }

  return {
    garantir(): Promise<void> {
      if (ok) return Promise.resolve();
      if (emAndamento) return esperaEstourou ? Promise.resolve() : espera;
      if (agora() < proximaTentativaEm) return Promise.resolve(); // em backoff: segue sem martelar
      iniciar();
      return espera;
    },
    estado: () => ({ ok, emAndamento, falhas }),
  };
}
