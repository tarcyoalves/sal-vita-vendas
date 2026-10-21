import { useEffect, useState } from 'react';
import { desmarcarNaoEnviar, exportarTudo, importarTudo, lerConfig, salvarConfig, type Banco } from '../shared/banco';
import { INTERVALO_MIN_SEG, TETO_DIARIO_MAXIMO } from '../shared/constantes';
import { csvDasCampanhas, lerBackup } from '../shared/exportar';
import { CONFIG_PADRAO, type ConfigPolitica } from '../shared/politica';
import type { DadosLocais } from './App';
import { CrmBackup } from './CrmBackup';
import type { CrmPainel } from './crm';

interface Props {
  db: Banco;
  dados: DadosLocais;
  aoMudar: () => Promise<void>;
  crm: CrmPainel;
}

interface Arquivo {
  url: string;
  nome: string;
}

function prepararArquivo(conteudo: string, tipo: string, nome: string): Arquivo {
  return { url: URL.createObjectURL(new Blob([conteudo], { type: tipo })), nome };
}

function carimbo(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export function Dados({ db, dados, aoMudar, crm }: Props) {
  const [cfg, setCfg] = useState<ConfigPolitica>(CONFIG_PADRAO);
  const [msgCfg, setMsgCfg] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [modoImport, setModoImport] = useState<'mesclar' | 'substituir'>('mesclar');
  const [msgImport, setMsgImport] = useState<string | null>(null);

  useEffect(() => {
    void lerConfig(db).then(setCfg);
  }, [db]);

  useEffect(() => () => {
    if (arquivo) URL.revokeObjectURL(arquivo.url);
  }, [arquivo]);

  async function gravarConfig() {
    const salvo = await salvarConfig(db, cfg);
    setCfg(salvo);
    setMsgCfg(
      salvo.tetoDiario !== cfg.tetoDiario || salvo.intervaloMinSeg !== cfg.intervaloMinSeg || salvo.intervaloMaxSeg !== cfg.intervaloMaxSeg
        ? 'Salvo, ajustado aos limites de segurança.'
        : 'Salvo.',
    );
  }

  async function exportarJson() {
    const b = await exportarTudo(db);
    setArquivo(prepararArquivo(JSON.stringify(b, null, 2), 'application/json', `vita-zap-backup-${carimbo()}.json`));
  }

  function exportarCsv() {
    setArquivo(prepararArquivo(csvDasCampanhas(dados.campanhas, dados.envios), 'text/csv;charset=utf-8', `vita-zap-campanhas-${carimbo()}.csv`));
  }

  async function importar(arquivoSelecionado: File | undefined) {
    setMsgImport(null);
    if (!arquivoSelecionado) return;
    const r = lerBackup(await arquivoSelecionado.text());
    if (!r.ok) {
      setMsgImport(r.erro);
      return;
    }
    if (modoImport === 'substituir' && !window.confirm('Substituir TODOS os dados locais por este backup?')) return;
    await importarTudo(db, r.backup, modoImport);
    setCfg(await lerConfig(db));
    await aoMudar();
    setMsgImport(`Importado: ${r.backup.campanhas.length} campanhas, ${r.backup.envios.length} envios, ${r.backup.naoEnviar.length} "não enviar".`);
  }

  return (
    <section>
      <CrmBackup crm={crm} />

      <div className="cartao">
        <h3>Política</h3>
        <label>
          Teto diário de mensagens (máximo {TETO_DIARIO_MAXIMO})
          <input
            type="number"
            min={1}
            max={TETO_DIARIO_MAXIMO}
            value={cfg.tetoDiario}
            onChange={(e) => setCfg({ ...cfg, tetoDiario: Number(e.target.value) })}
          />
        </label>
        <div className="linha2">
          <label>
            Intervalo mínimo (s, ≥ {INTERVALO_MIN_SEG})
            <input type="number" min={INTERVALO_MIN_SEG} value={cfg.intervaloMinSeg} onChange={(e) => setCfg({ ...cfg, intervaloMinSeg: Number(e.target.value) })} />
          </label>
          <label>
            Intervalo máximo (s)
            <input type="number" value={cfg.intervaloMaxSeg} onChange={(e) => setCfg({ ...cfg, intervaloMaxSeg: Number(e.target.value) })} />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.numeroComMaisDe30Dias}
            onChange={(e) => setCfg({ ...cfg, numeroComMaisDe30Dias: e.target.checked })}
          />
          Este número de WhatsApp tem mais de 30 dias de uso (número novo não roda campanha)
        </label>
        <p className="ajuda">Horário fixo: seg–sex 8h–18h, sáb 8h–12h (Fortaleza). Freio: 3 problemas seguidos pausam.</p>
        <button type="button" onClick={() => void gravarConfig()}>
          Salvar política
        </button>
        {msgCfg && <p className="info">{msgCfg}</p>}
      </div>

      <div className="cartao">
        <h3>Não enviar mais ({dados.naoEnviar.length})</h3>
        <ul className="lista">
          {dados.naoEnviar.map((n) => (
            <li key={n.chave}>
              <div className="lista-topo">
                <span>
                  <b>{n.nome}</b> <small>— {n.motivo}, {new Date(n.desde).toLocaleDateString('pt-BR')}</small>
                </span>
                <button
                  type="button"
                  className="pequeno"
                  onClick={async () => {
                    if (!window.confirm(`Tirar "${n.nome}" da lista "não enviar mais"?`)) return;
                    await desmarcarNaoEnviar(db, n.chave);
                    await aoMudar();
                  }}
                >
                  Tirar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="cartao">
        <h3>Backup e relatório</h3>
        <p className="ajuda">Os dados ficam só neste navegador. Faça backup de vez em quando.</p>
        <div className="botoes">
          <button type="button" onClick={() => void exportarJson()}>
            Exportar backup (JSON)
          </button>
          <button type="button" onClick={exportarCsv}>
            Exportar campanhas (CSV)
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
          <select value={modoImport} onChange={(e) => setModoImport(e.target.value === 'substituir' ? 'substituir' : 'mesclar')}>
            <option value="mesclar">mesclar com o que já existe</option>
            <option value="substituir">substituir tudo</option>
          </select>
        </label>
        <label>
          Importar backup (JSON)
          <input type="file" accept="application/json,.json" onChange={(e) => void importar(e.target.files?.[0])} />
        </label>
        {msgImport && <p className="info">{msgImport}</p>}
      </div>
    </section>
  );
}
