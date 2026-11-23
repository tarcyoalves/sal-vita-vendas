// "Não enviar mais" e contato registrado do time, para a extensão Vita Zap (0.7.60, lote 2). Mesma autenticação do zapCrm
// (qualquer usuário logado: o opt-out e o contato valem para o time todo). Nada aqui guarda texto de mensagem.
// Sem polling: a extensão chama ao abrir o painel, antes de montar prévia/fila e antes de cada envio automático.
import { and, asc, gte, inArray, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { zapContatosEnviados, zapOptOuts, zapOptOutRemocoes } from '../db/schema';
import {
  casarContatados,
  casarOptOuts,
  chaveDoContato,
  consultarContatadosInput,
  dataDoEnvio,
  desmarcarOptOutsInput,
  LIMITE_LINHAS_CONSULTA,
  LIMITE_LISTA_OPT_OUT,
  marcarOptOutsInput,
  normalizarRef,
  prepararEnvios,
  registrarEnviosInput,
} from '../lib/zapContatos';

const dedup = <T>(xs: T[]): T[] => [...new Set(xs)];

export const MSG_OPT_OUT_PROTEGIDO = "Só quem marcou ou um gestor pode tirar este contato de 'Não enviar mais'.";

/** Staff (admin/gerente) tira qualquer um; os demais só os que eles mesmos marcaram. */
export function podeRemoverOptOut(papel: string, userId: number, alvo: Array<{ userId: number }>): boolean {
  if (papel === 'admin' || papel === 'manager') return true;
  return alvo.every((r) => r.userId === userId);
}

export const zapContatosRouter = router({
  /** Todos os "não enviar mais" do time. `truncado` = passou do limite e a lista pode estar incompleta. */
  listarOptOuts: protectedProcedure.query(async () => {
    const linhas = await db
      .select({
        chave: zapOptOuts.chave,
        telefone: zapOptOuts.telefone,
        nomeHash: zapOptOuts.nomeHash,
        nome: zapOptOuts.nome,
        userId: zapOptOuts.userId,
        origem: zapOptOuts.origem,
        criadoEm: zapOptOuts.criadoEm,
      })
      .from(zapOptOuts)
      .orderBy(asc(zapOptOuts.id))
      .limit(LIMITE_LISTA_OPT_OUT + 1);
    return { itens: linhas.slice(0, LIMITE_LISTA_OPT_OUT), truncado: linhas.length > LIMITE_LISTA_OPT_OUT, consultadoEm: new Date() };
  }),

  /** Marca "não enviar mais". Idempotente: quem já está na lista continua com quem marcou primeiro. */
  marcarOptOuts: protectedProcedure.input(marcarOptOutsInput).mutation(async ({ ctx, input }) => {
    const agora = new Date();
    const porChave = new Map<string, typeof zapOptOuts.$inferInsert>();
    for (const it of input.itens) {
      const ref = normalizarRef(it);
      const chave = chaveDoContato(ref.telefone, ref.nomeHash);
      if (porChave.has(chave)) continue;
      porChave.set(chave, { chave, telefone: ref.telefone, nomeHash: ref.nomeHash, nome: it.nome || null, userId: ctx.user.id, origem: it.origem, criadoEm: dataDoEnvio(it.marcadoEm, agora) ?? agora });
    }
    const linhas = [...porChave.values()];
    const criadas = await db.insert(zapOptOuts).values(linhas).onConflictDoNothing({ target: zapOptOuts.chave }).returning({ id: zapOptOuts.id });
    return { recebidos: linhas.length, criados: criadas.length };
  }),

  /**
   * Tira do "não enviar mais" (desfazer). Casa por telefone OU hash do nome; devolve quantos saíram.
   * Só staff (admin/gerente) ou QUEM MARCOU pode tirar um contato: um atendente não desfaz o opt-out de outro
   * (pedido de "não me mande mais" é compromisso do time). Se algum contato casado foi marcado por outra pessoa,
   * nada é removido. Cada remoção grava auditoria em zap_opt_out_remocoes.
   */
  desmarcarOptOuts: protectedProcedure.input(desmarcarOptOutsInput).mutation(async ({ ctx, input }) => {
    const refs = input.itens.map(normalizarRef);
    const telefones = dedup(refs.flatMap((r) => (r.telefone ? [r.telefone] : [])));
    const semTelefone = dedup(refs.filter((r) => !r.telefone).map((r) => r.nomeHash));
    const comTelefone = dedup(refs.filter((r) => r.telefone).map((r) => r.nomeHash));
    // Telefone conhecido dos dois lados: vale o telefone. Sem telefone numa das pontas: vale o hash do nome.
    const condicoes = [
      ...(telefones.length > 0 ? [inArray(zapOptOuts.telefone, telefones)] : []),
      ...(comTelefone.length > 0 ? [and(inArray(zapOptOuts.nomeHash, comTelefone), sql`${zapOptOuts.telefone} IS NULL`)] : []),
      ...(semTelefone.length > 0 ? [inArray(zapOptOuts.nomeHash, semTelefone)] : []),
    ];
    if (condicoes.length === 0) return { removidos: 0 };
    const alvo = await db
      .select({ id: zapOptOuts.id, chave: zapOptOuts.chave, telefone: zapOptOuts.telefone, nomeHash: zapOptOuts.nomeHash, userId: zapOptOuts.userId })
      .from(zapOptOuts)
      .where(or(...condicoes))
      .limit(LIMITE_LINHAS_CONSULTA);
    if (alvo.length === 0) return { removidos: 0 };
    if (!podeRemoverOptOut(ctx.user.role, ctx.user.id, alvo)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_OPT_OUT_PROTEGIDO });
    }
    const removidos = await db.delete(zapOptOuts).where(inArray(zapOptOuts.id, alvo.map((r) => r.id))).returning({ id: zapOptOuts.id });
    const removidosIds = new Set(removidos.map((r) => r.id));
    const auditoria = alvo.filter((r) => removidosIds.has(r.id)).map((r) => ({
      chave: r.chave, telefone: r.telefone, nomeHash: r.nomeHash,
      marcadoPorUserId: r.userId, removidoPorUserId: ctx.user.id, removidoPorPapel: ctx.user.role,
    }));
    if (auditoria.length > 0) {
      // A remoção já aconteceu; a falha de auditoria é registrada (sem dados do contato) e não desfaz o pedido do usuário.
      try { await db.insert(zapOptOutRemocoes).values(auditoria); }
      catch (e) { console.error('[zap-contatos] auditoria de remoção de opt-out falhou:', (e as Error)?.message); }
    }
    return { removidos: removidos.length };
  }),

  /** Registra que ALGUÉM do time enviou uma mensagem a estes contatos (tipo e data; nunca o texto). Guarda só o mais recente de cada tipo. */
  registrarEnvios: protectedProcedure.input(registrarEnviosInput).mutation(async ({ ctx, input }) => {
    const linhas = prepararEnvios(input.itens, new Date());
    if (linhas.length === 0) return { recebidos: input.itens.length, gravados: 0 };
    await db
      .insert(zapContatosEnviados)
      .values(linhas.map((l) => ({ chave: l.chave, telefone: l.telefone, nomeHash: l.nomeHash, userId: ctx.user.id, tipo: l.tipo, enviadoEm: l.enviadoEm })))
      .onConflictDoUpdate({
        target: [zapContatosEnviados.chave, zapContatosEnviados.tipo],
        set: {
          // Só avança no tempo: um envio antigo reenviado (migração) nunca apaga um mais novo.
          userId: sql`CASE WHEN excluded.enviado_em > ${zapContatosEnviados.enviadoEm} THEN excluded.user_id ELSE ${zapContatosEnviados.userId} END`,
          enviadoEm: sql`GREATEST(excluded.enviado_em, ${zapContatosEnviados.enviadoEm})`,
          telefone: sql`COALESCE(${zapContatosEnviados.telefone}, excluded.telefone)`,
        },
      });
    return { recebidos: input.itens.length, gravados: linhas.length };
  }),

  /** "Contatado nos últimos N dias?" em lote, por QUALQUER atendente. Devolve só quem foi contatado (`i` = posição na lista enviada). */
  consultarContatados: protectedProcedure.input(consultarContatadosInput).query(async ({ ctx, input }) => {
    const agora = new Date();
    const desde = new Date(agora.getTime() - input.dias * 86_400_000);
    const refs = input.contatos.map(normalizarRef);
    const telefones = dedup(refs.flatMap((r) => (r.telefone ? [r.telefone] : [])));
    const hashes = dedup(refs.map((r) => r.nomeHash));
    const linhas = await db
      .select({ telefone: zapContatosEnviados.telefone, nomeHash: zapContatosEnviados.nomeHash, tipo: zapContatosEnviados.tipo, enviadoEm: zapContatosEnviados.enviadoEm, userId: zapContatosEnviados.userId })
      .from(zapContatosEnviados)
      .where(and(gte(zapContatosEnviados.enviadoEm, desde), or(...(telefones.length > 0 ? [inArray(zapContatosEnviados.telefone, telefones)] : []), inArray(zapContatosEnviados.nomeHash, hashes))))
      .limit(LIMITE_LINHAS_CONSULTA + 1);
    let optOuts: ReturnType<typeof casarOptOuts> | undefined;
    if (input.incluirOptOut) {
      const bloqueados = await db
        .select({ telefone: zapOptOuts.telefone, nomeHash: zapOptOuts.nomeHash, origem: zapOptOuts.origem, userId: zapOptOuts.userId })
        .from(zapOptOuts)
        .where(or(...(telefones.length > 0 ? [inArray(zapOptOuts.telefone, telefones)] : []), inArray(zapOptOuts.nomeHash, hashes)))
        .limit(LIMITE_LINHAS_CONSULTA);
      optOuts = casarOptOuts(refs, bloqueados, ctx.user.id);
    }
    return {
      itens: casarContatados(refs, linhas.slice(0, LIMITE_LINHAS_CONSULTA), ctx.user.id),
      truncado: linhas.length > LIMITE_LINHAS_CONSULTA,
      consultadoEm: agora,
      dias: input.dias,
      ...(optOuts ? { optOuts } : {}),
    };
  }),
});

export type ZapContatosRouter = typeof zapContatosRouter;
