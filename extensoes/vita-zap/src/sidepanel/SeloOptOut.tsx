// Mostra ONDE o "não enviar mais" vale (neste computador × para a equipe) e deixa tentar sincronizar de novo.
// Só o CRM confirmar vira "para a equipe" (NaoEnviar.crm === true); antes disso é "neste computador · sincronização pendente".

import { useState } from 'react';
import type { NaoEnviar } from '../shared/exportar';
import { estadoDoOptOut, pendentesDeSincronia } from '../shared/equipe';
import { useVersaoEquipe, type EquipeDoPainel } from './equipe';
import { falhaDoOptOut, indisponibilidadeDaEquipe } from './sincronia-equipe';

interface PropsBotao {
  equipe: EquipeDoPainel | null;
  aoMudar?: () => void | Promise<void>;
}

function BotaoTentar({ equipe, aoMudar }: PropsBotao) {
  const [tentando, setTentando] = useState(false);
  if (!equipe) return null;
  return (
    <button
      type="button"
      className="pequeno"
      disabled={tentando}
      onClick={async () => {
        setTentando(true);
        try {
          await equipe.sincronizar({ forcar: true, soOptOuts: true });
          await aoMudar?.();
        } finally {
          setTentando(false);
        }
      }}
    >
      {tentando ? 'Sincronizando…' : 'Tentar sincronizar'}
    </button>
  );
}

/** Um contato: "Bloqueado para a equipe" ou "Bloqueado neste computador · sincronização pendente" (com o motivo da última falha). */
export function SeloOptOut({ n, equipe, aoMudar }: { n: NaoEnviar } & PropsBotao) {
  useVersaoEquipe(); // volta a desenhar quando a sincronização muda o estado
  const e = estadoDoOptOut(n, falhaDoOptOut(n.chave));
  return (
    <span className={e.tipo === 'equipe' ? 'info' : 'aviso'} data-estado-optout={e.tipo}>
      {e.rotulo}
      {e.detalhe ? ` (${e.detalhe})` : ''}
      {e.tipo === 'neste_computador' && <> <BotaoTentar equipe={equipe} aoMudar={aoMudar} /></>}
    </span>
  );
}

/** Aviso geral (prévia, Pedir à IA): quantos estão só neste computador. Some quando todos foram confirmados. */
export function AvisoOptOutPendente({ naoEnviar, equipe, aoMudar }: { naoEnviar: ReadonlyArray<NaoEnviar> } & PropsBotao) {
  useVersaoEquipe();
  const n = pendentesDeSincronia(naoEnviar);
  if (n === 0) return null;
  const falha = naoEnviar.filter((x) => x.crm !== true).map((x) => falhaDoOptOut(x.chave)).find((f) => f !== null) ?? indisponibilidadeDaEquipe();
  return (
    <p className="aviso" role="status" data-optout-pendente={n}>
      {n} contato(s) em "Não enviar mais" valem só neste computador (sincronização pendente{falha ? `: ${falha}` : ''}). Continuam bloqueados aqui; a equipe só fica protegida depois da confirmação do CRM. <BotaoTentar equipe={equipe} aoMudar={aoMudar} />
    </p>
  );
}
