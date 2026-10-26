import { useEffect, useMemo, useState } from 'react';
import type { Banco } from '../shared/banco';
import { resumo, textoDoItem } from '../shared/campanha';
import { ehEventoConteudo } from '../shared/mensagens';
import { dentroDoHorario } from '../shared/politica';
import { formatarDataBr } from '../shared/datas';
import type { DadosLocais } from './App';
import type { CrmPainel } from './crm';
import { acharContato } from '../shared/crm-contatos';
import { type EstadoExecutor, Executor } from './executor';
import { iniciarBatimento, protegerContraFechamento } from './protecao';
import { pedir } from './whatsapp';
import { lerPreferencia, salvarPreferencia } from './preferencias';

interface Props {
  db: Banco;
  dados: DadosLocais;
  campanhaId: string | null;
  aoEscolher: (id: string) => void;
  aoMudar: () => Promise<void>;
  crm?: CrmPainel;
}

const ROTULO_FASE: Record<EstadoExecutor['fase'], string> = {
  parada: 'Parada',
  abrindo: 'Abrindo a conversa…',
  aguardando_envio: 'Aguardando envio',
  intervalo: 'Intervalo entre contatos',
  concluida: 'Concluída',
};

export function Execucao({ db, dados, campanhaId, aoEscolher, aoMudar, crm }: Props) {
  const campanhas = dados.campanhas;
  const idEscolhido = campanhaId ?? campanhas.find((c) => c.status !== 'concluida')?.id ?? campanhas[0]?.id ?? null;
  const campanhaInicial = campanhas.find((c) => c.id === idEscolhido) ?? null;

  // Um executor por campanha escolhida. Criado a partir da versão gravada no banco.
  const executor = useMemo(
    () =>
      campanhaInicial
        ? new Executor(
            {
              db,
              pedir,
              agora: () => new Date(),
              aleatorio: Math.random,
              agendar: (fn, ms) => {
                const t = setTimeout(fn, ms);
                return () => clearTimeout(t);
              },
            },
            campanhaInicial,
          )
        : null,
    // Recria só ao trocar de campanha (o executor mantém o próprio estado depois de criado).
    [db, idEscolhido],
  );
  const [estado, setEstado] = useState<EstadoExecutor | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [filtroLista, setFiltroLista] = useState<'todos' | 'pendente' | 'problema' | 'revisar' | 'enviado' | 'pulado'>('todos');

  useEffect(() => {
    if (!executor) {
      setEstado(null);
      return;
    }
    // Envio automático: autorizado uma vez, fica autorizado (decisão do dono, 20/10/2026) — lembra a escolha.
    if (lerPreferencia('envioAutomatico', '0') === '1') executor.setEnvioAutomatico(true);
    const sair = executor.assinar(setEstado);
    const ouvir = (msg: unknown) => {
      if (ehEventoConteudo(msg)) void executor.aoReceberEvento(msg);
    };
    chrome.runtime.onMessage.addListener(ouvir);
    const desproteger = protegerContraFechamento(executor);
    // Painel reaberto com mensagem "em voo": confere a conversa em vez de colar de novo.
    void executor.reconciliar();
    return () => {
      desproteger();
      sair();
      chrome.runtime.onMessage.removeListener(ouvir);
      if (executor.atual.fase !== 'parada' && executor.atual.fase !== 'concluida') void executor.pausar('painel trocou de campanha');
    };
  }, [executor]);

  const rodandoAgora = estado != null && estado.fase !== 'parada' && estado.fase !== 'concluida';
  useEffect(() => {
    if (!rodandoAgora) return;
    return iniciarBatimento(pedir);
  }, [rodandoAgora]);

  useEffect(() => {
    void aoMudar();
    // Recarrega as listas do painel quando a campanha muda.
  }, [estado?.campanha]);

  useEffect(() => {
    if (estado?.fase !== 'intervalo') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado?.fase]);

  const mapaContatos = useMemo(() => new Map(dados.contatos.map((ct) => [ct.chave, ct])), [dados.contatos]);
  const mapaDatas = useMemo(() => new Map(dados.contatos.map((ct) => [ct.chave, ct.ultimaConversa])), [dados.contatos]);

  const { tagsExibicaoPorChave, etiquetasCrm } = useMemo(() => {
    const mapaExibicao = new Map<string, Array<{ id: string; nome: string; cor: string }>>();
    const listaEtq = crm?.dados?.etiquetas ?? [];
    if (!crm?.dados) return { tagsExibicaoPorChave: mapaExibicao, etiquetasCrm: listaEtq };
    const mapaEtqPorId = new Map(listaEtq.map((e) => [e.id, e]));

    for (const ct of dados.contatos) {
      const crmC = acharContato(crm.dados, { nome: ct.nome });
      if (crmC && crmC.etiquetas.length > 0) {
        const tags: Array<{ id: string; nome: string; cor: string }> = [];
        for (const etqId of crmC.etiquetas) {
          const etq = mapaEtqPorId.get(etqId);
          if (etq) tags.push({ id: etq.id, nome: etq.nome, cor: etq.cor });
        }
        if (tags.length > 0) mapaExibicao.set(ct.chave, tags);
      }
    }
    return { tagsExibicaoPorChave: mapaExibicao, etiquetasCrm: listaEtq };
  }, [crm?.dados, dados.contatos]);

  const obterTags = (chave: string, nome: string) => {
    const doMapa = tagsExibicaoPorChave.get(chave);
    if (doMapa) return doMapa;
    if (!crm?.dados) return [];
    const crmC = acharContato(crm.dados, { nome });
    if (!crmC || crmC.etiquetas.length === 0) return [];
    const mapaEtqPorId = new Map(etiquetasCrm.map((e) => [e.id, e]));
    return crmC.etiquetas
      .map((id) => mapaEtqPorId.get(id))
      .filter((x): x is { id: string; nome: string; cor: string } => Boolean(x));
  };
  const c = estado?.campanha ?? null;
  const itensExibidos = useMemo(() => {
    if (!c) return [];
    if (filtroLista === 'todos') return c.itens;
    return c.itens.filter((i) => i.status === filtroLista);
  }, [c, filtroLista]);

  if (campanhas.length === 0 || !executor || !estado || !c) {
    return <p className="ajuda">Nenhuma campanha aprovada ainda (aba 2).</p>;
  }

  const r = resumo(c);
  const rodando = estado.fase !== 'parada' && estado.fase !== 'concluida';
  const horario = dentroDoHorario(new Date());
  const faltaSeg = estado.liberaEm ? Math.max(0, Math.ceil((estado.liberaEm - agora) / 1000)) : null;
  const item = estado.itemAtual;
  const podeAgir = estado.fase === 'aguardando_envio' && item != null;

  return (
    <section>
      <label>
        Campanha
        <select value={idEscolhido ?? ''} onChange={(e) => aoEscolher(e.target.value)} disabled={rodando}>
          {campanhas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} — {x.status.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      <div className="cartao">
        <ul className="numeros">
          <li><b>{r.enviado}</b> enviados</li>
          <li><b>{r.pendente}</b> pendentes</li>
          <li><b>{r.pulado}</b> pulados</li>
          <li><b>{r.problema}</b> problemas</li>
          <li><b>{r.revisar}</b> a revisar</li>
          <li><b>{r.nao_cliente + r.nao_enviar}</b> não enviar</li>
        </ul>
        {r.problema > 0 && !rodando && (
          <p style={{ marginTop: 8 }}>
            <button type="button" style={{ fontSize: '.82rem', padding: '4px 8px', cursor: 'pointer' }} onClick={() => void executor.recolocarProblemasComoPendentes()}>
              Recolocar {r.problema} com problema como pendentes
            </button>
          </p>
        )}
        {!rodando && r.pendente > 1 && (
          <p style={{ marginTop: 8 }}>
            <button
              type="button"
              style={{ fontSize: '.82rem', padding: '4px 8px', cursor: 'pointer', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 4, fontWeight: 600 }}
              onClick={() => void executor.ordenarPendentesPorData(mapaDatas)}
              title="Organiza os pendentes do mais recente para o mais antigo"
            >
              ⇅ Reordenar {r.pendente} pendentes por data
            </button>
          </p>
        )}
        <p className="info">
          Hoje: {estado.enviosHoje}
          {estado.tetoDiario ? `/${estado.tetoDiario}` : ''} envios · {horario.ok ? 'dentro do horário' : horario.motivo}
        </p>
      </div>

      <div className={`cartao estado-${estado.fase}`}>
        <h3>{ROTULO_FASE[estado.fase]}</h3>
        {estado.fase === 'intervalo' && faltaSeg != null && <p className="contagem">Próximo em {faltaSeg} s</p>}
        {estado.mensagem && <p className={estado.fase === 'concluida' ? 'info' : 'aviso'}>{estado.mensagem}</p>}
        {item && (
          <>
            <p>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--suave)', marginRight: 6 }}>
                #{c.itens.findIndex((x) => x.chave === item.chave) + 1} de {c.itens.length}
              </span>
              <b>{item.nome}</b>
              {obterTags(item.chave, item.nome).map((t) => (
                <span key={t.id} style={{ fontSize: 10, background: t.cor, color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                  {t.nome}
                </span>
              ))}
              {crm && (
                <select
                  aria-label={`Tag para ${item.nome}`}
                  value=""
                  onChange={async (e) => {
                    const etqId = e.target.value;
                    if (!etqId) return;
                    await crm.fazer((r) => r.alternarEtiqueta({ nome: item.nome }, etqId));
                  }}
                  style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, border: '1px solid var(--borda)', background: '#fff', cursor: 'pointer', color: 'var(--suave)' }}
                >
                  <option value="">+ tag</option>
                  {etiquetasCrm.map((t) => (
                    <option key={t.id} value={t.id}>
                      {obterTags(item.chave, item.nome).some((x) => x.id === t.id) ? `✓ ${t.nome}` : t.nome}
                    </option>
                  ))}
                </select>
              )}
              {(item.ultimaConversa ?? mapaContatos.get(item.chave)?.ultimaConversa) && (
                <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontWeight: 600, marginLeft: 6 }}>
                  {formatarDataBr(item.ultimaConversa ?? mapaContatos.get(item.chave)!.ultimaConversa)}
                </span>
              )}
            </p>
            <div className="balao">{textoDoItem(item)}</div>
          </>
        )}
        {podeAgir && (
          <p className="ajuda">
            {estado.envioAutomatico ? (
              <>Janela de conferência: confira o texto no WhatsApp. Para impedir o envio, use <b>Pular</b> ou <b>Pausar</b> agora.</>
            ) : (
              <>Clique na caixa de mensagem do WhatsApp, confira e aperte <b>Enter</b>. A extensão percebe o envio e segue sozinha.</>
            )}
          </p>
        )}

        <div className="botoes">
          {!rodando && c.status !== 'concluida' && (
            <button type="button" className="primario" onClick={() => void executor.iniciar()}>
              {c.status === 'em_execucao' || r.enviado + r.pulado + r.problema > 0 ? 'Retomar' : 'Iniciar'}
            </button>
          )}
          {rodando && (
            <button type="button" onClick={() => void executor.pausar()}>
              Pausar
            </button>
          )}
        </div>
        {podeAgir && (
          <div className="botoes">
            <button type="button" onClick={() => void executor.acao('pulado')}>Pular</button>
            <button type="button" onClick={() => void executor.acao('nao_cliente', 'não é cliente')}>Não é cliente</button>
            <button type="button" onClick={() => void executor.acao('problema', 'marcado como problema por você')}>Problema</button>
            <button type="button" className="perigo" onClick={() => void executor.acao('nao_enviar', 'não enviar mais')}>
              Não enviar mais
            </button>
          </div>
        )}
      </div>

      <div className="cartao" style={{ padding: '10px 14px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={estado.envioAutomatico}
            onChange={(e) => {
              salvarPreferencia('envioAutomatico', e.target.checked ? '1' : '0');
              executor.setEnvioAutomatico(e.target.checked);
            }}
          />
          <span>Envio automático (opcional): a extensão clica em Enviar depois da janela de conferência</span>
        </label>
        <p style={{ margin: '4px 0 0 24px', fontSize: 11, color: 'var(--suave)' }}>
          {estado.envioAutomatico
            ? 'Ligado: depois de colar, há uma janela de conferência de 2 a 4 segundos. Imediatamente antes do clique a extensão reconfere a conversa, o texto exato e a caixa; se algo mudar, não clica e pausa. Só conta como enviado se a mensagem aparecer no chat em até 20 s. Se o painel fechar, a campanha pausa e nada é clicado.'
            : 'Desligado: a mensagem é colada e você confere e aperta Enter. Ao ligar, a escolha fica salva para as próximas campanhas.'}
        </p>
      </div>

      <details className="cartao" open>
        <summary>Contatos da campanha ({c.itens.length})</summary>
        <div className="botoes" style={{ margin: '8px 0', gap: 4 }}>
          {(['todos', 'pendente', 'problema', 'revisar', 'enviado', 'pulado'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={filtroLista === st ? 'primario pequeno' : 'pequeno'}
              onClick={() => setFiltroLista(st)}
            >
              {st === 'todos' ? `Todos (${c.itens.length})` : `${st === 'pendente' ? 'Pendentes' : st === 'problema' ? 'Problemas' : st === 'revisar' ? 'Revisar' : st === 'enviado' ? 'Enviados' : 'Pulados'} (${r[st] ?? 0})`}
            </button>
          ))}
        </div>
        <ul className="lista">
          {itensExibidos.map((i) => (
            <li key={i.chave} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--suave)', minWidth: 22 }}>
                      #{c.itens.findIndex((x) => x.chave === i.chave) + 1}
                    </span>
                    <b>{i.nome}</b>
                    {obterTags(i.chave, i.nome).map((t) => (
                      <span key={t.id} style={{ fontSize: 10, background: t.cor, color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                        {t.nome}
                      </span>
                    ))}
                    {crm && (
                      <select
                        aria-label={`Tag para ${i.nome}`}
                        value=""
                        onChange={async (e) => {
                          const etqId = e.target.value;
                          if (!etqId) return;
                          await crm.fazer((r) => r.alternarEtiqueta({ nome: i.nome }, etqId));
                        }}
                        style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, border: '1px solid var(--borda)', background: '#fff', cursor: 'pointer', color: 'var(--suave)' }}
                      >
                        <option value="">+ tag</option>
                        {etiquetasCrm.map((t) => (
                          <option key={t.id} value={t.id}>
                            {obterTags(i.chave, i.nome).some((x) => x.id === t.id) ? `✓ ${t.nome}` : t.nome}
                          </option>
                        ))}
                      </select>
                    )}
                    {(i.ultimaConversa ?? mapaContatos.get(i.chave)?.ultimaConversa) && (
                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {formatarDataBr(i.ultimaConversa ?? mapaContatos.get(i.chave)!.ultimaConversa)}
                      </span>
                    )}
                  </div>
                  <small style={{ marginLeft: 6, color: i.status === 'enviado' ? 'var(--ok)' : i.status === 'problema' ? 'var(--erro)' : 'var(--suave)' }}>
                    — {i.status.replace('_', ' ')}{i.motivo ? ` (${i.motivo})` : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(i.status === 'pendente' || i.status === 'problema' || i.status === 'revisar') && (
                    <button type="button" className="pequeno" title="Pular este contato (não enviar nesta campanha)" onClick={() => void executor.pularItem(i.chave)}>
                      Pular
                    </button>
                  )}
                  {i.status === 'problema' && (
                    <button type="button" className="pequeno primario" onClick={() => void executor.recolocarPendente(i.chave)}>
                      Tentar de novo
                    </button>
                  )}
                  {i.status === 'revisar' && (
                    <button
                      type="button"
                      className="pequeno"
                      title="Só use depois de conferir no WhatsApp que a mensagem NÃO saiu"
                      onClick={() => void executor.recolocarPendente(i.chave)}
                    >
                      Conferi: não saiu
                    </button>
                  )}
                  {i.status === 'pulado' && (
                    <button type="button" className="pequeno" onClick={() => void executor.recolocarPendente(i.chave)}>
                      Recolocar
                    </button>
                  )}
                  {(i.status === 'pendente' || i.status === 'problema' || i.status === 'revisar') && (
                    <button type="button" className="pequeno perigo" title="Bloquear (não enviar mais nenhuma campanha)" onClick={() => void executor.bloquearItem(i.chave)}>
                      Não enviar
                    </button>
                  )}
                </div>
              </div>

              {i.status === 'pendente' && (
                <div style={{ marginTop: 6 }}>
                  <label className="inline" style={{ fontSize: 12 }}>
                    <span>Primeiro nome:</span>
                    <input
                      style={{ padding: '2px 6px', fontSize: 12, width: 140 }}
                      value={i.primeiroNome ?? ''}
                      onChange={(e) => void executor.editarItem(i.chave, e.target.value)}
                    />
                  </label>
                  <div className="balao" style={{ marginTop: 4, fontSize: 12 }}>
                    {textoDoItem(i)}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
