/**
 * Quais schemas (bancos) uma requisição precisa ter migrados ANTES de ser atendida.
 *
 * A migração é preguiçosa (server/lib/schemaPreguicoso.ts): só acorda o Neon de quem a pede.
 * Esta função PURA decide o pedido — sem I/O, testável — e `api/index.ts` aguarda o resultado.
 *
 *   crm  → DATABASE_URL        (ensureTablesExist)
 *   loja → ORDERS_DATABASE_URL (ensureOrdersTablesExist + ensureB2bTablesExist)
 *
 * Regra de ouro: requisição que não precisa de banco NÃO pode pedir nenhum schema
 * (robô SMBI fora da janela, `premiumAuth.*`, `/api/health`).
 */
import { pollingBarradoPelaJanela, dentroDaJanelaDoRobo } from '../../shared/smbiJanela';

export type Schemas = { crm: boolean; loja: boolean };

export const NENHUM: Schemas = { crm: false, loja: false };
export const SO_CRM: Schemas = { crm: true, loja: false };
export const SO_LOJA: Schemas = { crm: false, loja: true };
export const AMBOS: Schemas = { crm: true, loja: true };

export const uniao = (a: Schemas, b: Schemas): Schemas => ({ crm: a.crm || b.crm, loja: a.loja || b.loja });

/** Namespaces tRPC da loja (ordersDb). Mantenha em sincronia com PREMIUM_PREFIXES (premiumSession.ts). */
const PREFIXOS_LOJA = ['shipping.', 'recovery.', 'b2b.', 'premiumemailmarketing.'];
/** Login da loja não usa banco. */
const PREFIXO_SEM_BANCO = 'premiumauth.';

export type RequisicaoParaSchemas = {
  metodo: string;
  /** Caminho completo SEM query, ex.: `/api/trpc/shipping.calculate,auth.me`. */
  caminho: string;
  query?: Record<string, unknown>;
  /** Horário da requisição (a janela do robô usa o fuso de Fortaleza). */
  agora?: Date;
  /** Config da janela do robô (env SMBI_JANELA); vazio = padrão. */
  janelaConfig?: string | null;
  /** A requisição traz o cookie de sessão do CRM (createContext consulta `users` no banco do CRM). */
  sessaoCrm?: boolean;
};

/** Nomes das procedures de uma chamada tRPC (lote `a.b,c.d` → ['a.b', 'c.d']), em minúsculas. */
export function procedimentosTrpc(caminho: string): string[] {
  const m = /\/api\/trpc\/(.*)$/i.exec(caminho);
  if (!m) return [];
  return m[1].split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

/** Schemas de uma chamada tRPC (lote = união). Procedure do CRM é o padrão. */
export function schemasDoTrpc(procs: string[], sessaoCrm = false): Schemas {
  let r = NENHUM;
  for (const p of procs) {
    if (p.startsWith(PREFIXO_SEM_BANCO)) continue;
    if (PREFIXOS_LOJA.some(pre => p.startsWith(pre))) {
      r = uniao(r, SO_LOJA);
      // Staff do CRM usando o painel da loja: createContext carrega o usuário no banco do CRM.
      if (sessaoCrm) r = uniao(r, SO_CRM);
    } else {
      r = uniao(r, SO_CRM);
    }
  }
  return r;
}

type Regra = { padrao: RegExp; metodos?: string[]; schemas: Schemas | ((r: RequisicaoParaSchemas) => Schemas) };

const aoAgora = (r: RequisicaoParaSchemas) => r.agora ?? new Date();
const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Rotas Express (fora do tRPC). A ordem importa: a primeira que casar vale.
 * Rota que não casa com nenhuma => NENHUM (e o teste de código-fonte reprova rota nova sem regra).
 */
const REGRAS: Regra[] = [
  // Sem banco / com tratamento próprio.
  { padrao: /^\/api\/health$/, schemas: NENHUM },
  { padrao: /^\/api\/db-health$/, schemas: NENHUM },          // SELECT 1 de propósito; não migra
  { padrao: /^\/api\/db-stats$/, schemas: NENHUM },           // só catálogo do Postgres; admin
  { padrao: /^\/api\/orders-health$/, schemas: NENHUM },      // força ensureOrdersTablesExist(true) por conta própria

  // Descadastro procura o token nos DOIS bancos.
  { padrao: /^\/api\/unsubscribe$/, schemas: AMBOS },
  // Premium (loja) e CRM dividem a URL; o handler pede o schema certo depois de validar a assinatura.
  { padrao: /^\/api\/resend-webhook$/, schemas: AMBOS },

  // Loja.
  { padrao: /^\/api\/me-webhook$/, schemas: SO_LOJA },
  { padrao: /^\/api\/mp-webhook$/, schemas: SO_LOJA },
  { padrao: /^\/api\/b2b\/inbound$/, schemas: SO_LOJA },
  // O cron da loja também roda o pós-compra, cujo motor consulta a supressão do banco do CRM.
  { padrao: /^\/api\/cron\/abandoned-cart$/, schemas: AMBOS },

  // CRM.
  { padrao: /^\/api\/brevo-webhook$/, schemas: SO_CRM },
  { padrao: /^\/api\/cron\/email-daily$/, schemas: SO_CRM },

  // Robô SMBI: polling fora da janela NÃO toca o banco (shared/smbiJanela.ts).
  {
    padrao: /^\/api\/smbi\/pedidos$/, metodos: ['GET'],
    schemas: (r) => {
      const id = texto(r.query?.id);
      const simular = r.query?.simular === '1';
      return pollingBarradoPelaJanela({ id, simular, agora: aoAgora(r), config: r.janelaConfig }) ? NENHUM : SO_CRM;
    },
  },
  {
    padrao: /^\/api\/smbi\/heartbeat$/, metodos: ['POST'],
    schemas: (r) => (dentroDaJanelaDoRobo(aoAgora(r), r.janelaConfig) ? SO_CRM : NENHUM),
  },
  // Filas só-leitura do robô: fora da janela respondem vazio sem banco (não têm `?id=`; `?simular=1` do cadastro passa sempre).
  {
    padrao: /^\/api\/smbi\/(ligados|vinculos)$/, metodos: ['GET'],
    schemas: (r) => (pollingBarradoPelaJanela({ agora: aoAgora(r), config: r.janelaConfig }) ? NENHUM : SO_CRM),
  },
  {
    padrao: /^\/api\/smbi\/cadastros$/, metodos: ['GET'],
    schemas: (r) => {
      const simular = r.query?.simular === '1';
      return pollingBarradoPelaJanela({ simular, agora: aoAgora(r), config: r.janelaConfig }) ? NENHUM : SO_CRM;
    },
  },
  // retorno, iniciar, status, faturamento, cadastros/:id…: sempre CRM.
  { padrao: /^\/api\/smbi\//, schemas: SO_CRM },
];

/** true se alguma regra cobre a rota Express (usado pelo teste de cobertura de rotas). */
export function rotaMapeada(caminho: string, metodo = 'GET'): boolean {
  const c = caminho.replace(/\/+$/, '') || '/';
  const m = metodo.toUpperCase();
  return REGRAS.some(r => r.padrao.test(c) && (!r.metodos || r.metodos.includes(m)));
}

export function schemasNecessarios(req: RequisicaoParaSchemas): Schemas {
  const caminho = (req.caminho.split('?')[0].replace(/\/+$/, '')) || '/';
  const metodo = req.metodo.toUpperCase();

  if (/^\/api\/trpc(\/|$)/i.test(caminho)) {
    return schemasDoTrpc(procedimentosTrpc(caminho), req.sessaoCrm === true);
  }
  for (const r of REGRAS) {
    if (!r.padrao.test(caminho)) continue;
    if (r.metodos && !r.metodos.includes(metodo)) continue;
    return typeof r.schemas === 'function' ? r.schemas(req) : r.schemas;
  }
  return NENHUM;
}
