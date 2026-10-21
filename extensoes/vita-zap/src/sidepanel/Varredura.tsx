import { useEffect, useState } from 'react';
import { limparContatos, salvarContatos, type Banco } from '../shared/banco';
import { linhasParaContatos } from '../shared/contatos';
import { ehEventoConteudo } from '../shared/mensagens';
import type { Ajustes } from '../shared/ajustes';
import type { DadosLocais } from './App';
import { lerPreferencia, salvarPreferencia } from './preferencias';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  dados: DadosLocais;
  ajustes: Ajustes;
  aoMudar: () => Promise<void>;
  aoContinuar: () => void;
}

export function Varredura({ db, dados, ajustes, aoMudar, aoContinuar }: Props) {
  const [termo, setTermo] = useState(() => lerPreferencia('termo', ajustes.filtros.termo));
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    const ouvir = (msg: unknown) => {
      if (ehEventoConteudo(msg) && msg.tipo === 'vitaZap:progressoVarredura') {
        setProgresso(`${msg.lidas} leituras · ${msg.unicas} nomes`);
      }
    };
    chrome.runtime.onMessage.addListener(ouvir);
    return () => chrome.runtime.onMessage.removeListener(ouvir);
  }, []);

  async function varrer() {
    setRodando(true);
    setErro(null);
    setAvisos([]);
    setProgresso('começando…');
    salvarPreferencia('termo', termo);
    try {
      const v = await pedir({ tipo: 'verificar' }, true);
      if (!v.ok) {
        setErro(v.erro);
        return;
      }
      const r = await pedir({ tipo: 'varrer', termo: termo.trim() });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const contatos = linhasParaContatos(r.linhas ?? [], new Date());
      await limparContatos(db);
      await salvarContatos(db, contatos);
      setAvisos([...(v.avisos ?? []), ...(r.avisos ?? [])]);
      await aoMudar();
    } finally {
      setRodando(false);
      setProgresso(null);
    }
  }

  const c = dados.contatos;
  const resumo = {
    total: c.length,
    comData: c.filter((x) => x.ultimaConversa).length,
    revisar: c.filter((x) => x.temConversa && !x.ultimaConversa).length,
    soNumero: c.filter((x) => x.soNumero).length,
    grupos: c.filter((x) => x.pareceGrupo).length,
    semConversa: c.filter((x) => !x.temConversa).length,
    duplicados: c.filter((x) => x.duplicado).length,
  };
  const varridoEm = c[0]?.varridoEm ? new Date(c[0].varridoEm).toLocaleString('pt-BR') : null;

  return (
    <section>
      <p className="ajuda">
        Lê a lista de conversas do WhatsApp Web (só leitura): nome salvo e data da última mensagem. Deixe o WhatsApp Web
        aberto nesta janela.
      </p>
      <label>
        Termo de busca no WhatsApp
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="ex.: CLIENTE (vazio = lista inteira)" disabled={rodando} />
      </label>
      <button type="button" className="primario" onClick={() => void varrer()} disabled={rodando}>
        {rodando ? 'Varrendo…' : 'Varrer conversas'}
      </button>
      {progresso && <p className="info">{progresso}</p>}
      {erro && <p className="erro">{erro}</p>}
      {avisos.map((a) => (
        <p key={a} className="aviso">
          {a}
        </p>
      ))}

      {resumo.total > 0 && (
        <div className="cartao">
          <h3>Última varredura{varridoEm ? ` · ${varridoEm}` : ''}</h3>
          <ul className="numeros">
            <li><b>{resumo.total}</b> nomes</li>
            <li><b>{resumo.comData}</b> com data lida</li>
            <li><b>{resumo.revisar}</b> data incerta (revisar)</li>
            <li><b>{resumo.soNumero}</b> só número (fora)</li>
            <li><b>{resumo.grupos}</b> grupos (fora)</li>
            <li><b>{resumo.semConversa}</b> sem conversa (fora)</li>
            <li><b>{resumo.duplicados}</b> nome repetido (revisar)</li>
          </ul>
          <button type="button" onClick={aoContinuar}>
            Montar campanha →
          </button>
        </div>
      )}
    </section>
  );
}
