import { useEffect, useState } from 'react';
import { limparContatos, salvarContatos, type Banco } from '../shared/banco';
import { linhasParaContatos } from '../shared/contatos';
import { ehEventoConteudo } from '../shared/mensagens';
import type { DadosLocais } from './App';
import { lerPreferencia, lerSoComConversaMinha, salvarPreferencia, salvarSoComConversaMinha } from './preferencias';
import { TEXTO_AJUDA_SO_MINHA } from '../shared/filtros';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  dados: DadosLocais;
  aoMudar: () => Promise<void>;
  aoContinuar: () => void;
}

export function Varredura({ db, dados, aoMudar, aoContinuar }: Props) {
  const [termo, setTermo] = useState(() => lerPreferencia('termo', 'CLIENTE'));
  const [soMinha, setSoMinha] = useState(() => lerSoComConversaMinha());
  const [rodando, setRodando] = useState(false);
  const [pausando, setPausando] = useState(false);
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
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="ex.: CLIENTE (deixe vazio para varrer TODA a lista de conversas)" disabled={rodando} />
      </label>
      <div style={{ display: 'flex', gap: 8, margin: '2px 0 10px 0' }}>
        <button
          type="button"
          className="pequeno"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => setTermo('')}
          disabled={rodando || termo === ''}
        >
          Limpar busca (varrer todas as conversas)
        </button>
        <button
          type="button"
          className="pequeno"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => setTermo('CLIENTE')}
          disabled={rodando || termo === 'CLIENTE'}
        >
          Buscar "CLIENTE"
        </button>
      </div>
      <label className="check" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, margin: '0 0 8px 0' }}>
        <input
          type="checkbox"
          checked={soMinha}
          onChange={(e) => {
            setSoMinha(e.target.checked);
            salvarSoComConversaMinha(e.target.checked);
          }}
        />
        <span>
          Só contatos com conversa já feita por mim (atendente)
          <small className="ajuda" style={{ display: 'block', fontWeight: 400 }}>{TEXTO_AJUDA_SO_MINHA}</small>
        </span>
      </label>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button type="button" className="primario" onClick={() => void varrer()} disabled={rodando}>
          {rodando ? 'Varrendo…' : 'Varrer conversas'}
        </button>
        {rodando && (
          <button
            type="button"
            className="pequeno perigo"
            style={{ padding: '6px 12px' }}
            onClick={async () => {
              setPausando(true);
              try {
                await pedir({ tipo: 'pararVarredura' });
              } catch {
                setPausando(false);
              }
            }}
            disabled={pausando}
          >
            {pausando ? 'Pausando…' : '⏸ Pausar varredura'}
          </button>
        )}
      </div>
      {progresso && <p className="info">{progresso}</p>}
      {erro && <p className="erro">{erro}</p>}
      {avisos.map((a) => (
        <p key={a} className="aviso">
          {a}
        </p>
      ))}

      {resumo.total > 0 && (
        <div className="cartao">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>💾 Contatos na memória ({resumo.total})</h3>
            <button
              type="button"
              className="pequeno"
              style={{ fontSize: 11, color: '#dc2626' }}
              onClick={async () => {
                if (window.confirm(`Deseja apagar os ${resumo.total} contatos salvos da memória?`)) {
                  await limparContatos(db);
                  await aoMudar();
                }
              }}
            >
              Limpar lista
            </button>
          </div>
          <p className="ajuda" style={{ margin: '0 0 8px 0', fontSize: 12 }}>
            {varridoEm ? `Gravados em ${varridoEm}. ` : ''}Ficam salvos aqui para envio geral: você não precisa varrer a cada envio nem no mesmo dia.
          </p>
          <ul className="numeros">
            <li><b>{resumo.total}</b> salvos</li>
            <li><b>{resumo.comData}</b> com conversa</li>
            <li><b>{resumo.semConversa}</b> contatos da agenda</li>
            {resumo.soNumero > 0 && <li><b>{resumo.soNumero}</b> só número (fora)</li>}
            {resumo.grupos > 0 && <li><b>{resumo.grupos}</b> grupos (fora)</li>}
          </ul>
          <button type="button" className="primario" onClick={aoContinuar} style={{ marginTop: 10 }}>
            Montar campanha geral ({resumo.total} contatos) →
          </button>
        </div>
      )}
    </section>
  );
}
