// Faixa "Nova versão X disponível" no topo do painel. Lê o versao.json estático do CRM (no máximo 1 vez a cada 6 h).

import { useEffect, useState } from 'react';
import { URL_PAGINA_INSTALACAO, URL_VERSAO_JSON, versaoNovaDisponivel } from '../shared/versao';
import { lerPreferencia, salvarPreferencia } from './preferencias';

export function AvisoVersao() {
  const [nova, setNova] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void versaoNovaDisponivel({
      agora: Date.now,
      ultimaChecagem: () => Number(lerPreferencia('versaoChecadaEm', '0')) || 0,
      versaoGuardada: () => lerPreferencia('versaoPublicada', ''),
      guardar: (em, v) => {
        salvarPreferencia('versaoChecadaEm', String(em));
        salvarPreferencia('versaoPublicada', v);
      },
      // O arquivo é do site do CRM: sem a permissão do domínio o Chrome bloquearia o fetch, então nem tenta.
      podeBuscar: () => chrome.permissions.contains({ origins: [`${new URL(URL_VERSAO_JSON).origin}/*`] }),
      buscar: async () => (await fetch(URL_VERSAO_JSON, { cache: 'no-store' })).json(),
      versaoInstalada: () => chrome.runtime.getManifest().version,
    }).then((v) => vivo && setNova(v), () => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!nova) return null;
  return (
    <div className="aviso-versao" role="status">
      <b>Nova versão {nova} disponível.</b> Feche e abra o Chrome (ou clique em ↻ em chrome://extensions) para aplicar.{' '}
      <a href={URL_PAGINA_INSTALACAO} target="_blank" rel="noreferrer">
        Como atualizar
      </a>
    </div>
  );
}
