// Aviso de "histórico sumindo" (v0.7.59). Regra PURA.
//
// O WhatsApp Web só guarda ~25–40 dias de histórico. Quem está entre a etapa 1 da reativação (padrão 25 dias sem conversa) e
// etapa 1 + 5 dias, e AINDA NÃO foi lido pela reativação, corre o risco de ter a conversa sumindo do WhatsApp Web antes de a IA
// poder resumi-la para o CRM. O service worker (alarme diário, sem abrir o WhatsApp) conta esses contatos só com o que já está
// salvo localmente (a última varredura e os registros da reativação).

import type { ContatoVarrido } from './contatos';
import { formatarDataBr, somarDias, type DataIso } from './datas';
import type { ContextoFiltro } from './filtros';
import { candidatosEtapa1, diasDesdeData, type ConfigReativacao, type Reativacao } from './reativacao';

/** Quantos dias depois da etapa 1 a conversa ainda é salvável (a janela do aviso). */
export const JANELA_AVISO_DIAS = 5;

export interface HistoricoSumindo {
  total: number;
  /** A data (AAAA-MM-DD) em que o contato mais urgente sai da janela. */
  ate: DataIso | null;
}

export function historicoSumindo(
  contatos: ReadonlyArray<ContatoVarrido>,
  config: Pick<ConfigReativacao, 'etapas' | 'termo' | 'soMinha'>,
  registros: ReadonlyArray<Reativacao>,
  ctx: ContextoFiltro,
): HistoricoSumindo {
  const base = { ...config } as ConfigReativacao;
  const porChave = new Map(registros.map((r) => [r.chave, r]));
  // Mesmas regras de público da reativação (salvo com nome, individual, sem opt-out, sem campanha recente...).
  const { elegiveis } = candidatosEtapa1(contatos, base, porChave, ctx);
  const emRisco = elegiveis.filter((c) => {
    if (c.ultimaConversa == null) return false;
    // Já lido/avaliado pela reativação (qualquer registro): o contexto já foi para o CRM.
    if (porChave.has(c.chave)) return false;
    const dias = diasDesdeData(c.ultimaConversa, ctx.agora);
    return dias >= config.etapas[0] && dias <= config.etapas[0] + JANELA_AVISO_DIAS;
  });
  if (emRisco.length === 0) return { total: 0, ate: null };
  const limites = emRisco.map((c) => somarDias(c.ultimaConversa as DataIso, config.etapas[0] + JANELA_AVISO_DIAS)).sort();
  return { total: emRisco.length, ate: limites[0] };
}

export function textoDoAviso(h: HistoricoSumindo): string | null {
  if (h.total <= 0 || h.ate == null) return null;
  const dd = formatarDataBr(h.ate).slice(0, 5);
  return `${h.total} ${h.total === 1 ? 'conversa precisa' : 'conversas precisam'} ser lida${h.total === 1 ? '' : 's'} até ${dd} senão o histórico some do WhatsApp Web.`;
}
