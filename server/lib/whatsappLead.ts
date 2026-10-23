// Busca de lead para a extensão Vita Zap (WhatsApp Web): regras puras (sem banco), testáveis.
import { z } from 'zod';
import { normalizeBrPhone } from '../../shared/phone';
import { searchTerms } from '../../shared/searchText';

export const FIND_WHATSAPP_LIMITE = 20;
export const FIND_WHATSAPP_NOTAS_MAX = 500;

export const STOP_WORDS_BUSCA = new Set([
  'de', 'da', 'do', 'em', 'no', 'na', 'ao', 'os', 'as', 'um', 'se', 'com', 'por', 'para', 'dos', 'das',
]);

/** Extrai os termos relevantes de uma busca por frase, ignorando stop words se houver outros termos. */
export function extrairTermosBusca(q: string, max = 6): string[] {
  const todos = searchTerms(q, max).filter((t) => t.length >= 2);
  const uteis = todos.filter((t) => !STOP_WORDS_BUSCA.has(t));
  return uteis.length > 0 ? uteis : todos;
}

/** { phone?, q? }: pelo menos um preenchido; q de 2 a 100 caracteres (depois de aparar). */
export const findForWhatsappInput = z
  .object({
    phone: z.string().trim().max(40).optional(),
    q: z.string().trim().min(2, 'Busca com pelo menos 2 caracteres').max(100).optional(),
  })
  .refine((v) => !!v.phone || !!v.q, { message: 'Informe phone ou q' });

/**
 * Formas de gravar o mesmo celular no banco: DDD+número, com e sem o "9" extra, com e sem DDI 55.
 * O WhatsApp mostra números antigos sem o 9. `tasks.phone` guarda só dígitos sem 55 (create/update),
 * mas importações antigas podem ter o 55: por isso as duas formas.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  const base = normalizeBrPhone(raw); // 10 ou 11 dígitos, sem 55
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.length === 11 && base[2] === '9') out.add(base.slice(0, 2) + base.slice(3));
  if (base.length === 10) out.add(base.slice(0, 2) + '9' + base.slice(2));
  for (const v of [...out]) out.add(`55${v}`);
  return [...out];
}

/** Últimos `max` caracteres das notas (o fim é o mais recente: "Registrar contato" anexa ao final). */
export function trechoDasNotas(notes: string | null | undefined, max = FIND_WHATSAPP_NOTAS_MAX): string {
  const t = notes ?? '';
  return t.length > max ? t.slice(t.length - max) : t;
}
