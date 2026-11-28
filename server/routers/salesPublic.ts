// Oferta pública da página /atacado (Sal Vita Sales AI): preço do catálogo, disponibilidade,
// referência do Mercado Livre e simulador de revenda. Só leitura.
//
// publicProcedure de propósito: são dados que já aparecem para qualquer visitante da página
// (preço do site, referência do ML vigente, simulação de conta). Nada de cliente, nada de
// configuração interna: `montarOferta` devolve só os campos listados e é coberta por teste.
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { CATALOG } from './shipping';
import { getSalesSettings } from '../lib/sales/settings';
import { montarOferta } from '../../shared/salesOferta';
import { SIMULADOR_MAX_CAIXAS, simularRevenda } from '../../shared/salesSimulador';

const CENTAVOS_MAX = 100_000_000;

export const salesPublicRouter = router({
  // publicProcedure: leitura da oferta que a própria página exibe.
  oferta: publicProcedure.query(async () => {
    const settings = await getSalesSettings();
    return montarOferta(CATALOG.caixa, settings);
  }),

  // publicProcedure: conta pura sobre números enviados pelo visitante; não lê nem grava dado de cliente.
  simularRevenda: publicProcedure
    .input(z.object({
      quantidadeCaixas: z.number().int().min(1).max(SIMULADOR_MAX_CAIXAS),
      precoRevendaPorPacoteCentavos: z.number().int().min(0).max(CENTAVOS_MAX),
      freteCentavos: z.number().int().min(0).max(CENTAVOS_MAX),
      despesasCentavos: z.number().int().min(0).max(CENTAVOS_MAX),
    }))
    .query(async ({ input }) => {
      const { simuladorRevenda } = await getSalesSettings();
      if (!simuladorRevenda.ativo) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'O simulador de revenda não está ativo.' });
      }
      return simularRevenda(input, Math.round(CATALOG.caixa.price * 100));
    }),
});
