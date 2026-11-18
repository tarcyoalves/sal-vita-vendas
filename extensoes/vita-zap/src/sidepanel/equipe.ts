// Liga a sincronização com a equipe (sincronia-equipe.ts) ao CRM e ao painel. Mesmo desenho da trava de agendamento (trava.ts):
// o telefone que a extensão já conhece do contato vem do registro da reativação e do índice local do CRM.

import { useMemo, useRef, useSyncExternalStore } from 'react';
import type { Banco } from '../shared/banco';
import type { Campanha, ItemCampanha } from '../shared/campanha';
import type { CrmPainel } from './crm';
import {
  aoEnviar,
  aoMudarEquipe,
  conferirEquipeAntesDeEnviar,
  desmarcarNaEquipe,
  preparar,
  sincronizarOptOuts,
  sincronizarTudo,
  versaoDaEquipe,
  type ContatoParaEquipe,
  type DependenciasEquipe,
  type ResultadoDesmarcar,
  type ResultadoEquipe,
  type ResultadoSincronia,
} from './sincronia-equipe';
import { telefoneConhecidoDe } from './trava';

export interface EquipeDoPainel {
  /** Para o Executor: conferida antes de abrir cada contato (opt-out e contato recente de qualquer atendente). */
  executor: (item: ItemCampanha, campanha: Campanha, limiteDias: number) => Promise<ResultadoEquipe>;
  /** Para o Executor: depois de cada envio confirmado. */
  aoEnviar: (item: ItemCampanha, campanha: Campanha, enviadoEm: string) => Promise<void>;
  /** Para os motores e a prévia: opt-out fresco e contato da equipe para estes contatos (nunca lança). */
  preparar: (contatos: ReadonlyArray<ContatoParaEquipe>, opcoes?: { forcar?: boolean }) => Promise<{ mudouLista: boolean }>;
  /** Ao abrir o painel e quando alguém marca "não enviar mais" aqui. */
  sincronizar: (opcoes?: { forcar?: boolean; soOptOuts?: boolean }) => Promise<ResultadoSincronia>;
  /** Desfaz o "não enviar mais" aqui E no CRM. */
  desmarcar: (chave: string) => Promise<ResultadoDesmarcar>;
}

/** A equipe ligada ao CRM do painel. */
export function useEquipe(db: Banco | null, crm: CrmPainel | undefined): EquipeDoPainel | null {
  const dados = useRef(crm?.dados ?? null);
  dados.current = crm?.dados ?? null;
  const repo = crm?.repo;
  return useMemo(() => {
    if (!repo || !db) return null;
    const d: DependenciasEquipe = { db, repo, telefoneDe: telefoneConhecidoDe(db, () => dados.current), agora: () => new Date() };
    return {
      executor: (item, _campanha, limiteDias) => conferirEquipeAntesDeEnviar(d, item, limiteDias),
      aoEnviar: (item, campanha, enviadoEm) => aoEnviar(d, item, campanha, enviadoEm),
      preparar: (contatos, opcoes) => preparar(d, contatos, opcoes),
      sincronizar: (opcoes) => (opcoes?.soOptOuts ? sincronizarOptOuts(d, opcoes) : sincronizarTudo(d, opcoes)),
      desmarcar: (chave) => desmarcarNaEquipe(d, chave),
    };
  }, [db, repo]);
}

/** Muda quando a sincronização com a equipe atualiza o contato recente (a prévia recalcula). */
export function useVersaoEquipe(): number {
  return useSyncExternalStore(aoMudarEquipe, versaoDaEquipe);
}
