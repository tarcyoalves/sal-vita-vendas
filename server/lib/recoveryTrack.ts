import { sql } from 'drizzle-orm';

// recovery.trackCart é um endpoint PÚBLICO: dois cliques/abas do mesmo telefone chegam quase juntos.
// O padrão antigo "verificar e depois inserir" criava carrinho e cadência em dobro (3 WhatsApps a mais).
//
// Aqui cada decisão vira UMA transação (db.batch do neon-http): primeiro um pg_advisory_xact_lock com hash
// do telefone, depois um INSERT ... WHERE NOT EXISTS. Em READ COMMITTED cada instrução tira o snapshot
// DEPOIS de obter o lock, então quem chega em segundo enxerga o que o primeiro gravou e não insere.
//
// Decisão registrada (não dá para inspecionar produção): NÃO criamos índice único novo em automation_runs
// (poderia falhar com duplicatas já existentes e derrubar a migração). abandoned_carts.customer_phone já é
// UNIQUE no CREATE TABLE; ainda assim o INSERT usa `ON CONFLICT DO NOTHING` sem alvo, que funciona
// com ou sem esse índice.

/** Subconjunto do ordersDb que usamos (facilita o teste com um banco falso). */
export interface BatchDb {
  execute(q: ReturnType<typeof sql>): any;
  batch(qs: readonly [any, ...any[]]): Promise<readonly any[]>;
}

/** Linhas devolvidas por um resultado de execute (neon-http devolve `{ rows }`; aceita array também). */
export function linhasDoResultado(r: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(r)) return r as Array<Record<string, unknown>>;
  const rows = (r as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : [];
}

const travaPorTelefone = (prefixo: string, phone: string) =>
  sql`SELECT pg_advisory_xact_lock(hashtext(${prefixo + ':' + phone}))`;

export interface NovoCarrinho {
  customerName: string; customerPhone: string; customerEmail: string | null;
  postalCode: string | null; quantity: number; stepReached: number;
}

/**
 * Insere o carrinho se não existir para o telefone. Devolve o id novo, ou null se já existia
 * (ou se outra requisição o criou primeiro): quem recebe null deve ler e atualizar o existente.
 */
export async function inserirCarrinhoSeAusente(db: BatchDb, c: NovoCarrinho): Promise<number | null> {
  const [, ins] = await db.batch([
    db.execute(travaPorTelefone('cart', c.customerPhone)),
    db.execute(sql`
      INSERT INTO abandoned_carts (customer_name, customer_phone, customer_email, postal_code, quantity, step_reached, status)
      SELECT ${c.customerName}, ${c.customerPhone}, ${c.customerEmail}, ${c.postalCode}, ${c.quantity}, ${c.stepReached}, 'checkout_started'
      WHERE NOT EXISTS (SELECT 1 FROM abandoned_carts WHERE customer_phone = ${c.customerPhone})
      ON CONFLICT DO NOTHING
      RETURNING id
    `),
  ]);
  const id = linhasDoResultado(ins)[0]?.id;
  return typeof id === 'number' ? id : (id != null ? Number(id) : null);
}

export interface ToqueCadencia { rule: string; delayMs: number }

/**
 * Agenda a cadência só se o telefone não tem NENHUMA corrida criada desde `desde` (qualquer status).
 * Devolve quantos toques foram inseridos (0 = já havia cadência recente, inclusive de uma requisição concorrente).
 */
export async function agendarCadenciaSeAusente(
  db: BatchDb,
  a: { cartId: number; phone: string; toques: ToqueCadencia[]; desde: Date; base?: number },
): Promise<number> {
  const base = a.base ?? Date.now();
  const valores = sql.join(
    a.toques.map(t => sql`(${t.rule}::text, ${new Date(base + t.delayMs).toISOString()}::timestamp)`),
    sql`, `,
  );
  const [, ins] = await db.batch([
    db.execute(travaPorTelefone('cadence', a.phone)),
    db.execute(sql`
      INSERT INTO automation_runs (cart_id, customer_phone, rule_name, status, scheduled_for)
      SELECT ${a.cartId}, ${a.phone}, v.rule_name, 'scheduled', v.scheduled_for
      FROM (VALUES ${valores}) AS v(rule_name, scheduled_for)
      WHERE NOT EXISTS (
        SELECT 1 FROM automation_runs
        WHERE customer_phone = ${a.phone} AND created_at > ${a.desde.toISOString()}::timestamp
      )
      RETURNING id
    `),
  ]);
  return linhasDoResultado(ins).length;
}
