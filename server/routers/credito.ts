// Análise de crédito (CRM Lembretes) — ver docs/ANALISE-CREDITO.md e shared/credito.ts.
// Só admin dispara consulta paga. Payload bruto e sócios nunca saem deste arquivo para atendente.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { router, protectedProcedure, staffProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { creditQueries, creditReports, creditSettings, fatOrders, sellers, tasks, users } from '../db/schema';
import { userTaskFilter } from './tasks';
import {
  SEMAFORO, analisarSinais, calcularVeredito, piorVeredito, relatorioValido, type GrupoAnotacao, type RelatorioCredito, type Veredito,
} from '../../shared/credito';
import {
  CATALOGO_CREDITO, PRECOS_MEDIDOS_EM, calcularCustos, chaveDoProdutoGravado, nomeDoProduto, verificarLimitesCusto,
} from '../../shared/creditoCatalogo';
import { ordenarSinais } from '../../shared/creditoSinais';
import { SQL_ACENTOS, SQL_SEM_ACENTOS } from '../../shared/searchText';
import { validarDocumento } from '../lib/credito/documento';
import { LIMITE_MENSAL_PADRAO, limiteMensalValido, tetoPorConsultaValido } from '../lib/credito/politica';
import {
  chipsDosProdutos, comoVeredito, escolherEfetivo, maisRecentePorProduto, planoDeCache, resumirResultados, validarProdutos,
  type ResultadoProduto,
} from '../lib/credito/produtos';
import { montarFiltrosListagem, POR_PAGINA_MAX } from '../lib/credito/listagem';
import { documentosVisiveis, montarSemaforos, normalizarDocumentosSemaforo, SEMAFOROS_MAX_DOCUMENTOS } from '../lib/credito/semaforos';
import {
  desvincularRelatorioDoPedido, gastoNoMesReais, lerConfigCredito, relatoriosDoDocumento, ultimoRelatorioDoDocumento, usadasNoMes,
  vincularRelatorioAoPedido,
} from '../lib/credito/repo';
import { getProvedorCredito } from '../lib/credito/provedores';
import { ErroProvedorCredito } from '../lib/credito/provedores/tipos';
import { mapeadorDoProduto } from '../lib/credito/provedores/mapeadores';
import { consultarSaldoApiFull } from '../lib/credito/provedores/boavistaApifull';
import { gerarPdfCredito } from '../lib/credito/pdf';

const ehStaff = (role: string) => role === 'admin' || role === 'manager';
const qtd = (g: GrupoAnotacao) => (g.consultado ? g.quantidade : null);

export function resumoAnotacoes(r: RelatorioCredito) {
  const a = r.anotacoes;
  return {
    protestos: qtd(a.protestos), pendenciasFinanceiras: qtd(a.pendenciasFinanceiras), chequesSemFundo: qtd(a.chequesSemFundo),
    acoesJudiciais: qtd(a.acoesJudiciais), falenciaRecuperacao: qtd(a.falenciaRecuperacao),
  };
}

async function sellerIdDoUsuario(userId: number): Promise<number | null> {
  const [row] = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, userId));
  return row?.id ?? null;
}

/** Atendente só vê documento de tarefa dele (tasks.cnpj) ou de pedido dele (fat_orders.sellerId). */
async function atendentePodeVerDocumento(user: { id: number; name: string }, documento: string): Promise<boolean> {
  const filtro = await userTaskFilter(user.id, user.name ?? '');
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.cnpj, documento), filtro)).limit(1);
  if (t) return true;
  const sid = await sellerIdDoUsuario(user.id);
  if (sid === null) return false;
  const r = await db.execute(sql`
    SELECT 1 FROM fat_orders WHERE seller_id = ${sid}::integer AND regexp_replace(cnpj, '\\D', '', 'g') = ${documento} LIMIT 1`);
  return r.rows.length > 0;
}

type LinhaSemBruto = Omit<typeof creditReports.$inferSelect, 'payloadBruto'>;

/** Cartão do documento: o veredito/validade são os EFETIVOS (pior entre os relatórios válidos); o resto vem do principal. */
function cartaoDoRelatorio(row: LinhaSemBruto, efetivo: { veredito: Veredito; valido: boolean }) {
  return {
    id: row.id,
    consultadoEm: row.consultadoEm,
    veredito: efetivo.veredito,
    motivos: row.motivos,
    semaforo: SEMAFORO[efetivo.veredito],
    score: row.relatorio.score.valor,
    probabilidadeInadimplencia: row.relatorio.score.probabilidadeInadimplencia,
    resumo: resumoAnotacoes(row.relatorio),
    valido: efetivo.valido,
    razaoSocial: row.relatorio.cadastro.razaoSocial ?? row.razaoSocial,
    provedor: row.provedor,
    simulado: row.provedor === 'simulado',
    // Pontos de atenção na data da consulta (mesma referência do veredito e do PDF).
    sinais: ordenarSinais(analisarSinais(row.relatorio, row.consultadoEm)),
  };
}

/** Dos documentos pedidos, os que o atendente enxerga: de tarefa dele (tasks.cnpj) ou de pedido dele (fat_orders). */
async function documentosDaCarteira(user: { id: number; name: string }, documentos: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (documentos.length === 0) return out;
  const filtro = await userTaskFilter(user.id, user.name ?? '');
  const deTarefas = await db.select({ cnpj: tasks.cnpj }).from(tasks).where(and(inArray(tasks.cnpj, documentos), filtro));
  for (const t of deTarefas) if (t.cnpj) out.add(t.cnpj);
  const sid = await sellerIdDoUsuario(user.id);
  if (sid !== null) {
    const lista = sql.join(documentos.map((d) => sql`${d}::text`), sql`, `);
    const r = await db.execute(sql`
      SELECT DISTINCT regexp_replace(cnpj, '\\D', '', 'g') AS doc FROM fat_orders
      WHERE seller_id = ${sid}::integer AND regexp_replace(cnpj, '\\D', '', 'g') IN (${lista})`);
    for (const row of r.rows as Array<{ doc: string }>) out.add(row.doc);
  }
  return out;
}

const documentoInput = z.string().min(1).max(30);

function erroDocumento(documento: string, tipo?: 'CNPJ' | 'CPF') {
  const v = validarDocumento(documento, tipo);
  if (!v.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: v.erro });
  return v;
}

function semSimuladosSeReal<T extends { provedor: string }>(linhas: T[]): T[] {
  return getProvedorCredito().nome === 'simulado' ? linhas : linhas.filter((l) => l.provedor !== 'simulado');
}

export const creditoRouter = router({
  status: protectedProcedure.query(async () => {
    const provedor = getProvedorCredito();
    const [cfg, usadas, gasto] = await Promise.all([lerConfigCredito(), usadasNoMes(), gastoNoMesReais()]);
    return {
      provedor: provedor.nome, simulado: provedor.nome === 'simulado',
      limiteMensal: cfg.limiteMensal, usadasNoMes: usadas, bloqueioAtivo: cfg.bloqueioAtivo,
      tetoPorConsultaReais: cfg.tetoPorConsultaReais, gastoNoMesReais: gasto,
    };
  }),

  /** Veredito EFETIVO do documento (pior entre os relatórios válidos de qualquer produto) + um chip por produto. */
  ultimo: protectedProcedure
    .input(z.object({ documento: documentoInput }))
    .query(async ({ ctx, input }) => {
      const documento = input.documento.replace(/\D/g, '');
      if (!ehStaff(ctx.user.role) && !(await atendentePodeVerDocumento(ctx.user, documento))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Documento fora da sua carteira' });
      }
      // Com o provedor REAL ligado, relatórios de teste (simulados) não aparecem: eram dados fictícios.
      const linhas = semSimuladosSeReal(await relatoriosDoDocumento(documento));
      const efetivo = escolherEfetivo(linhas);
      if (!efetivo) return null;
      return { ...cartaoDoRelatorio(efetivo.principal, efetivo), produtos: chipsDosProdutos(linhas) };
    }),

  /** Catálogo de consultas com preço. Com `documento`, traz a última consulta de cada produto (mesmas regras de acesso de `ultimo`). */
  catalogo: protectedProcedure
    .input(z.object({ documento: documentoInput.optional() }))
    .query(async ({ ctx, input }) => {
      const cfg = await lerConfigCredito();
      let ultimoPorProduto: Record<string, { id: number; consultadoEm: Date; valido: boolean; provedor: string }> | null = null;
      const documento = input.documento?.replace(/\D/g, '');
      if (documento) {
        if (!ehStaff(ctx.user.role) && !(await atendentePodeVerDocumento(ctx.user, documento))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Documento fora da sua carteira' });
        }
        ultimoPorProduto = {};
        for (const [chave, l] of maisRecentePorProduto(semSimuladosSeReal(await relatoriosDoDocumento(documento)))) {
          ultimoPorProduto[chave] = { id: l.id, consultadoEm: l.consultadoEm, valido: relatorioValido(l.consultadoEm), provedor: l.provedor };
        }
      }
      return { itens: CATALOGO_CREDITO, precosMedidosEm: PRECOS_MEDIDOS_EM, tetoPorConsultaReais: cfg.tetoPorConsultaReais, ultimoPorProduto };
    }),

  /** Semáforo EFETIVO (pior veredito vigente entre os produtos) de cada CNPJ da lista (uma consulta só). Sem relatório ou fora da carteira: não aparece. */
  semaforos: protectedProcedure
    .input(z.object({ documentos: z.array(z.string().max(30)).max(SEMAFOROS_MAX_DOCUMENTOS) }))
    .query(async ({ ctx, input }) => {
      const staff = ehStaff(ctx.user.role);
      const pedidos = normalizarDocumentosSemaforo(input.documentos);
      const carteira = staff || pedidos.length === 0 ? new Set<string>() : await documentosDaCarteira(ctx.user, pedidos);
      const docs = documentosVisiveis(pedidos, { staff, daCarteira: carteira });
      if (docs.length === 0) return {};
      const lista = sql.join(docs.map((d) => sql`${d}::text`), sql`, `);
      // Todos os relatórios vigentes (<30 dias) de cada documento, mais o mais recente de cada um (para o "vencido").
      const r = await db.execute(sql`
        WITH ult AS (
          SELECT DISTINCT ON (documento) id FROM credit_reports WHERE documento IN (${lista})
          ORDER BY documento, consultado_em DESC, id DESC
        )
        SELECT documento, veredito, consultado_em, provedor FROM credit_reports
        WHERE documento IN (${lista})
          AND (consultado_em > now() - interval '30 days' OR id IN (SELECT id FROM ult))
        ORDER BY documento, consultado_em DESC, id DESC`);
      type L = { documento: string; veredito: string; consultado_em: Date | string; provedor: string };
      return montarSemaforos((r.rows as unknown as L[]).map((l) => ({
        documento: l.documento, veredito: comoVeredito(l.veredito), consultadoEm: l.consultado_em, provedor: l.provedor,
      })));
    }),

  relatorio: staffProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      const veredito = comoVeredito(row.veredito);
      return {
        id: row.id, relatorio: row.relatorio, veredito, motivos: row.motivos, semaforo: SEMAFORO[veredito],
        consultadoEm: row.consultadoEm, provedor: row.provedor, produto: row.produto, custoReais: row.custoReais,
        consultadoPorUserId: row.consultadoPorUserId, motivo: row.motivo, taskId: row.taskId,
      };
    }),

  /** Diagnóstico (admin): só a ESTRUTURA da resposta guardada (caminhos e tipo; valores de texto só como tamanho). */
  estruturaBruta: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select({ bruto: creditReports.payloadBruto }).from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      if (row.bruto == null) return { guardado: false, linhas: [] as string[], total: 0 };
      const linhas: string[] = [];
      const andar = (v: unknown, caminho: string): void => {
        if (linhas.length >= 400) return;
        if (Array.isArray(v)) { linhas.push(`${caminho} [lista × ${v.length}]`); if (v.length) andar(v[0], `${caminho}[0]`); return; }
        if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v as Record<string, unknown>)) andar(x, caminho ? `${caminho}.${k}` : k); return; }
        if (typeof v === 'string') linhas.push(`${caminho} = texto(${v.length}${v.length === 0 ? ', vazio' : ''})`);
        else linhas.push(`${caminho} = ${v === null ? 'null' : typeof v === 'number' ? String(v) : typeof v}`);
      };
      andar(row.bruto, '');
      return { guardado: true, linhas, total: linhas.length };
    }),

  /** Link do PDF original do provedor (aux.data da resposta guardada) ou null. Só admin; o servidor não busca a URL. */
  linkOriginal: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select({ bruto: creditReports.payloadBruto }).from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      const aux = (row.bruto as { aux?: { data?: unknown } } | null)?.aux;
      const url = typeof aux?.data === 'string' ? aux.data.trim() : '';
      return { url: /^https?:\/\/\S+$/i.test(url) ? url : null };
    }),

  /**
   * Refaz o relatório a partir da RESPOSTA JÁ PAGA (payload_bruto), sem chamar a API nem cobrar: serve para
   * relatórios gravados por uma versão antiga do leitor de campos. Recalcula veredito, score e metadados.
   */
  reprocessar: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db.select().from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      if (row.payloadBruto == null) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Este relatório não guardou a resposta original; não dá para reprocessar sem nova consulta.' });
      const chave = chaveDoProdutoGravado(row.produto, row.provedor);
      const item = CATALOGO_CREDITO.find((c) => c.chave === chave);
      const conteudo = mapeadorDoProduto(chave)(row.payloadBruto);
      const antigo = row.relatorio as RelatorioCredito;
      const relatorio: RelatorioCredito = {
        documento: row.documento, tipo: antigo.tipo, consultadoEm: antigo.consultadoEm,
        fonte: { provedor: row.provedor, produto: item?.nome ?? antigo.fonte.produto, custoReais: row.custoReais ?? antigo.fonte.custoReais },
        ...conteudo,
      };
      const { veredito, motivos } = calcularVeredito(relatorio);
      await db.update(creditReports).set({
        relatorio, veredito, motivos, score: relatorio.score.valor, produto: chave,
        razaoSocial: relatorio.cadastro.razaoSocial ?? row.razaoSocial,
        municipio: relatorio.cadastro.municipio ?? row.municipio,
        uf: relatorio.cadastro.uf ?? row.uf,
      }).where(eq(creditReports.id, input.id));
      console.log(`[credito] relatório ${input.id} reprocessado sem custo por user#${ctx.user.id}`);
      return { id: input.id, veredito, motivos, score: relatorio.score.valor };
    }),

  consultar: adminProcedure
    .input(z.object({
      documento: documentoInput,
      tipo: z.enum(['CNPJ', 'CPF']).optional(),
      motivo: z.string().trim().min(5).max(300),
      forcarNova: z.boolean().optional(),
      taskId: z.number().int().optional(),
      pedidoId: z.string().min(1).max(100).optional(),
      /** Chaves do catálogo (1 a 3, sem repetição, só com custo medido). Ausente = ['boavista'] (compatibilidade). */
      produtos: z.array(z.string().max(60)).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { documento, tipo } = erroDocumento(input.documento, input.tipo);
      const escolha = validarProdutos(input.produtos);
      if (!escolha.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: escolha.erro });
      const itens = escolha.itens;
      const provedor = getProvedorCredito();
      const simulado = provedor.nome === 'simulado';

      let pedido: { razaoSocial: string; cidade: string; uf: string } | null = null;
      if (input.pedidoId) {
        const [p] = await db.select({ razaoSocial: fatOrders.razaoSocial, cidade: fatOrders.cidade, uf: fatOrders.uf })
          .from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
        pedido = p;
      }

      // 1) Cache por (documento, produto): relatório válido (<30 dias) do mesmo provedor é reaproveitado, sem custo.
      const linhas = await relatoriosDoDocumento(documento, { limite: 60 });
      const { reaproveita, ultimo } = planoDeCache(itens, linhas, { forcarNova: input.forcarNova, provedorAtual: provedor.nome });
      const aConsultar = itens.filter((i) => !reaproveita[i.chave]);
      const custos = calcularCustos(itens, reaproveita, simulado);

      // 2) Antes de gastar: teto por consulta, saldo conhecido da API (fail-open se indisponível) e limite mensal.
      const queryIds = new Map<string, number>();
      if (aConsultar.length > 0) {
        const cfg = await lerConfigCredito();
        let saldo: number | null = null;
        if (!simulado && custos.totalReais > 0) {
          try { saldo = (await consultarSaldoApiFull()).saldo; } catch (e) {
            console.error('[credito] saldo indisponível, seguindo sem a checagem de saldo:', e instanceof ErroProvedorCredito ? e.detalhe : 'erro');
          }
        }
        const bloqueio = verificarLimitesCusto({
          totalReais: custos.totalReais, chamadas: custos.chamadas, saldo, tetoPorConsultaReais: cfg.tetoPorConsultaReais,
          usadasNoMes: await usadasNoMes(), limiteMensal: cfg.limiteMensal,
        });
        if (!bloqueio.ok) {
          const code = bloqueio.codigo === 'TETO' ? 'BAD_REQUEST' : bloqueio.codigo === 'SALDO' ? 'PRECONDITION_FAILED' : 'FORBIDDEN';
          throw new TRPCError({ code, message: bloqueio.mensagem });
        }

        // 3) Trava atômica: uma linha EM_ANDAMENTO por produto, TODAS ou NENHUMA, no mesmo INSERT — só se não houver
        // outra consulta viva do mesmo documento e se o teto mensal comportar todas (1 por produto).
        const valores = sql.join(aConsultar.map((i) => sql`(${i.chave}::text)`), sql`, `);
        const travou = await db.execute(sql`
          INSERT INTO credit_queries (documento, user_id, status, produto)
          SELECT ${documento}::text, ${ctx.user.id}::integer, 'EM_ANDAMENTO', v.produto
          FROM (VALUES ${valores}) AS v(produto)
          WHERE NOT EXISTS (
            SELECT 1 FROM credit_queries
            WHERE documento = ${documento}::text AND status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes'
          )
          AND (
            SELECT count(*) FROM credit_queries
            WHERE iniciado_em >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
              AND (status = 'OK' OR (status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes'))
          ) + ${aConsultar.length}::integer <= COALESCE((SELECT limite_mensal FROM credit_settings WHERE id = 1), ${LIMITE_MENSAL_PADRAO}::integer)
          RETURNING id, produto`);
        for (const row of travou.rows as Array<{ id: number; produto: string }>) queryIds.set(row.produto, row.id);
        if (queryIds.size !== aConsultar.length) {
          const emAndamento = await db.execute(sql`
            SELECT 1 FROM credit_queries
            WHERE documento = ${documento}::text AND status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes' LIMIT 1`);
          if (emAndamento.rows.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Consulta já em andamento' });
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Limite mensal de consultas pagas atingido. Ajuste o limite ou aguarde o próximo mês.' });
        }
      }

      // 4) Reaproveitados: uma linha REAPROVEITADO no razão por produto (custo 0).
      const resultadoDe = new Map<string, ResultadoProduto>();
      for (const item of itens.filter((i) => reaproveita[i.chave])) {
        const linha = ultimo.get(item.chave);
        if (!linha) continue; // inalcançável: reaproveita[chave] só é true com linha
        await db.insert(creditQueries).values({
          documento, userId: ctx.user.id, status: 'REAPROVEITADO', reportId: linha.id, custoReais: 0, produto: item.chave, finalizadoEm: new Date(),
        });
        if (input.pedidoId) await vincularRelatorioAoPedido(linha.id, input.pedidoId, ctx.user.id, 'CONSULTA_NO_PEDIDO');
        resultadoDe.set(item.chave, {
          produto: item.chave, ok: true, reaproveitado: true, cobrado: false, custoReais: 0,
          id: linha.id, consultadoEm: linha.consultadoEm, veredito: comoVeredito(linha.veredito),
        });
      }

      // 5) Chamadas pagas (em paralelo, independentes). Cada uma grava UM relatório e fecha SUA linha do razão.
      let tarefaTitulo: string | null = null;
      if (aConsultar.length > 0 && input.taskId) {
        const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, input.taskId));
        tarefaTitulo = t?.title ?? null;
      }
      const feitos = await Promise.all(aConsultar.map(async (item): Promise<ResultadoProduto> => {
        const queryId = queryIds.get(item.chave) as number;
        const base = { produto: item.chave, reaproveitado: false };
        let resultado: Awaited<ReturnType<typeof provedor.consultar>>;
        try {
          resultado = await provedor.consultar(documento, tipo, item);
        } catch (e) {
          const seguro = e instanceof ErroProvedorCredito ? e.mensagemSegura : 'Falha ao consultar o provedor de crédito.';
          const detalhe = (e instanceof ErroProvedorCredito ? e.detalhe : e instanceof Error ? e.name : 'erro').slice(0, 500);
          console.error(`[credito] consulta falhou provedor=${provedor.nome} produto=${item.chave} query=${queryId}: ${detalhe}`);
          await db.update(creditQueries).set({ status: 'ERRO', erro: detalhe, finalizadoEm: new Date() }).where(eq(creditQueries.id, queryId));
          return { ...base, ok: false, cobrado: false, custoReais: 0, erro: seguro };
        }
        const { relatorio, bruto } = resultado;
        const { veredito, motivos } = calcularVeredito(relatorio);
        const custo = simulado ? 0 : (item.custoReais ?? 0);
        try {
          const [row] = await db.insert(creditReports).values({
            documento, tipo, taskId: input.taskId ?? null,
            razaoSocial: relatorio.cadastro.razaoSocial ?? pedido?.razaoSocial ?? tarefaTitulo ?? null,
            municipio: relatorio.cadastro.municipio ?? pedido?.cidade ?? null,
            uf: relatorio.cadastro.uf ?? pedido?.uf ?? null,
            provedor: provedor.nome, produto: item.chave,
            consultadoEm: new Date(relatorio.consultadoEm),
            relatorio, payloadBruto: bruto ?? null, veredito, motivos, score: relatorio.score.valor,
            custoReais: custo, consultadoPorUserId: ctx.user.id, motivo: input.motivo,
          }).returning();
          await db.update(creditQueries).set({ status: 'OK', reportId: row.id, custoReais: custo, finalizadoEm: new Date() })
            .where(eq(creditQueries.id, queryId));
          if (input.pedidoId) await vincularRelatorioAoPedido(row.id, input.pedidoId, ctx.user.id, 'CONSULTA_NO_PEDIDO');
          return { ...base, ok: true, cobrado: true, custoReais: custo, id: row.id, consultadoEm: row.consultadoEm, veredito: comoVeredito(row.veredito) };
        } catch (e) {
          console.error(`[credito] relatório pago NÃO gravado produto=${item.chave} query=${queryId}:`, e instanceof Error ? e.name : 'erro');
          await db.update(creditQueries).set({ status: 'ERRO', custoReais: custo, erro: 'Consulta feita, mas o relatório não foi gravado', finalizadoEm: new Date() })
            .where(eq(creditQueries.id, queryId)).catch(() => undefined);
          return { ...base, ok: false, cobrado: true, custoReais: custo, erro: 'A consulta foi feita e cobrada, mas não foi possível gravar o relatório. Avise o suporte antes de repetir.' };
        }
      }));
      for (const f of feitos) resultadoDe.set(f.produto, f);

      // 6) Resultado parcial CLARO: nunca esconde uma cobrança que ocorreu.
      const resultados = itens.flatMap((i) => resultadoDe.get(i.chave) ?? []);
      const resumo = resumirResultados(resultados);
      if (resumo.falhouSemCobranca) {
        throw new TRPCError({ code: 'BAD_GATEWAY', message: resultados.map((r) => `${nomeDoProduto(r.produto)}: ${r.erro ?? 'falhou'}`).join(' | ') });
      }
      const oks = resultados.filter((r) => r.ok);
      return {
        resultados,
        custoCobradoReais: resumo.custoCobradoReais,
        parcial: resumo.parcial,
        veredito: piorVeredito(oks.flatMap((r) => r.veredito ?? [])),
        // Compatibilidade com o contrato antigo (um relatório só): id do primeiro relatório obtido.
        id: oks[0]?.id ?? null,
        reaproveitado: oks.length > 0 && oks.every((r) => r.reaproveitado),
      };
    }),

  historico: staffProcedure
    .input(z.object({ documento: documentoInput }))
    .query(async ({ input }) => {
      const documento = input.documento.replace(/\D/g, '');
      return db.select({
        id: creditQueries.id, status: creditQueries.status, reportId: creditQueries.reportId, custoReais: creditQueries.custoReais,
        erro: creditQueries.erro, iniciadoEm: creditQueries.iniciadoEm, finalizadoEm: creditQueries.finalizadoEm, usuario: users.name,
      }).from(creditQueries).leftJoin(users, eq(users.id, creditQueries.userId))
        .where(eq(creditQueries.documento, documento)).orderBy(desc(creditQueries.iniciadoEm)).limit(100);
    }),

  listar: staffProcedure
    .input(z.object({
      busca: z.string().max(100).optional(), documento: z.string().max(30).optional(),
      uf: z.string().max(2).optional(), municipio: z.string().max(100).optional(),
      veredito: z.enum(['APROVADO', 'COM_RESTRICAO', 'REPROVADO_A_PRAZO']).optional(),
      de: z.date().optional(), ate: z.date().optional(),
      pagina: z.number().int().min(1).default(1), porPagina: z.number().int().min(1).max(POR_PAGINA_MAX).default(20),
    }))
    .query(async ({ input }) => {
      const f = montarFiltrosListagem(input);
      const dobrado = sql`lower(translate(coalesce(r.razao_social, '') || ' ' || coalesce(r.municipio, ''), ${SQL_ACENTOS}, ${SQL_SEM_ACENTOS}))`;
      const conds: SQL[] = [sql`true`];
      // Com o provedor real ligado, relatórios de teste (simulados, dados fictícios) não aparecem no arquivo.
      if (getProvedorCredito().nome !== 'simulado') conds.push(sql`r.provedor <> 'simulado'`);
      for (const t of f.termosTexto) conds.push(sql`position(${t}::text in ${dobrado}) > 0`);
      if (f.digitosBusca) conds.push(sql`position(${f.digitosBusca}::text in r.documento) > 0`);
      if (f.documento) conds.push(sql`r.documento = ${f.documento}::text`);
      if (f.uf) conds.push(sql`upper(r.uf) = ${f.uf}::text`);
      if (f.municipioFold) conds.push(sql`position(${f.municipioFold}::text in lower(translate(coalesce(r.municipio, ''), ${SQL_ACENTOS}, ${SQL_SEM_ACENTOS}))) > 0`);
      if (f.veredito) conds.push(sql`r.veredito = ${f.veredito}::text`);
      if (f.de) conds.push(sql`r.consultado_em >= ${f.de.toISOString()}::timestamptz`);
      if (f.ate) conds.push(sql`r.consultado_em <= ${f.ate.toISOString()}::timestamptz`);
      const where = sql.join(conds, sql` AND `);
      const [itens, total] = await Promise.all([
        db.execute(sql`
          SELECT r.id, r.documento, r.razao_social, r.municipio, r.uf, r.score, r.veredito, r.consultado_em, r.custo_reais, r.produto, r.provedor,
                 u.name AS consultado_por,
                 (SELECT count(*)::int FROM credit_report_links l WHERE l.report_id = r.id) AS pedidos_vinculados
          FROM credit_reports r LEFT JOIN users u ON u.id = r.consultado_por_user_id
          WHERE ${where}
          ORDER BY r.consultado_em DESC, r.id DESC
          LIMIT ${f.limite}::integer OFFSET ${f.offset}::integer`),
        db.execute(sql`SELECT count(*)::int AS n FROM credit_reports r WHERE ${where}`),
      ]);
      type Linha = {
        id: number; documento: string; razao_social: string | null; municipio: string | null; uf: string | null;
        score: number | null; veredito: string; consultado_em: Date | string; custo_reais: number | null;
        consultado_por: string | null; pedidos_vinculados: number; produto: string | null; provedor: string;
      };
      return {
        total: Number((total.rows[0] as { n?: number } | undefined)?.n ?? 0),
        itens: (itens.rows as unknown as Linha[]).map((l) => ({
          id: l.id, documento: l.documento, razaoSocial: l.razao_social, municipio: l.municipio, uf: l.uf, score: l.score,
          veredito: comoVeredito(l.veredito), consultadoEm: new Date(l.consultado_em), consultadoPor: l.consultado_por,
          custoReais: l.custo_reais, pedidosVinculados: l.pedidos_vinculados,
          produto: chaveDoProdutoGravado(l.produto, l.provedor), produtoNome: nomeDoProduto(l.produto, l.provedor),
        })),
      };
    }),

  porPedido: protectedProcedure
    .input(z.object({ pedidoId: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const [pedido] = await db.select({ id: fatOrders.id, cnpj: fatOrders.cnpj, sellerId: fatOrders.sellerId })
        .from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!pedido) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      if (!ehStaff(ctx.user.role)) {
        const sid = await sellerIdDoUsuario(ctx.user.id);
        if (sid === null || pedido.sellerId !== sid) throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
      }
      const vinculados = await db.execute(sql`
        SELECT r.id, r.consultado_em, r.veredito, r.score, l.origem
        FROM credit_report_links l JOIN credit_reports r ON r.id = l.report_id
        WHERE l.pedido_id = ${input.pedidoId}::text ORDER BY r.consultado_em DESC, r.id DESC`);
      type L = { id: number; consultado_em: Date | string; veredito: string; score: number | null; origem: string };
      const lista = (vinculados.rows as unknown as L[]).map((l) => ({
        id: l.id, consultadoEm: new Date(l.consultado_em), veredito: comoVeredito(l.veredito), score: l.score, origem: l.origem, vinculado: true,
      }));
      const doc = pedido.cnpj.replace(/\D/g, '');
      const ultimo = doc ? await ultimoRelatorioDoDocumento(doc) : null;
      const semVinculo = ultimo && !lista.some((l) => l.id === ultimo.id)
        ? { id: ultimo.id, consultadoEm: ultimo.consultadoEm, veredito: comoVeredito(ultimo.veredito), score: ultimo.score, origem: null, vinculado: false }
        : null;
      return { vinculados: lista, ultimoDoCnpj: semVinculo };
    }),

  vincular: adminProcedure
    .input(z.object({ reportId: z.number().int(), pedidoId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await db.select({ id: creditReports.id }).from(creditReports).where(eq(creditReports.id, input.reportId));
      const [p] = await db.select({ id: fatOrders.id }).from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!r || !p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório ou pedido não encontrado' });
      const criado = await vincularRelatorioAoPedido(input.reportId, input.pedidoId, ctx.user.id, 'MANUAL');
      console.log(`[credito] vincular relatorio=${input.reportId} pedido=${input.pedidoId} criado=${criado} por=user#${ctx.user.id}`);
      return { ok: true, criado };
    }),

  desvincular: adminProcedure
    .input(z.object({ reportId: z.number().int(), pedidoId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const removidos = await desvincularRelatorioDoPedido(input.reportId, input.pedidoId);
      console.log(`[credito] desvincular relatorio=${input.reportId} pedido=${input.pedidoId} removidos=${removidos} por=user#${ctx.user.id}`);
      return { ok: true, removidos };
    }),

  setBloqueioAtivo: adminProcedure
    .input(z.object({ ativo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const auditoria = { atualizadoPorUserId: ctx.user.id, atualizadoPorNome: ctx.user.name, atualizadoEm: new Date() };
      await db.insert(creditSettings).values({ id: 1, bloqueioAtivo: input.ativo, ...auditoria })
        .onConflictDoUpdate({ target: creditSettings.id, set: { bloqueioAtivo: input.ativo, ...auditoria } });
      console.log(`[credito] bloqueio_ativo=${input.ativo} por=user#${ctx.user.id}`);
      return { ok: true, bloqueioAtivo: input.ativo };
    }),

  setLimiteMensal: adminProcedure
    .input(z.object({ limite: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (!limiteMensalValido(input.limite)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Limite mensal deve ser um inteiro entre 0 e 10000' });
      const auditoria = { atualizadoPorUserId: ctx.user.id, atualizadoPorNome: ctx.user.name, atualizadoEm: new Date() };
      await db.insert(creditSettings).values({ id: 1, limiteMensal: input.limite, ...auditoria })
        .onConflictDoUpdate({ target: creditSettings.id, set: { limiteMensal: input.limite, ...auditoria } });
      console.log(`[credito] limite_mensal=${input.limite} por=user#${ctx.user.id}`);
      return { ok: true, limiteMensal: input.limite };
    }),

  /** Limites de gasto: contagem mensal de consultas e teto em reais por consulta. Informe ao menos um. */
  setLimites: adminProcedure
    .input(z.object({ limiteMensal: z.number().int().optional(), tetoPorConsultaReais: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.limiteMensal === undefined && input.tetoPorConsultaReais === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe o limite mensal e/ou o teto por consulta' });
      }
      if (input.limiteMensal !== undefined && !limiteMensalValido(input.limiteMensal)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Limite mensal deve ser um inteiro entre 0 e 10000' });
      }
      if (input.tetoPorConsultaReais !== undefined && !tetoPorConsultaValido(input.tetoPorConsultaReais)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'O teto por consulta deve ser maior que zero e no máximo R$ 1.000,00' });
      }
      const campos = {
        ...(input.limiteMensal !== undefined ? { limiteMensal: input.limiteMensal } : {}),
        ...(input.tetoPorConsultaReais !== undefined ? { tetoPorConsultaReais: input.tetoPorConsultaReais } : {}),
      };
      const auditoria = { atualizadoPorUserId: ctx.user.id, atualizadoPorNome: ctx.user.name, atualizadoEm: new Date() };
      await db.insert(creditSettings).values({ id: 1, ...campos, ...auditoria })
        .onConflictDoUpdate({ target: creditSettings.id, set: { ...campos, ...auditoria } });
      console.log(`[credito] limites ${JSON.stringify(campos)} por=user#${ctx.user.id}`);
      return { ok: true, ...(await lerConfigCredito()) };
    }),

  liberarPedido: adminProcedure
    .input(z.object({ pedidoId: z.string().min(1).max(100), motivo: z.string().trim().min(5).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.update(fatOrders).set({
        creditoLiberadoPor: ctx.user.name, creditoLiberadoEm: new Date().toISOString(), creditoLiberadoMotivo: input.motivo,
      }).where(eq(fatOrders.id, input.pedidoId)).returning({ id: fatOrders.id });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      console.log(`[credito] liberarPedido pedido=${input.pedidoId} por=user#${ctx.user.id}`);
      return { ok: true };
    }),

  saldo: adminProcedure.query(async () => {
    const provedor = getProvedorCredito();
    if (provedor.nome === 'simulado') return { saldo: null as number | null, simulado: true, bruto: null };
    try {
      const s = await consultarSaldoApiFull();
      return { saldo: s.saldo, simulado: false, bruto: s.bruto as Record<string, string | number | boolean | null> | null };
    } catch (e) {
      if (e instanceof ErroProvedorCredito) {
        console.error(`[credito] saldo falhou: ${e.detalhe}`);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: e.mensagemSegura });
      }
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível consultar o saldo.' });
    }
  }),

  pdf: staffProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      const [autor] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.consultadoPorUserId));
      try {
        // Sempre regenerado a partir do relatório gravado (determinístico); nada de binário no banco.
        const buf = await gerarPdfCredito(row.relatorio, {
          veredito: comoVeredito(row.veredito), motivos: row.motivos, consultadoPor: autor?.name ?? null,
        }, row.payloadBruto);
        const dia = row.consultadoEm.toISOString().slice(0, 10).replace(/-/g, '');
        return { nomeArquivo: `analise-credito-${row.documento}-${dia}.pdf`, base64: buf.toString('base64') };
      } catch (e) {
        console.error('[credito] pdf falhou:', e instanceof Error ? e.message : 'erro');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar o PDF.' });
      }
    }),
});
