# Faturamento & Comissão — Plano de Backend (Fase 2)

> **Quando executar:** a partir de **02/07** (quando a cota mensal do Neon reabrir).
> **Status atual:** a fase **visual** está pronta e em produção. Todas as telas
> funcionam, mas os dados (produtos, pedidos, comissões) vivem em `localStorage`
> no navegador de cada usuário. Esta fase liga tudo ao banco para sincronizar
> entre dispositivos e usuários.

---

## 1. Por que o swap é fácil

A camada de dados em `client/src/lib/faturamento/store.ts` foi desenhada como um
**contrato estável**: cada função (`produtos.list()`, `pedidos.upsert()`,
`pedidos.faturar()`, `comissoes.set()`, …) tem assinatura equivalente a um
procedure tRPC. As telas **não importam `localStorage` diretamente** — só chamam o
store. Trocar a implementação interna do store por chamadas tRPC mantém as telas
intactas.

```
Telas (componentes)  ──►  store.ts (contrato)  ──►  [hoje] localStorage
                                                 └─►  [02/07] tRPC → Drizzle → Neon
```

---

## 2. Schema do banco — `server/db/schema.ts`

Adicionar ao final do arquivo (segue o padrão Drizzle já usado). Valores monetários
usam `numeric(precision, scale)` como já é feito em `tasks.orderValue` e `siteOrders`.

```ts
// ── Faturamento & Comissão ────────────────────────────────────────────────────

// Catálogo de produtos (admin gerencia). Atendente seleciona na hora do pedido.
export const commissionProducts = pgTable('commission_products', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),                                  // "SAL DO FAZENDEIRO MOÍDO 25 KG"
  pesoUnitarioKg: numeric('peso_unitario_kg', { precision: 10, scale: 3 }).notNull().default('0'),
  valorUnitario: numeric('valor_unitario', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Pedido criado quando o atendente marca um cliente como ativo (= fechou venda).
// status: 'estimado' (antes do embarque) → 'faturado' (embarcado/confirmado).
export const salesOrders = pgTable('sales_orders', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id'),                                    // vínculo opcional com a task convertida
  sellerId: integer('seller_id'),                               // dono do pedido (sellers.id)
  sellerName: text('seller_name').notNull().default(''),
  clienteNome: text('cliente_nome').notNull().default(''),
  cnpj: text('cnpj').notNull().default(''),
  razaoSocial: text('razao_social').notNull().default(''),
  cidade: text('cidade').notNull().default(''),
  uf: text('uf').notNull().default(''),
  status: text('status').notNull().default('estimado'),         // estimado | faturado
  comissaoPct: numeric('comissao_pct', { precision: 5, scale: 2 }).notNull().default('0'), // snapshot
  // Itens guardados como JSONB (espelham ItemPedido). Mantém simples e 1:1 com o front.
  // Alternativa normalizada (sales_order_items) descrita na seção 2.1 — opcional.
  itens: jsonb('itens').$type<SalesOrderItem[]>().notNull().default([]),
  itensEstimadoSnapshot: jsonb('itens_estimado_snapshot').$type<SalesOrderItem[] | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  faturadoEm: timestamp('faturado_em'),
});

export interface SalesOrderItem {
  id: string;
  produtoId: number | null;
  descricao: string;
  quantidade: number;
  pesoKg: number;
  valorUnitario: number;
}

export type CommissionProduct = typeof commissionProducts.$inferSelect;
export type SalesOrder = typeof salesOrders.$inferSelect;
```

E **uma coluna nova** em `sellers` para a % de comissão (hoje em localStorage):

```ts
// dentro de pgTable('sellers', { ... })
commissionPct: numeric('commission_pct', { precision: 5, scale: 2 }).notNull().default('0'),
```

### 2.1 (Opcional) Itens normalizados em vez de JSONB

JSONB é o caminho mais rápido e bate 1:1 com o front. Só normalize se precisar de
relatórios por produto (SQL agregando por item). Nesse caso, criar
`sales_order_items (id, order_id, produto_id, descricao, quantidade numeric,
peso_kg numeric, valor_unitario numeric, fase 'estimado'|'faturado')` e remover o
JSONB. **Recomendação:** começar com JSONB; normalizar depois se houver demanda real.

---

## 3. Migração automática — `server/db/migrate.ts`

Adicionar os `CREATE TABLE IF NOT EXISTS` na função `ensureTablesExist()` (mesmo
padrão das outras tabelas) e o `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para a
coluna em `sellers`:

```sql
CREATE TABLE IF NOT EXISTS commission_products (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  peso_unitario_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id SERIAL PRIMARY KEY,
  task_id INTEGER,
  seller_id INTEGER,
  seller_name TEXT NOT NULL DEFAULT '',
  cliente_nome TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  razao_social TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'estimado',
  comissao_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  itens JSONB NOT NULL DEFAULT '[]',
  itens_estimado_snapshot JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  faturado_em TIMESTAMP
);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
```

> Lembre de rodar `npm run db:push` localmente para validar antes do deploy.

---

## 4. Router tRPC — `server/routers/faturamento.ts`

Criar o router e registrar em `server/routers/index.ts`. Procedures espelham o store.
Produtos e comissão são **admin**; pedidos podem ser do atendente dono.

```ts
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { commissionProducts, salesOrders, sellers } from '../db/schema';

const itemSchema = z.object({
  id: z.string(),
  produtoId: z.number().nullable(),
  descricao: z.string(),
  quantidade: z.number(),
  pesoKg: z.number(),
  valorUnitario: z.number(),
});

export const faturamentoRouter = router({
  // ── Produtos (admin) ──
  listProducts: protectedProcedure.query(() =>
    db.select().from(commissionProducts).orderBy(commissionProducts.nome)),

  upsertProduct: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      nome: z.string().min(1),
      pesoUnitarioKg: z.number().min(0),
      valorUnitario: z.number().min(0),
      ativo: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const values = {
        nome: input.nome,
        pesoUnitarioKg: String(input.pesoUnitarioKg),
        valorUnitario: String(input.valorUnitario),
        ativo: input.ativo,
        updatedAt: new Date(),
      };
      if (input.id) {
        const [row] = await db.update(commissionProducts).set(values)
          .where(eq(commissionProducts.id, input.id)).returning();
        return row;
      }
      const [row] = await db.insert(commissionProducts).values(values).returning();
      return row;
    }),

  deleteProduct: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) =>
      db.delete(commissionProducts).where(eq(commissionProducts.id, input.id))),

  // ── Pedidos ──
  // Atendente vê os seus; admin vê todos.
  listOrders: protectedProcedure.query(({ ctx }) => {
    const q = db.select().from(salesOrders).orderBy(desc(salesOrders.createdAt));
    return ctx.user.role === 'admin' ? q : q; // filtrar por sellerId do atendente, ver nota
  }),

  upsertOrder: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      taskId: z.number().nullable().optional(),
      sellerId: z.number().nullable(),
      sellerName: z.string(),
      clienteNome: z.string(),
      cnpj: z.string(), razaoSocial: z.string(), cidade: z.string(), uf: z.string(),
      comissaoPct: z.number(),
      itens: z.array(itemSchema),
    }))
    .mutation(async ({ input }) => {
      const values = {
        taskId: input.taskId ?? null,
        sellerId: input.sellerId,
        sellerName: input.sellerName,
        clienteNome: input.clienteNome,
        cnpj: input.cnpj, razaoSocial: input.razaoSocial, cidade: input.cidade, uf: input.uf,
        comissaoPct: String(input.comissaoPct),
        itens: input.itens,
      };
      if (input.id) {
        const [row] = await db.update(salesOrders).set(values)
          .where(eq(salesOrders.id, input.id)).returning();
        return row;
      }
      const [row] = await db.insert(salesOrders).values(values).returning();
      return row;
    }),

  faturarOrder: protectedProcedure
    .input(z.object({ id: z.number(), itensReais: z.array(itemSchema) }))
    .mutation(async ({ input }) => {
      const [atual] = await db.select().from(salesOrders).where(eq(salesOrders.id, input.id));
      if (!atual) throw new Error('Pedido não encontrado');
      const [row] = await db.update(salesOrders).set({
        itensEstimadoSnapshot: atual.itensEstimadoSnapshot ?? atual.itens,
        itens: input.itensReais,
        status: 'faturado',
        faturadoEm: new Date(),
      }).where(eq(salesOrders.id, input.id)).returning();
      return row;
    }),

  deleteOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.delete(salesOrders).where(eq(salesOrders.id, input.id))),

  // ── Comissão por atendente (admin) ──
  setCommission: adminProcedure
    .input(z.object({ sellerId: z.number(), pct: z.number().min(0).max(100) }))
    .mutation(({ input }) =>
      db.update(sellers).set({ commissionPct: String(input.pct) })
        .where(eq(sellers.id, input.sellerId))),
});
```

**Notas importantes:**
- `numeric` do Drizzle volta como **string** — converter com `Number()` ao ler e
  `String()` ao gravar (já feito acima). O `calc.ts` do front já faz `Number()` defensivo.
- Em `listOrders`, filtrar por `sellerId` quando `ctx.user.role !== 'admin'`
  (resolver o sellerId do usuário via `sellers.userId = ctx.user.id`).
- A % de comissão passa a vir de `sellers.commissionPct` — incluir esse campo em
  `sellers.listWithRole` e no `update` (router `sellers.ts`) para o admin editar
  junto com o resto, em vez de procedure separado (opcional, fica mais limpo).

---

## 5. Trocar o store no front — `client/src/lib/faturamento/store.ts`

Reescrever as funções para chamar tRPC, **mantendo as assinaturas**. Como tRPC é
assíncrono e hoje o store é síncrono, duas opções:

- **(A) Recomendada:** trocar `useFatStore()` por hooks tRPC reais nas telas
  (`trpc.faturamento.listProducts.useQuery()`, `…upsertProduct.useMutation()` etc.).
  Mais idiomático e com cache/invalidations do TanStack Query. Exige ajustar as
  ~7 telas para usar `useMutation` + `utils.faturamento.*.invalidate()`.
- **(B) Mínima:** manter a interface do store, mas internamente usar o cliente
  tRPC vanilla (`trpcClient.faturamento.*.query/mutate`) e um cache em memória.
  Menos mudança nas telas, porém reimplementa o que o React Query já faz.

**Recomendação:** (A). É mais trabalho pontual, mas remove o cache caseiro e dá
loading/erro de graça. As telas já estão organizadas por componente, então a troca
é mecânica.

### Mapeamento store → tRPC
| Store (hoje) | tRPC (02/07) |
|---|---|
| `produtos.list()` | `trpc.faturamento.listProducts.useQuery()` |
| `produtos.upsert(p)` | `trpc.faturamento.upsertProduct.useMutation()` |
| `produtos.remove(id)` | `trpc.faturamento.deleteProduct.useMutation()` |
| `pedidos.list()` / `listBySeller` | `trpc.faturamento.listOrders.useQuery()` |
| `pedidos.upsert(p)` | `trpc.faturamento.upsertOrder.useMutation()` |
| `pedidos.faturar(id, itens)` | `trpc.faturamento.faturarOrder.useMutation()` |
| `pedidos.remove(id)` | `trpc.faturamento.deleteOrder.useMutation()` |
| `comissoes.get(id)` | campo `commissionPct` em `sellers.listWithRole` |
| `comissoes.set(id, pct)` | `trpc.faturamento.setCommission` (ou `sellers.update`) |

> **IDs:** o store usa `string` (uid local); o banco usa `serial` (number). Ajustar
> os tipos em `types.ts` (`Produto.id`, `Pedido.id` → `number`) na troca. As telas
> usam o id de forma opaca, então o impacto é pequeno.

---

## 6. Migrar os dados do localStorage para o banco (opcional)

Quem usou a fase visual tem dados no navegador. Para não perder:

1. Criar um botão único no admin (`ProductManager`) "Enviar dados locais para o
   servidor" que lê `localStorage` (`sv_fat_products`, `sv_fat_orders`,
   `sv_fat_commissions`) e dispara os `upsert*`/`setCommission` correspondentes.
2. Após sucesso, limpar as chaves do localStorage e remover o botão + os avisos de
   "modo demonstração".

Se os dados da fase visual forem só testes, **pular** este passo e começar limpo é
perfeitamente aceitável.

---

## 7. Limpeza final

- Remover os banners "Modo demonstração — dados locais" das telas
  (`AttendantBilling`, `ProductManager`).
- Remover `seed.ts` (ou manter só para dev) e os botões "carregar/limpar exemplo".
- Conferir que `numeric` → `Number()` em todos os pontos de leitura.

---

## 8. Checklist de execução (ordem segura)

1. [ ] `schema.ts`: tabelas + coluna `sellers.commission_pct` + tipos/exports.
2. [ ] `migrate.ts`: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`.
3. [ ] `npm run db:push` local → validar.
4. [ ] `server/routers/faturamento.ts` + registrar em `routers/index.ts`.
5. [ ] (Opcional) expor `commissionPct` em `sellers.listWithRole` e `sellers.update`.
6. [ ] Trocar telas para hooks tRPC (opção A) — uma de cada vez, testando.
7. [ ] Ajustar `types.ts` (ids `string` → `number`).
8. [ ] (Opcional) botão de migração localStorage → banco.
9. [ ] Remover banners/seed/avisos de demonstração.
10. [ ] `tsc` + `vite build` + teste manual → commit → push `main`.

---

## Apêndice — arquivos da fase visual (já em produção)

```
client/src/lib/faturamento/
  types.ts   — Produto, ItemPedido, Pedido, ComissaoMap, ResumoAtendente, FiltroMes
  store.ts   — contrato (CRUD localStorage + hook useFatStore)  ← TROCAR AQUI
  calc.ts    — totais, comissões, filtro por mês, BRL  (NÃO muda)
  seed.ts    — dados de exemplo (remover na fase 2)
client/src/components/faturamento/
  OrderItemsEditor, OrderDialog, InvoiceDialog, AttendantBilling   (atendente)
  ProductManager, AdminBillingPanorama, BillingReport             (admin)
client/src/pages/Faturamento.tsx                                   (página admin)
Integrações: Tasks.tsx, AttendantProgress.tsx, Attendants.tsx, AdminDashboard.tsx, App.tsx, AppShell.tsx
```

**Regra de ouro:** `calc.ts` é lógica pura e **não muda** na fase 2. Só o `store.ts`
(e os tipos de id) trocam de localStorage para tRPC. As telas seguem o mesmo contrato.
