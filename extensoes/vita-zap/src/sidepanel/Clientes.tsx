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
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState<string>(CORES_ETIQUETA[0]);
  const etiquetas = crm.dados?.etiquetas ?? [];

  async function criarTag(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    const n = novoNome.trim();
    if (!n) return;
    const res = await crm.fazer((r) => r.criarEtiqueta(n, novaCor));
    if ('erro' in res) {
      setErro(res.erro);
    } else {
      setNovoNome('');
    }
  }
  return (
    <details className="cartao">
      <summary>Etiquetas ({etiquetas.length})</summary>
      <p className="ajuda">Crie novas tags ou renomeie, mude a cor e exclua as existentes.</p>
      <form onSubmit={criarTag} style={{ display: 'flex', gap: 6, margin: '8px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Nome da nova tag..."
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: '4px 8px', fontSize: 13 }}
        />
        <select
          aria-label="Cor da nova tag"
          value={novaCor}
          onChange={(e) => setNovaCor(e.target.value)}
          style={{ padding: '4px 6px', fontSize: 13 }}
        >
          {CORES_ETIQUETA.map((c) => (
            <option key={c} value={c} style={{ background: c, color: '#fff' }}>
              Cor
            </option>
          ))}
        </select>
        <button type="submit" className="primario pequeno" style={{ whiteSpace: 'nowrap' }} disabled={!novoNome.trim()}>
          + Criar tag
        </button>
      </form>
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
        <div className="busca-bloco">
          <label htmlFor="busca-cliente" className="rotulo-campo">Buscar cliente</label>
          <div className="campo-com-icone">
            <span className="icone-busca" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              id="busca-cliente"
              type="search"
              value={busca}
              placeholder="nome, telefone, etiqueta ou nota"
              onChange={(e) => setBusca(e.target.value)}
            />
            {busca && (
              <button
                type="button"
                className="btn-limpar-busca"
                onClick={() => setBusca('')}
                title="Limpar busca"
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="filtros-grid">
          <div className="filtro-campo">
            <label htmlFor="filtro-ordem">Ordenar por</label>
            <select id="filtro-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemClientes)}>
              {ORDENS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label htmlFor="filtro-fase">Fase</label>
            <select id="filtro-fase" value={fase} onChange={(e) => setFase(e.target.value as Fase | '')}>
              <option value="">todas</option>
              {FASES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label htmlFor="filtro-etiqueta">Etiqueta</label>
            <select id="filtro-etiqueta" value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}>
              <option value="">todas</option>
              {dados.etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filtros-rodape">
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={soComDados} onChange={(e) => setSoComDados(e.target.checked)} />
            <span>Só quem tem fase, etiqueta, nota ou lembrete</span>
          </label>
        </div>

        <div className="clientes-resumo-barra">
          <div className="clientes-contagem-destaque">
            <strong>{linhas.length}</strong> {linhas.length === 1 ? 'cliente' : 'clientes'}
            <span className="divisor-circulo">•</span>
            <span className="vistas-sub">{vistas} conversas analisadas</span>
          </div>
          <p className="ajuda-curta">
            Baseado no WhatsApp Web (carrega aos poucos). Grupos e contatos sem &ldquo;cliente&rdquo; ficam de fora.
          </p>
        </div>
      </div>

      {msg && <p className="erro">{msg}</p>}

      {linhas.length === 0 ? (
        <div className="cartao">{vistas === 0 && Object.keys(dados.contatos).length === 0 ? 'Abra o WhatsApp Web: os clientes aparecem conforme a lista de conversas carrega.' : 'Nenhum cliente com esses filtros.'}</div>
      ) : (
        <ul className="lista" style={{ maxHeight: 'none' }}>
          {linhas.slice(0, limite).map((c) => {
            const inicial = (c.nome.trim().charAt(0) || '?').toUpperCase();
            return (
              <li key={c.id} className="cliente-item">
                <div className="cliente-topo">
                  <div className="cliente-identificacao">
                    <span className="cliente-avatar" aria-hidden="true">{inicial}</span>
                    <b title={c.nome}>{c.nome}</b>
                  </div>
                  <button type="button" className="btn-abrir-conversa" onClick={() => void abrir(c.nome, c.telefone)}>
                    Abrir
                  </button>
                </div>
                <div className="cliente-etiquetas">
                  {c.fase && (
                    <span className="etq etq-fase" style={{ background: corDaFase(c.fase) }}>
                      {rotuloDaFase(c.fase)}
                    </span>
                  )}
                  {c.etiquetas.map((e) => (
                    <span key={e.id} className="etq" style={{ background: e.cor }}>
                      {e.nome}
                    </span>
                  ))}
                  {c.precisaResposta && (
                    <span className="badge-precisa-resposta">
                      <span className="ponto-alerta" aria-hidden="true">●</span> precisa de resposta
                    </span>
                  )}
                </div>
                <div className="suave cliente-meta">
                  <span className="meta-interacao">
                    Última interação: {c.ultimaInteracaoTexto || 'ainda não vista na lista'}
                  </span>
                  {c.proximoLembrete && (
                    <span className={`meta-lembrete ${c.proximoLembrete.venceEm <= crm.agora.getTime() ? 'vencido' : ''}`}>
                      {' · '}Próximo lembrete: {formatarVencimento(c.proximoLembrete.venceEm, crm.agora)}
                    </span>
                  )}
                  {c.notas > 0 && (
                    <span className="meta-notas">
                      {' · '}{c.notas} nota{c.notas === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {linhas.length > limite && (
        <button type="button" className="btn-mostrar-mais" onClick={() => setLimite(limite + POR_PAGINA)}>
          Mostrar mais ({linhas.length - limite})
        </button>
      )}

      <GerenciarEtiquetas crm={crm} />
    </section>
  );
}
