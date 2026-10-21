// Acesso do painel lateral aos dados do CRM, sempre pelo repositório (nada de chrome.storage aqui).
// Atualiza sozinho quando o content script ou o service worker gravam alguma coisa.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DadosCrm } from '../shared/crm-tipos';
import type { RepositorioContatos } from '../shared/repositorio';
import { repositorioPadrao } from '../shared/repositorio-local';

export interface CrmPainel {
  dados: DadosCrm | null;
  /** "Agora" do painel, atualizado a cada 30 s (para tempos decorridos e vencimentos). */
  agora: Date;
  repo: RepositorioContatos;
  /** Executa uma operação no repositório e atualiza a tela com o resultado. */
  fazer: <T>(op: (repo: RepositorioContatos) => Promise<T>) => Promise<T>;
  recarregar: () => Promise<void>;
}

export function useCrm(repositorio?: RepositorioContatos): CrmPainel {
  const repo = useRef<RepositorioContatos>(repositorio ?? repositorioPadrao()).current;
  const [dados, setDados] = useState<DadosCrm | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const ativo = useRef(true);

  const recarregar = useCallback(async () => {
    const d = await repo.carregar();
    if (ativo.current) setDados(d);
  }, [repo]);

  useEffect(() => {
    ativo.current = true;
    void recarregar();
    const parar = repo.aoMudar(() => void recarregar());
    const relogio = setInterval(() => setAgora(new Date()), 30_000);
    return () => {
      ativo.current = false;
      parar();
      clearInterval(relogio);
    };
  }, [repo, recarregar]);

  const fazer = useCallback(
    async <T,>(op: (r: RepositorioContatos) => Promise<T>): Promise<T> => {
      const r = await op(repo);
      await recarregar();
      return r;
    },
    [repo, recarregar],
  );

  return { dados, agora, repo, fazer, recarregar };
}
