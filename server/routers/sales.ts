// Painel "Vendas B2B" do admin da loja (Sal Vita Sales AI). Só admin da loja (premiumAdminProcedure).
// Regras de decisão ficam em salesRegras.ts (puras e testadas); aqui só entrada, auditoria e erros.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, premiumAdminProcedure } from '../trpc';
import { ordersDb } from '../db/ordersDb';
import { auditLogs } from '../db/schema';
import {
  JOURNEY_STATES, SALES_MODES, SALES_SETTINGS_SCHEMAS, type SalesSettingKey, type SalesSettings,
} from '../../shared/sales';
import { getSalesSettings, getSalesSetting, setSalesSetting } from '../lib/sales/settings';
import {
  NaoImplementado, OperacaoRecusada, obterPainel, definirModo, executarCiclo, listarLote, aprovarLote, cortarDoLote,
  listarJornadas, pausarJornada, retomarJornada, suprimirContato, listarExcecoes, resolverExcecao,
  listarDesconhecidas, resolverDesconhecida, relatorio,
} from '../lib/sales/operacoes';
import {
  KB_KINDS, listarKb, salvarKbItem, aprovarKbItem, arquivarKbItem, importarKb, listarConversas, obterConversa,
} from '../lib/sales/agente/kb';
// Import em namespace de propósito: `revogarReservas` está sendo adicionada em acoes.ts por outra frente.
// Enquanto ela não existir, a chamada abaixo é pulada (com aviso no log) e o arquivo compila igual.
import * as acoes from '../lib/sales/acoes';
import {
  erroEscalonamentoModo, pendenciasAtivacaoCanal, prepararModeloEmail, validarImportacaoKb, KB_CONTENT_MAX,
} from './salesRegras';

const CHAVES = Object.keys(SALES_SETTINGS_SCHEMAS) as [SalesSettingKey, ...SalesSettingKey[]];

/** Canal desligado ou política desaprovada: nenhuma reserva já entregue ao executor pode continuar valendo. */
export function canalFechado(c: Pick<SalesSettings['canal'], 'ativo' | 'politicaAprovada'>): boolean {
  return c.ativo === false || c.politicaAprovada === false;
}


type Ator = { kind: 'premium'; email: string; name: string; id: null } | { kind: 'crm'; email: string; name: string; id: number };

/** Quem fez a ação, em texto legível (vai para updated_by, aprovadoPor e auditoria). */
function por(a: Ator): string {
  return a.kind === 'premium' ? `loja:${a.email}` : `crm:${a.name}`;
}

async function auditar(a: Ator, entityType: string, entityId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await ordersDb.insert(auditLogs).values({
      entityType, entityId, action, actorType: 'human',
      actorId: a.id === null ? 'premium-admin' : String(a.id),
      metadataJson: { ...metadata, byName: a.name },
    });
  } catch (e) {
    // A gravação já aconteceu: não derrubar a tela (o admin repetiria a ação). O log da Vercel registra.
    console.error('[sales] falha ao gravar auditoria', action, e instanceof Error ? e.message : e);
  }
}

/** Operação ainda não implementada vira aviso "em construção" em vez de erro 500. */
async function seguro<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NaoImplementado) {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Esta parte do painel ainda está em construção.' });
    }
    // Recusa de regra de negócio (ex.: mensagem já despachada não pode ser cortada): mensagem para o dono.
    if (e instanceof OperacaoRecusada) {
      throw new TRPCError({ code: 'CONFLICT', message: e.message });
    }
    throw e;
  }
}

const motivoSchema = z.string().trim().min(3, 'Escreva o motivo (mínimo 3 letras)').max(500);
const paginaSchema = { pagina: z.number().int().min(1).max(10_000).default(1), porPagina: z.number().int().min(1).max(100).default(25) };
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

export const salesRouter = router({
  painel: premiumAdminProcedure.query(() => seguro(() => obterPainel())),

  settingsLer: premiumAdminProcedure.query(() => getSalesSettings()),

  settingsSalvar: premiumAdminProcedure
    .input(z.object({ key: z.enum(CHAVES), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const { key } = input;
      if (key === 'modo') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Para mudar o modo use o botão de modo (ele revoga reservas e registra o motivo).' });
      }
      const parsed = SALES_SETTINGS_SCHEMAS[key].safeParse(input.value);
      if (!parsed.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Valor inválido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || key}: ${i.message}`).join('; ')}` });
      }
      let valor = parsed.data as SalesSettings[Exclude<SalesSettingKey, 'modo'>];
      const antes = await getSalesSetting(key);

      if (key === 'canal') {
        const faltas = pendenciasAtivacaoCanal(valor as SalesSettings['canal']);
        if (faltas.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `Não dá para ligar o canal: ${faltas.join('; ')}.` });
      }
      if (key === 'modeloEmail') {
        const r = prepararModeloEmail(valor as SalesSettings['modeloEmail'], antes as SalesSettings['modeloEmail'], por(ctx.actor), new Date());
        if (!r.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: `Modelo barrado: ${r.motivos.join(' | ')}` });
        valor = r.modelo;
      }

      const gravado = await setSalesSetting(key, valor, por(ctx.actor));
      await auditar(ctx.actor, 'sales_setting', null, `setting_${key}`, { key, antes, depois: gravado });
      // Depois de gravar (reservas novas já param): revoga as que o executor ainda tem em mãos.
      if (key === 'canal' && canalFechado(gravado as SalesSettings['canal'])) {
        await acoes.revogarReservas('canal fechado no painel', por(ctx.actor));
      }
      return { key, value: gravado };
    }),

  definirModo: premiumAdminProcedure
    .input(z.object({
      modo: z.enum(SALES_MODES),
      motivo: z.string().trim().max(500).default(''),
      confirmo: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const erro = erroEscalonamentoModo(input.modo, input.confirmo, input.motivo);
      if (erro) throw new TRPCError({ code: 'BAD_REQUEST', message: erro });
      const r = await seguro(() => definirModo(input.modo, por(ctx.actor), input.motivo || undefined));
      await auditar(ctx.actor, 'sales_mode', null, 'mode_changed', { modo: r.modo, motivo: input.motivo, reservasRevogadas: r.reservasRevogadas });
      return r;
    }),

  ciclo: premiumAdminProcedure
    .input(z.object({ simular: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const r = await seguro(() => executarCiclo({ por: por(ctx.actor), simular: input.simular }));
      if (!input.simular) await auditar(ctx.actor, 'sales_cycle', null, 'cycle_run', { loteId: r.loteId, mensagensGeradas: r.mensagensGeradas });
      return r;
    }),

  lote: premiumAdminProcedure
    .input(z.object({ loteId: z.number().int().optional() }).optional())
    .query(({ input }) => seguro(() => listarLote(input?.loteId))),

  aprovarLote: premiumAdminProcedure
    .input(z.object({ loteId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const r = await seguro(() => aprovarLote(input.loteId, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_batch', input.loteId, 'batch_approved', { aprovadas: r.aprovadas });
      return r;
    }),

  cortarDoLote: premiumAdminProcedure
    .input(z.object({ messageId: z.number().int(), motivo: motivoSchema }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => cortarDoLote(input.messageId, por(ctx.actor), input.motivo));
      await auditar(ctx.actor, 'sales_message', input.messageId, 'batch_item_cut', { motivo: input.motivo });
      return { ok: true };
    }),

  jornadas: premiumAdminProcedure
    .input(z.object({ estado: z.enum(JOURNEY_STATES).optional(), busca: z.string().trim().max(120).optional(), ...paginaSchema }))
    .query(({ input }) => seguro(() => listarJornadas(input))),

  pausarJornada: premiumAdminProcedure
    .input(z.object({ journeyId: z.number().int(), motivo: motivoSchema }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => pausarJornada(input.journeyId, input.motivo, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_journey', input.journeyId, 'journey_paused', { motivo: input.motivo });
      return { ok: true };
    }),

  retomarJornada: premiumAdminProcedure
    .input(z.object({ journeyId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => retomarJornada(input.journeyId, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_journey', input.journeyId, 'journey_resumed', {});
      return { ok: true };
    }),

  suprimir: premiumAdminProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email().max(200), motivo: motivoSchema }))
    .mutation(async ({ ctx, input }) => {
      const r = await seguro(() => suprimirContato(input.email, input.motivo, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_suppression', null, 'contact_suppressed', { email: input.email, motivo: input.motivo, ok: r.ok, falhas: r.falhas });
      return r;
    }),

  excecoes: premiumAdminProcedure
    .input(z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open'), ...paginaSchema }))
    .query(({ input }) => seguro(() => listarExcecoes(input))),

  resolverExcecao: premiumAdminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(['resolved', 'dismissed']), resolucao: motivoSchema }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => resolverExcecao(input.id, { status: input.status, resolucao: input.resolucao }, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_exception', input.id, `exception_${input.status}`, { resolucao: input.resolucao });
      return { ok: true };
    }),

  desconhecidas: premiumAdminProcedure.query(() => seguro(() => listarDesconhecidas())),

  resolverDesconhecida: premiumAdminProcedure
    .input(z.object({ messageId: z.number().int(), decisao: z.enum(['foi_enviada', 'nao_foi_enviada']) }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => resolverDesconhecida(input.messageId, input.decisao, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_message', input.messageId, 'unknown_resolved', { decisao: input.decisao });
      return { ok: true };
    }),

  relatorio: premiumAdminProcedure
    .input(z.object({ de: dataSchema, ate: dataSchema }))
    .query(({ input }) => seguro(() => relatorio(input))),

  // ── Vendedor virtual: base de conhecimento ──────────────────────────────────────────────
  kbListar: premiumAdminProcedure.query(() => seguro(() => listarKb())),

  kbSalvar: premiumAdminProcedure
    .input(z.object({
      id: z.number().int().optional(),
      kind: z.enum(KB_KINDS),
      key: z.string().trim().min(2).max(80),
      title: z.string().trim().min(2).max(200),
      content: z.string().trim().min(1).max(KB_CONTENT_MAX),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await seguro(() => salvarKbItem(input, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_kb', item.id, input.id ? 'kb_edited' : 'kb_created', { key: item.key, versao: item.version });
      return item;
    }),

  kbAprovar: premiumAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const item = await seguro(() => aprovarKbItem(input.id, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_kb', input.id, 'kb_approved', { key: item.key, versao: item.version });
      return item;
    }),

  kbArquivar: premiumAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await seguro(() => arquivarKbItem(input.id, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_kb', input.id, 'kb_archived', {});
      return { ok: true };
    }),

  kbImportar: premiumAdminProcedure
    .input(z.object({ itens: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const v = validarImportacaoKb(input.itens);
      if (!v.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: `JSON inválido. ${v.erros.join(' | ')}` });
      const r = await seguro(() => importarKb(v.itens, por(ctx.actor)));
      await auditar(ctx.actor, 'sales_kb', null, 'kb_imported', { total: v.itens.length, ...r });
      return r;
    }),

  conversas: premiumAdminProcedure
    .input(z.object({ soMarcadas: z.boolean().optional(), ...paginaSchema }))
    .query(({ input }) => seguro(() => listarConversas(input))),

  conversa: premiumAdminProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const c = await seguro(() => obterConversa(input.id));
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversa não encontrada.' });
      return c;
    }),
});
