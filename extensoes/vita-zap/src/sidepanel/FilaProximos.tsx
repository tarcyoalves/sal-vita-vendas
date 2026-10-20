// Fila dos próximos contatos (0.3.3): mesma aparência da Prévia, editável durante a execução.
// O item em andamento aparece no topo, travado. Todas as mudanças passam pelo Executor, que grava
// no IndexedDB na hora (o executor sempre lê a versão nova).

import { useState } from 'react';
import { type ItemCampanha, aplicarEdicao, temTextoPersonalizado, textoDoItem } from '../shared/campanha';
import { formatarDataBr } from '../shared/datas';
import { montarMensagem } from '../shared/texto';
import type { DadosLocais } from './App';
import type { EstadoExecutor, Executor } from './executor';

interface Props {
  executor: Executor;
  estado: EstadoExecutor;
  dados: DadosLocais;
}

function origemDe(item: ItemCampanha, dados: DadosLocais): string {
  if (item.origem) return item.origem;
  const contato = dados.contatos.find((c) => c.chave === item.chave);
  return contato?.ultimaConversa ? `última conversa ${formatarDataBr(contato.ultimaConversa)}` : 'origem não registrada';
}

interface LinhaProps {
  item: ItemCampanha;
  primeiro: boolean;
  ultimo: boolean;
  executor: Executor;
  dados: DadosLocais;
}

function Linha({ item, primeiro, ultimo, executor, dados }: LinhaProps) {
  const salvoNome = item.primeiroNome;
  const salvoTexto = textoDoItem(item);
  const assinatura = `${salvoNome}\u0000${salvoTexto}`;
  const [visto, setVisto] = useState(assinatura);
  const [nome, setNome] = useState(salvoNome);
  const [texto, setTexto] = useState(salvoTexto);
  const [erroServidor, setErroServidor] = useState<string[]>([]);
  // Mudou por fora (ex.: outro salvamento): descarta o rascunho.
  if (visto !== assinatura) {
    setVisto(assinatura);
    setNome(salvoNome);
    setTexto(salvoTexto);
  }
  const sujo = nome !== salvoNome || texto !== salvoTexto;
  const validacao = sujo ? aplicarEdicao(item, { primeiroNome: nome, texto }) : null;
  const erros = [...(validacao && !validacao.ok ? validacao.erros : []), ...erroServidor];

  function mudarNome(v: string) {
    setErroServidor([]);
    // Texto ainda é o do modelo: acompanha o nome novo, como na Prévia.
    if (!temTextoPersonalizado(item) && texto === montarMensagem(item.modelo, nome)) setTexto(montarMensagem(item.modelo, v));
    setNome(v);
  }

  async function salvar() {
    const r = await executor.editarItem(item.chave, { primeiroNome: nome, texto });
    setErroServidor(r.ok ? [] : r.erros);
  }

  return (
    <li>
      <div className="lista-topo">
        <b>{item.nome}</b>
        <button type="button" className="pequeno" onClick={() => void executor.removerItem(item.chave)}>
          Remover
        </button>
      </div>
      <small>{origemDe(item, dados)}</small>
      <label className="inline">
        Primeiro nome
        <input value={nome} onChange={(e) => mudarNome(e.target.value)} aria-label={`Primeiro nome de ${item.nome}`} />
      </label>
      <textarea
        className="texto-fila"
        rows={3}
        value={texto}
        onChange={(e) => {
          setErroServidor([]);
          setTexto(e.target.value);
        }}
        aria-label={`Texto para ${item.nome}`}
      />
      {temTextoPersonalizado(item) && !sujo && <small>texto editado por você</small>}
      {erros.map((e) => (
        <p key={e} className="erro">
          {e}
        </p>
      ))}
      <div className="botoes">
        <button type="button" className="pequeno primario" disabled={!sujo || erros.length > 0} onClick={() => void salvar()}>
          Salvar
        </button>
        {sujo && (
          <button
            type="button"
            className="pequeno"
            onClick={() => {
              setNome(salvoNome);
              setTexto(salvoTexto);
              setErroServidor([]);
            }}
          >
            Descartar
          </button>
        )}
        <button type="button" className="pequeno" disabled={primeiro} onClick={() => void executor.moverItem(item.chave, 'cima')} aria-label="Subir">
          ↑
        </button>
        <button type="button" className="pequeno" disabled={ultimo} onClick={() => void executor.moverItem(item.chave, 'baixo')} aria-label="Descer">
          ↓
        </button>
        <button type="button" className="pequeno" disabled={primeiro} onClick={() => void executor.moverItem(item.chave, 'topo')}>
          Enviar este a seguir
        </button>
      </div>
    </li>
  );
}

export function FilaProximos({ executor, estado, dados }: Props) {
  const c = estado.campanha;
  const travadas = executor.chavesTravadas();
  const emAndamento = c.itens.filter((i) => i.status === 'pendente' && travadas.has(i.chave));
  const proximos = c.itens.filter((i) => i.status === 'pendente' && !travadas.has(i.chave));
  const concluidos = c.itens.filter((i) => i.status !== 'pendente');
  const encerrada = c.status === 'concluida';

  return (
    <>
      {(emAndamento.length > 0 || proximos.length > 0) && (
        <div className="cartao">
          <h3>Próximos ({proximos.length})</h3>
          {emAndamento.map((i) => (
            <div key={i.chave} className="em-andamento">
              <div className="lista-topo">
                <b>{i.nome}</b>
                <span className="selo-andamento">Em andamento</span>
              </div>
              <small>{origemDe(i, dados)}</small>
              <div className="balao">{textoDoItem(i)}</div>
              <small>Não pode ser editado nem removido agora (use Pular ou Cancelar acima).</small>
            </div>
          ))}
          <ul className="lista">
            {proximos.map((i, n) => (
              <Linha key={i.chave} item={i} primeiro={n === 0} ultimo={n === proximos.length - 1} executor={executor} dados={dados} />
            ))}
          </ul>
        </div>
      )}
      <details className="cartao">
        <summary>Concluídos ({concluidos.length})</summary>
        <ul className="lista">
          {concluidos.map((i) => (
            <li key={i.chave}>
              <div className="lista-topo">
                <span>
                  <b>{i.nome}</b>{' '}
                  <small>
                    — {i.status.replace('_', ' ')}
                    {i.codigo ? ` [${i.codigo}]` : ''}
                    {i.motivo ? ` (${i.motivo})` : ''}
                  </small>
                </span>
                {i.status === 'removido' && !encerrada && (
                  <button type="button" className="pequeno" onClick={() => void executor.desfazerRemocaoItem(i.chave)}>
                    Desfazer remover
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
