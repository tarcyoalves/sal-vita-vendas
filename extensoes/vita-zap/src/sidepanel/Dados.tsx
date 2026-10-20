import { useEffect, useState } from 'react';
import { desmarcarNaoEnviar, exportarTudo, importarTudo, lerAutomatico, lerConfig, lerMeuNome, salvarAutomatico, salvarConfig, salvarMeuNome, type Banco } from '../shared/banco';
import { aceiteValido, AVISO_RISCO_AUTOMATICO, desligarAutomatico, type EstadoAutomatico, ligarAutomatico } from '../shared/automatico';
import { AUTO, INTERVALO_MIN_SEG, PALAVRA_ACEITE_AUTOMATICO, TETO_DIARIO_MAXIMO } from '../shared/constantes';
import { type RegistroDiagnostico, resumirPagina, resumirResposta } from '../shared/diagnostico';
import type { DiagnosticoPagina } from '../shared/mensagens';
import { csvDasCampanhas, lerBackup } from '../shared/exportar';
import { CONFIG_PADRAO, type ConfigPolitica } from '../shared/politica';
import type { DadosLocais } from './App';
import { BotoesDiagnostico } from './BotoesDiagnostico';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  registro: RegistroDiagnostico;
  dados: DadosLocais;
  automatico: EstadoAutomatico;
  aoMudar: () => Promise<void>;
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

export function Dados({ db, registro, dados, automatico, aoMudar }: Props) {
  const [aceitouRisco, setAceitouRisco] = useState(false);
  const [palavra, setPalavra] = useState('');
  const [cfg, setCfg] = useState<ConfigPolitica>(CONFIG_PADRAO);
  const [msgCfg, setMsgCfg] = useState<string | null>(null);
  const [meuNome, setMeuNome] = useState('');
  const [msgMeuNome, setMsgMeuNome] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [modoImport, setModoImport] = useState<'mesclar' | 'substituir'>('mesclar');
  const [msgImport, setMsgImport] = useState<string | null>(null);

  const [teste, setTeste] = useState<{ pagina: DiagnosticoPagina } | { erro: string } | null>(null);
  const [testando, setTestando] = useState(false);

  async function testarPagina() {
    setTestando(true);
    setTeste(null);
    const r = await pedir({ tipo: 'diagnosticar' });
    registro.registrar({
      fase: 'teste_manual',
      pedido: 'diagnosticar',
      resposta: resumirResposta(r),
      item: null,
      pagina: r.ok && r.diagnostico ? resumirPagina(r.diagnostico) : null,
    });
    setTeste(r.ok && r.diagnostico ? { pagina: r.diagnostico } : { erro: r.ok ? 'O WhatsApp Web não devolveu o diagnóstico (recarregue a aba com F5).' : r.erro });
    setTestando(false);
  }

  useEffect(() => {
    void lerConfig(db).then(setCfg);
    void lerMeuNome(db).then(setMeuNome);
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

  async function gravarMeuNome() {
    setMeuNome(await salvarMeuNome(db, meuNome));
    setMsgMeuNome('Salvo.');
  }

  async function ligarModoAutomatico() {
    if (!aceiteValido(aceitouRisco, palavra)) return;
    // Relê o banco: o estado vem sempre dele, não da tela.
    await salvarAutomatico(db, ligarAutomatico(await lerAutomatico(db), new Date()));
    setAceitouRisco(false);
    setPalavra('');
    await aoMudar();
  }

  async function desligarModoAutomatico() {
    await salvarAutomatico(db, desligarAutomatico(await lerAutomatico(db), new Date(), null));
    await aoMudar();
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
        <p className="ajuda">Horário fixo: seg–sex 8h–18h, sáb 8h–12h (Fortaleza). Freio: 3 problemas seguidos pausam (conferências que falham antes de colar viram "pulado (revisar)" e não contam).</p>
        <button type="button" onClick={() => void gravarConfig()}>
          Salvar política
        </button>
        {msgCfg && <p className="info">{msgCfg}</p>}
      </div>

      <div className="cartao">
        <h3>Meu nome no WhatsApp</h3>
        <p className="ajuda">
          É o nome que aparece como autor das SUAS mensagens (o WhatsApp Web não marca a direção da mensagem). A extensão aprende sozinha, mas você pode
          corrigir. Serve para separar as suas mensagens das do cliente ao decidir se a conversa é individual.
        </p>
        <label>
          Meu nome
          <input type="text" value={meuNome} autoComplete="off" onChange={(e) => setMeuNome(e.target.value)} />
        </label>
        <button type="button" onClick={() => void gravarMeuNome()}>
          Salvar meu nome
        </button>
        {msgMeuNome && <p className="info">{msgMeuNome}</p>}
      </div>

      <div className="cartao">
        <h3>Modo automático {automatico.ligado ? '(LIGADO)' : '(desligado)'}</h3>
        <p className="risco" role="note">
          ⚠️ O envio automático pelo WhatsApp Web viola os Termos do WhatsApp e pode bloquear seu número de forma permanente. Use só com clientes que já
          conversam com você, em volume baixo. O modo padrão (você aperta Enter) continua disponível e é o mais seguro.
        </p>
        <p className="ajuda">
          Limites no automático: no máximo {AUTO.tetoDiario} mensagens por dia; intervalo aleatório de {AUTO.intervaloMinSeg} a {AUTO.intervaloMaxSeg} s;
          pausa longa de {AUTO.pausaLongaMinSeg / 60} a {AUTO.pausaLongaMaxSeg / 60} min a cada {AUTO.enviosAtePausaLonga} envios; só seg–sex 8h–18h e sáb
          8h–12h (Fortaleza); contagem de {AUTO.contagemSeg} s com Cancelar antes de cada envio; {AUTO.problemasParaDesligar} problemas seguidos ou qualquer
          aviso do WhatsApp desligam o automático.
        </p>
        {automatico.ligado ? (
          <>
            <p className="aviso">
              Ligado{automatico.aceitoEm ? ` desde ${new Date(automatico.aceitoEm).toLocaleString('pt-BR')}` : ''}. O painel precisa ficar aberto.
            </p>
            <button type="button" className="perigo" onClick={() => void desligarModoAutomatico()}>
              Desligar o modo automático (volta ao manual)
            </button>
          </>
        ) : (
          <>
            {automatico.motivoDesligado && <p className="aviso">Desligado pela extensão: {automatico.motivoDesligado}</p>}
            {automatico.aceitoEm && <p className="ajuda">Último aceite: {new Date(automatico.aceitoEm).toLocaleString('pt-BR')}.</p>}
            <label className="check">
              <input type="checkbox" checked={aceitouRisco} onChange={(e) => setAceitouRisco(e.target.checked)} />
              {AVISO_RISCO_AUTOMATICO}
            </label>
            <label>
              Digite {PALAVRA_ACEITE_AUTOMATICO} para confirmar
              <input type="text" value={palavra} autoComplete="off" onChange={(e) => setPalavra(e.target.value)} />
            </label>
            <button type="button" className="perigo" disabled={!aceiteValido(aceitouRisco, palavra)} onClick={() => void ligarModoAutomatico()}>
              Ligar o modo automático
            </button>
          </>
        )}
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
        <h3>Diagnóstico</h3>
        <p className="ajuda">
          Se algo der errado, copie o diagnóstico e mande para quem cuida da extensão. Ele não tem o texto das mensagens e mascara telefones.
        </p>
        <BotoesDiagnostico registro={registro} />
        <div className="botoes">
          <button type="button" disabled={testando} onClick={() => void testarPagina()}>
            {testando ? 'Testando…' : 'Testar página do WhatsApp'}
          </button>
        </div>
        {teste && 'erro' in teste && <p className="aviso">{teste.erro}</p>}
        {teste && 'pagina' in teste && (
          <>
            <p className="info">
              {teste.pagina.url} · idioma "{teste.pagina.idioma}" · linhas na lista: {teste.pagina.linhasNaLista} · conversa aberta:{' '}
              {teste.pagina.conversaAberta ? 'sim' : 'não'} · título do cabeçalho: {teste.pagina.tituloCabecalho ? 'sim' : 'não'} · caixa de
              mensagem: {teste.pagina.caixaMensagem ? 'sim' : 'não'} · mensagens (data-id): {teste.pagina.dataIds.total}
            </p>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Seletor</th>
                  <th>Alternativa que casou</th>
                  <th>Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {teste.pagina.seletores.map((s) => (
                  <tr key={s.chave} className={s.casou ? '' : 'sem-casar'}>
                    <td>{s.chave}</td>
                    <td>
                      <code>{s.casou ?? 'nenhuma'}</code>
                    </td>
                    <td>{s.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ajuda">Seletores de conversa aberta só batem com uma conversa aberta no WhatsApp.</p>
            <p className="info">
              Conversa aberta classificada como <b>{teste.pagina.classificacao.tipo}</b> · recebidas: {teste.pagina.classificacao.recebidas} · suas:{' '}
              {teste.pagina.classificacao.enviadas} · ícone de grupo: {teste.pagina.classificacao.iconeGrupo ? 'sim' : 'não'} · autores distintos:{' '}
              {teste.pagina.classificacao.autoresDistintos}
            </p>
            <p className="info">
              Minhas (com ícone de status): {teste.pagina.classificacao.comIconeDeStatus} · recebidas: {teste.pagina.classificacao.recebidas} · de sistema
              (ignoradas): {teste.pagina.classificacao.sistema} · meu nome aprendido: {teste.pagina.classificacao.meuNome ?? 'ainda não'} · autores do outro
              lado: {teste.pagina.classificacao.autoresDoOutroLado}
            </p>
            {teste.pagina.classificacao.iconesNasLinhas.length > 0 && (
              <p className="ajuda">
                data-icon nas linhas de mensagem: <code>{teste.pagina.classificacao.iconesNasLinhas.join(' · ')}</code>
              </p>
            )}
            {teste.pagina.dataIds.amostras.length > 0 && (
              <p className="ajuda">
                Amostras de data-id (mascaradas): <code>{teste.pagina.dataIds.amostras.join(' · ')}</code>
              </p>
            )}
          </>
        )}
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
