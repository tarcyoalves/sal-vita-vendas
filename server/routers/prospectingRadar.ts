// Radar de Cargas — prospecção para completar a carreta (CRM de Lembretes).
// Visão geral e decisões: PLANO-RADAR-CARGAS.md. Contrato de tipos: shared/radar.ts.
//
// Pertence só ao CRM: usa `db` (DATABASE_URL). Nada aqui toca o banco do Premium.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { searchMunicipios } from '../lib/radar/geo';
import {
  RADAR_SEGMENT_KEYS,
  RADAR_MAX_RADIUS_KM,
  type RadarMunicipality,
  type RadarSearchResult,
  type RadarCnpjCheck,
} from '../../shared/radar';

const UF = z.string().length(2).transform((s) => s.toUpperCase());
const CNPJ = z.string().transform((s) => s.replace(/\D/g, '')).pipe(z.string().length(14));
const BAGS = z.number().int().min(1).max(2000);

function notImplemented(): never {
  throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Radar de Cargas em construção' });
}

export const prospectingRadarRouter = router({
  // Autocomplete da cidade da carga. Sempre devolve o código IBGE: há nomes
  // repetidos entre estados (Barracão existe no PR e no RS).
  municipalities: protectedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(60), uf: UF.optional() }))
    .query(({ input }): RadarMunicipality[] =>
      searchMunicipios(input.q, input.uf).map(({ ibge, nome, uf }) => ({ ibge, nome, uf })),
    ),

  search: protectedProcedure
    .input(z.object({
      originIbge: z.number().int(),
      radiusKm: z.number().int().min(1).max(RADAR_MAX_RADIUS_KM),
      segments: z.array(z.enum(RADAR_SEGMENT_KEYS)).min(1),
      includeSecondary: z.boolean().default(false),
    }))
    .query(async (): Promise<RadarSearchResult> => notImplemented()),

  // Confirma na hora, na Receita (via BrasilAPI), se o CNPJ continua ativo — a base
  // importada pode ter até um mês de atraso.
  verifyCnpj: protectedProcedure
    .input(z.object({ cnpj: CNPJ }))
    .mutation(async (): Promise<RadarCnpjCheck> => notImplemented()),

  draftMessage: protectedProcedure
    .input(z.object({
      cnpj: CNPJ,
      originIbge: z.number().int(),
      bags: BAGS,
      loadDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      freightNote: z.string().trim().max(200).optional(),
    }))
    .mutation(async (): Promise<{ message: string; provider: string }> => notImplemented()),

  // Transforma o lead aprovado pelo atendente em tarefa do CRM (tabela `tasks`).
  convert: protectedProcedure
    .input(z.object({
      cnpj: CNPJ,
      originIbge: z.number().int(),
      bags: BAGS,
      message: z.string().trim().max(2000).optional(),
      phoneDigits: z.string().regex(/^\d{10,11}$/).optional(),
      // Obrigatório quando o lead já foi excluído do CRM antes (task_deletion_logs):
      // o atendente viu o motivo e decidiu seguir mesmo assim.
      acknowledgeExcluded: z.boolean().optional(),
    }))
    .mutation(async (): Promise<{ taskId: number }> => notImplemented()),
});
