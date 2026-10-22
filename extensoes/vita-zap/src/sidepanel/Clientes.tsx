// Aba Clientes: contatos com fase, etiquetas, última interação e próximo lembrete.
// Busca e ordenação ("mais tempo sem contato" é o padrão). Os dados vêm do que a extensão viu na
// lista do WhatsApp Web e do que você anotou lá; nada sai deste navegador.

import { useMemo, useState } from 'react';
import { abrirConversaNoWhatsApp } from '../shared/crm-acoes';
import { montarClientes, ORDENS, type OrdemClientes } from '../shared/crm-clientes';
import { formatarVencimento } from '../shared/crm-lembretes';
import { CORES_ETIQUETA, corDaFase, FASES, rotuloDaFase, type Fase } from '../shared/crm-tipos';
import type { CrmPainel } from './crm';

const POR_PAGINA = 80;

function GerenciarEtiquetas({ crm }: { crm: CrmPainel }) {
  const [erro, setErro] = useState<string | null>(null);
  const etiquetas = crm.dados?.etiquetas ?? [];
  return (
    <details className="cartao">
      <summary>Etiquetas ({etiquetas.length})</summary>
      <p className="ajuda">Crie etiquetas no WhatsApp Web, no painel do cliente (cabeçalho da conversa). Aqui você renomeia, muda a cor ou exclui.</p>
      {etiquetas.length === 0 && <p className="ajuda">Nenhuma etiqueta ainda.</p>}
      <ul className="lista">
        {etiquetas.map((e) => (
          <li key={e.id}>
            <div className="lista-topo">
              <span className="etq" style={{ background: e.cor }}>
                {e.nome}
              </span>
              <span className="botoes" style={{ marginTop: 0 }}>
                <select
                  aria-label={`Cor da etiqueta ${e.nome}`}
                  value={e.cor}
                  onChange={(ev) => void crm.fazer((r) => r.renomearEtiqueta(e.id, e.nome, ev.target.value))}
                >
                  {CORES_ETIQUETA.map((c) => (
                    <option key={c} value={c} style={{ background: c, color: '#fff' }}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="pequeno"
                  onClick={() => {
                    const novo = window.prompt('Novo nome da etiqueta:', e.nome);
                    if (novo == null) return;
                    void crm.fazer((r) => r.renomearEtiqueta(e.id, novo, e.cor)).then(setErro);
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  className="pequeno perigo"
                  onClick={() => {
                    if (window.confirm(`Excluir a etiqueta "${e.nome}"? Ela sai de todos os contatos.`)) void crm.fazer((r) => r.excluirEtiqueta(e.id));
                  }}
                >
                  Excluir
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {erro && <p className="erro">{erro}</p>}
    </details>
  );
}

export function Clientes({ crm }: { crm: CrmPainel }) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemClientes>('semContato');
  const [fase, setFase] = useState<Fase | ''>('');
  const [etiquetaId, setEtiquetaId] = useState('');
  const [soComDados, setSoComDados] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [msg, setMsg] = useState<string | null>(null);

  const linhas = useMemo(
    () => (crm.dados ? montarClientes(crm.dados, crm.agora, { busca, ordem, fase: fase || null, etiquetaId: etiquetaId || null, soComDados, apenasClientes: true }) : []),
    [crm.dados, crm.agora, busca, ordem, fase, etiquetaId, soComDados],
  );

  if (!crm.dados) return <div className="carregando">Carregando…</div>;
  const dados = crm.dados;
  const vistas = Object.keys(dados.conversas).length;

  async function abrir(nome: string, telefone?: string) {
    setMsg(null);
    try {
      await abrirConversaNoWhatsApp(crm.repo, { nome, telefone });
    } catch {
      setMsg('Não consegui falar com a aba do WhatsApp Web. Abra web.whatsapp.com e recarregue a aba (F5).');
    }
  }

  return (
    <section>
      <div className="cartao">
        <div className="filtros">
          <label>
            Buscar cliente
            <input type="search" value={busca} placeholder="nome, telefone, etiqueta ou nota" onChange={(e) => setBusca(e.target.value)} />
          </label>
          <label>
            Ordenar por
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemClientes)}>
              {ORDENS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fase
            <select value={fase} onChange={(e) => setFase(e.target.value as Fase | '')}>
              <option value="">todas</option>
              {FASES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Etiqueta
            <select value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}>
              <option value="">todas</option>
              {dados.etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={soComDados} onChange={(e) => setSoComDados(e.target.checked)} />
          Só quem tem fase, etiqueta, nota ou lembrete
        </label>
        <p className="ajuda">
          {linhas.length} cliente{linhas.length === 1 ? '' : 's'} · baseado nas {vistas} conversas que a extensão já viu na lista do WhatsApp Web (a lista carrega aos poucos). Só aparecem contatos com "cliente" no nome; grupos ficam de fora.
        </p>
      </div>

      {msg && <p className="erro">{msg}</p>}

      {linhas.length === 0 ? (
        <div className="cartao">{vistas === 0 && Object.keys(dados.contatos).length === 0 ? 'Abra o WhatsApp Web: os clientes aparecem conforme a lista de conversas carrega.' : 'Nenhum cliente com esses filtros.'}</div>
      ) : (
        <ul className="lista" style={{ maxHeight: 'none' }}>
          {linhas.slice(0, limite).map((c) => (
            <li key={c.id}>
              <div className="cliente-topo">
                <b>{c.nome}</b>
                <button type="button" className="pequeno primario" onClick={() => void abrir(c.nome, c.telefone)}>
                  Abrir
                </button>
              </div>
              <div>
                {c.fase && (
                  <span className="etq" style={{ background: corDaFase(c.fase) }}>
                    {rotuloDaFase(c.fase)}
                  </span>
                )}
                {c.etiquetas.map((e) => (
                  <span key={e.id} className="etq" style={{ background: e.cor }}>
                    {e.nome}
                  </span>
                ))}
                {c.precisaResposta && <span className="etq" style={{ background: '#c77800' }}>precisa de resposta</span>}
              </div>
              <div className="suave">
                Última interação: {c.ultimaInteracaoTexto || 'ainda não vista na lista'}
                {c.proximoLembrete && (
                  <>
                    {' · '}
                    <span className={c.proximoLembrete.venceEm <= crm.agora.getTime() ? 'vencido' : ''}>Próximo lembrete: {formatarVencimento(c.proximoLembrete.venceEm, crm.agora)}</span>
                  </>
                )}
                {c.notas > 0 && <> · {c.notas} nota{c.notas === 1 ? '' : 's'}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {linhas.length > limite && (
        <button type="button" onClick={() => setLimite(limite + POR_PAGINA)}>
          Mostrar mais ({linhas.length - limite})
        </button>
      )}

      <GerenciarEtiquetas crm={crm} />
    </section>
  );
}
