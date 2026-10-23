import { useEffect, useMemo, useState } from 'react';
import type { Banco } from '../shared/banco';
import { resumo, textoDoItem } from '../shared/campanha';
import { ehEventoConteudo } from '../shared/mensagens';
import { dentroDoHorario } from '../shared/politica';
import type { DadosLocais } from './App';
import { type EstadoExecutor, Executor } from './executor';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  dados: DadosLocais;
  campanhaId: string | null;
  aoEscolher: (id: string) => void;
  aoMudar: () => Promise<void>;
}

const ROTULO_FASE: Record<EstadoExecutor['fase'], string> = {
  parada: 'Parada',
  abrindo: 'Abrindo a conversa…',
  aguardando_envio: 'Aguardando envio',
  intervalo: 'Intervalo entre contatos',
  concluida: 'Concluída',
};

export function Execucao({ db, dados, campanhaId, aoEscolher, aoMudar }: Props) {
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
  const [filtroLista, setFiltroLista] = useState<'todos' | 'pendente' | 'problema' | 'enviado' | 'pulado'>('todos');

  useEffect(() => {
    if (!executor) {
      setEstado(null);
      return;
    }
    const sair = executor.assinar(setEstado);
    const ouvir = (msg: unknown) => {
      if (ehEventoConteudo(msg)) void executor.aoReceberEvento(msg);
    };
    chrome.runtime.onMessage.addListener(ouvir);
    return () => {
      sair();
      chrome.runtime.onMessage.removeListener(ouvir);
      if (executor.atual.fase !== 'parada' && executor.atual.fase !== 'concluida') void executor.pausar('painel trocou de campanha');
    };
  }, [executor]);

  useEffect(() => {
    void aoMudar();
    // Recarrega as listas do painel quando a campanha muda.
  }, [estado?.campanha]);

  useEffect(() => {
    if (estado?.fase !== 'intervalo') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado?.fase]);

  if (campanhas.length === 0 || !executor || !estado) {
    return <p className="ajuda">Nenhuma campanha aprovada ainda (aba 2).</p>;
  }

  const c = estado.campanha;
  const r = resumo(c);
  const rodando = estado.fase !== 'parada' && estado.fase !== 'concluida';
  const horario = dentroDoHorario(new Date());
  const faltaSeg = estado.liberaEm ? Math.max(0, Math.ceil((estado.liberaEm - agora) / 1000)) : null;
  const item = estado.itemAtual;
  const podeAgir = estado.fase === 'aguardando_envio' && item != null;

  const itensExibidos = useMemo(() => {
    if (filtroLista === 'todos') return c.itens;
    return c.itens.filter((i) => i.status === filtroLista);
  }, [c.itens, filtroLista]);

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
          <li><b>{r.nao_cliente + r.nao_enviar}</b> não enviar</li>
        </ul>
        {r.problema > 0 && !rodando && (
          <p style={{ marginTop: 8 }}>
            <button type="button" style={{ fontSize: '.82rem', padding: '4px 8px', cursor: 'pointer' }} onClick={() => void executor.recolocarProblemasComoPendentes()}>
              Recolocar {r.problema} com problema como pendentes
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
              <b>{item.nome}</b>
            </p>
            <div className="balao">{textoDoItem(item)}</div>
          </>
        )}
        {podeAgir && (
          <p className="ajuda">
            Clique na caixa de mensagem do WhatsApp, confira e aperte <b>Enter</b>. A extensão percebe o envio e segue sozinha.
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
            onChange={(e) => executor.setEnvioAutomatico(e.target.checked)}
          />
          <span>Envio 100% automático (clica em Enviar sozinho)</span>
        </label>
        <p style={{ margin: '4px 0 0 24px', fontSize: 11, color: 'var(--suave)' }}>
          {estado.envioAutomatico
            ? 'Ativado: espera de 2 a 4 segundos após digitar (para parecer humano) e clica no botão Enviar.'
            : 'Desativado: a mensagem é digitada e aguarda você apertar a tecla Enter.'}
        </p>
      </div>

      <details className="cartao" open>
        <summary>Contatos da campanha ({c.itens.length})</summary>
        <div className="botoes" style={{ margin: '8px 0', gap: 4 }}>
          {(['todos', 'pendente', 'problema', 'enviado', 'pulado'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={filtroLista === st ? 'primario pequeno' : 'pequeno'}
              onClick={() => setFiltroLista(st)}
            >
              {st === 'todos' ? `Todos (${c.itens.length})` : `${st === 'pendente' ? 'Pendentes' : st === 'problema' ? 'Problemas' : st === 'enviado' ? 'Enviados' : 'Pulados'} (${r[st] ?? 0})`}
            </button>
          ))}
        </div>
        <ul className="lista">
          {itensExibidos.map((i) => (
            <li key={i.chave} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b>{i.nome}</b>
                  <small style={{ marginLeft: 6, color: i.status === 'enviado' ? 'var(--ok)' : i.status === 'problema' ? 'var(--erro)' : 'var(--suave)' }}>
                    — {i.status.replace('_', ' ')}{i.motivo ? ` (${i.motivo})` : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(i.status === 'pendente' || i.status === 'problema') && (
                    <button type="button" className="pequeno" title="Pular este contato (não enviar nesta campanha)" onClick={() => void executor.pularItem(i.chave)}>
                      Pular
                    </button>
                  )}
                  {i.status === 'problema' && (
                    <button type="button" className="pequeno primario" onClick={() => void executor.recolocarPendente(i.chave)}>
                      Tentar de novo
                    </button>
                  )}
                  {i.status === 'pulado' && (
                    <button type="button" className="pequeno" onClick={() => void executor.recolocarPendente(i.chave)}>
                      Recolocar
                    </button>
                  )}
                  {(i.status === 'pendente' || i.status === 'problema') && (
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
