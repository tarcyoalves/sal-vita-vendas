// Exportar e importar os dados do CRM (contatos, notas, etiquetas, lembretes, respostas rápidas)
// em JSON. Tudo local: nada é enviado a servidor nenhum.

import { useEffect, useState } from 'react';
import type { CrmPainel } from './crm';

function carimbo(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export function CrmBackup({ crm }: { crm: CrmPainel }) {
  const [arquivo, setArquivo] = useState<{ url: string; nome: string } | null>(null);
  const [modo, setModo] = useState<'mesclar' | 'substituir'>('mesclar');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (arquivo) URL.revokeObjectURL(arquivo.url);
    },
    [arquivo],
  );

  function exportar() {
    void crm.repo.exportarJson().then((json) => {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      setArquivo({ url, nome: `vita-zap-crm-${carimbo()}.json` });
    });
  }

  async function importar(f: File | undefined) {
    setMsg(null);
    setErro(null);
    if (!f) return;
    const texto = await f.text();
    if (modo === 'substituir' && !window.confirm('Substituir contatos, notas, etiquetas, lembretes e respostas rápidas pelo conteúdo deste arquivo?')) return;
    const r = await crm.fazer((repo) => repo.importar(texto, modo));
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setMsg(`Importado (${modo === 'substituir' ? 'substituindo' : 'mesclando'}): ${r.resumo.contatos} contatos, ${r.resumo.etiquetas} etiquetas, ${r.resumo.lembretes} lembretes, ${r.resumo.respostas} respostas rápidas.`);
  }

  return (
    <div className="cartao">
      <h3>CRM: backup (JSON)</h3>
      <p className="ajuda">Contatos, notas, etiquetas, fases, lembretes e respostas rápidas ficam só neste navegador. Exporte de vez em quando; o arquivo serve para levar os dados a outro Chrome.</p>
      <div className="botoes">
        <button type="button" onClick={exportar} disabled={!crm.dados}>
          Exportar dados do CRM
        </button>
      </div>
      {arquivo && (
        <p>
          <a href={arquivo.url} download={arquivo.nome}>
            Baixar {arquivo.nome}
          </a>
        </p>
      )}
      <label>
        Ao importar
        <select value={modo} onChange={(e) => setModo(e.target.value === 'substituir' ? 'substituir' : 'mesclar')}>
          <option value="mesclar">mesclar com o que já existe</option>
          <option value="substituir">substituir o que existe</option>
        </select>
      </label>
      <label>
        Importar dados do CRM (JSON)
        <input type="file" accept="application/json,.json" onChange={(e) => void importar(e.target.files?.[0])} />
      </label>
      {msg && <p className="info">{msg}</p>}
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}
