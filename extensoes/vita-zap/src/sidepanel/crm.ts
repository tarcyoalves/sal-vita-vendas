// Acesso do painel lateral aos dados do CRM (chrome.storage.local), sempre atualizado quando o
// content script ou o service worker gravam alguma coisa.

import { useCallback, useEffect, useRef, useState } from 'react';
import { carregarDados, gravar, observarMudancas, type Colecao } from '../shared/crm-store';
import type { DadosCrm } from '../shared/crm-tipos';

export interface CrmPainel {
  dados: DadosCrm | null;
  /** "Agora" do painel, atualizado a cada 30 s (para tempos decorridos e vencimentos). */
  agora: Date;
  /** Relê o storage, aplica `mudar` e grava só as coleções informadas (evita sobrescrever dados velhos). */
  alterar: (colecoes: Colecao[], mudar: (d: DadosCrm) => void) => Promise<void>;
  recarregar: () => Promise<void>;
}

export function useCrm(): CrmPainel {
  const [dados, setDados] = useState<DadosCrm | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const ativo = useRef(true);

  const recarregar = useCallback(async () => {
    const d = await carregarDados();
    if (ativo.current) setDados(d);
  }, []);

  useEffect(() => {
    ativo.current = true;
    void recarregar();
    const parar = observarMudancas(() => void recarregar());
    const relogio = setInterval(() => setAgora(new Date()), 30_000);
    return () => {
      ativo.current = false;
      parar();
      clearInterval(relogio);
    };
  }, [recarregar]);

  const alterar = useCallback(async (colecoes: Colecao[], mudar: (d: DadosCrm) => void) => {
    const atual = await carregarDados();
    mudar(atual);
    for (const c of colecoes) await gravar(c, atual[c] as never);
    if (ativo.current) setDados(atual);
  }, []);

  return { dados, agora, alterar, recarregar };
}
