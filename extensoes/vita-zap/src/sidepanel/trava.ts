// Liga a trava de agendamento (shared/trava-agendamento.ts) ao CRM e ao painel: quem pergunta ao CRM é o service worker
// (LeadsCRM.verificarAgendamentos); aqui só se descobre o telefone que a extensão já conhece do contato.

import { useMemo, useRef } from 'react';
import type { Banco } from '../shared/banco';
import { lerReativacao } from '../shared/banco';
import type { Campanha, ItemCampanha } from '../shared/campanha';
import type { DadosCrm } from '../shared/crm-tipos';
import { telefoneNoIndiceLocal } from '../shared/crm-telefone-conhecido';
import type { LeadsCRM } from '../shared/leads';
import type { CrmPainel } from './crm';
import type { RefTrava, ResultadoTrava } from '../shared/trava-agendamento';

export interface DependenciasTrava {
  repo: Pick<LeadsCRM, 'verificarAgendamentos'>;
  /** Telefone que a extensão já conhece do contato (nome do WhatsApp). null = não conhece. */
  telefoneDe: (nome: string, chave: string) => Promise<string | null> | string | null;
  /** Consulta o CRM de novo (ignora o cache de 5 min). */
  forcar?: boolean;
}

const indisponivel = (e: unknown): ResultadoTrava => ({ tipo: 'indisponivel', motivo: e instanceof Error ? e.message : String(e) });

/** Um resultado por contato, na mesma ordem. Qualquer falha → `indisponivel` (falha fechada). */
export async function conferirTrava(d: DependenciasTrava, contatos: ReadonlyArray<{ nome: string; chave: string; telefone?: string | null }>, forcar = d.forcar === true): Promise<ResultadoTrava[]> {
  if (contatos.length === 0) return [];
  try {
    const refs: RefTrava[] = [];
    for (const c of contatos) {
      const telefone = c.telefone ?? (await d.telefoneDe(c.nome, c.chave));
      refs.push({ nome: c.nome, ...(telefone ? { telefone } : {}) });
    }
    const r = await d.repo.verificarAgendamentos(refs, { forcar });
    return r.length === contatos.length ? r : contatos.map(() => indisponivel(new Error('resposta incompleta da trava de agendamento')));
  } catch (e) {
    return contatos.map(() => indisponivel(e));
  }
}

/** A função que o Executor chama antes de abrir cada contato. */
export function travaDoExecutor(d: DependenciasTrava): (item: ItemCampanha, campanha: Campanha) => Promise<ResultadoTrava> {
  return async (item) => (await conferirTrava(d, [{ nome: item.nome, chave: item.chave }]))[0];
}

/**
 * Telefone conhecido: o que a reativação aprendeu ao ler a conversa (guardado no registro) e, depois, o do índice local do
 * CRM da extensão (contatos e conversas vistas). `dados` pode ser nulo (ainda carregando).
 */
export function telefoneConhecidoDe(db: Banco | null, dados: () => DadosCrm | null): (nome: string, chave: string) => Promise<string | null> {
  return async (nome, chave) => {
    if (db) {
      const doRegistro = (await lerReativacao(db, chave))?.telefone;
      if (doRegistro) return doRegistro;
    }
    const d = dados();
    return d ? telefoneNoIndiceLocal(d, nome) : null;
  };
}

export interface TravaDoPainel {
  /** Para o Executor (campanha comum, cobrança e reativação): conferida antes de abrir cada contato. */
  executor: (item: ItemCampanha, campanha: Campanha) => Promise<ResultadoTrava>;
  /** Para o motor (vários contatos de uma vez): um resultado por contato. */
  varios: (contatos: ReadonlyArray<{ nome: string; chave: string; telefone?: string | null }>, forcar: boolean) => Promise<ResultadoTrava[]>;
}

/** A trava ligada ao CRM do painel. O telefone vem do registro da reativação e do índice local (sempre o mais recente). */
export function useTrava(db: Banco | null, crm: CrmPainel | undefined): TravaDoPainel | null {
  const dados = useRef(crm?.dados ?? null);
  dados.current = crm?.dados ?? null;
  const repo = crm?.repo;
  return useMemo(() => {
    if (!repo) return null;
    const d: DependenciasTrava = { repo, telefoneDe: telefoneConhecidoDe(db, () => dados.current) };
    return { executor: travaDoExecutor(d), varios: (contatos, forcar) => conferirTrava(d, contatos, forcar) };
  }, [db, repo]);
}
