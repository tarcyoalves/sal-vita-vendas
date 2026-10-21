import { useEffect, useMemo, useState } from 'react';
import type { Ajustes } from '../shared/ajustes';
import type { Banco } from '../shared/banco';
import { itensComErro, motivosAgrupados, resumo, terminouComProblemas, textoDoItem } from '../shared/campanha';
import type { RegistroDiagnostico } from '../shared/diagnostico';
import { ehEventoConteudo } from '../shared/mensagens';
import { dentroDoHorario } from '../shared/politica';
import type { DadosLocais } from './App';
import { type EstadoExecutor, Executor } from './executor';
import { BotoesDiagnostico } from './BotoesDiagnostico';
import { FilaProximos } from './FilaProximos';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  registro: RegistroDiagnostico;
  dados: DadosLocais;
  ajustes: Ajustes;
  campanhaId: string | null;
  aoEscolher: (id: string) => void;
  aoMudar: () => Promise<void>;
}

const ROTULO_FASE: Record<EstadoExecutor['fase'], string> = {
  parada: 'Parada',
  abrindo: 'Abrindo a conversa…',
  aguardando_envio: 'Confira o texto no WhatsApp e aperte Enter lá',
  contagem: 'Enviando automaticamente…',
  confirmando: 'Confirmando que a mensagem saiu…',
  intervalo: 'Intervalo entre contatos',
  proximo_pronto: 'Próximo pronto — clique em Abrir próximo',
  concluida: 'Concluída',
};

export function Execucao({ db, registro, dados, ajustes, campanhaId, aoEscolher, aoMudar }: Props) {
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
              diagnostico: registro,
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
    [db, registro, idEscolhido],
  );
  const [estado, setEstado] = useState<EstadoExecutor | null>(null);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (!executor) {
      setEstado(null);
      return;
    }
    const sair = executor.assinar(setEstado);
    // Painel (re)aberto: recupera o item que ficou em andamento e os envios percebidos com o painel fechado.
    void executor.preparar();
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
    if (estado?.fase !== 'intervalo' && estado?.fase !== 'contagem' && estado?.fase !== 'confirmando') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado?.fase]);

  if (campanhas.length === 0 || !executor || !estado) {
    return <p className="ajuda">Nenhuma campanha aprovada ainda (aba 2).</p>;
  }

  const c = estado.campanha;
  const r = resumo(c);
  const rodando = estado.fase !== 'parada' && estado.fase !== 'concluida';
  const horario = dentroDoHorario(new Date(), ajustes.horarios);
  const faltaSeg = estado.liberaEm ? Math.max(0, Math.ceil((estado.liberaEm - agora) / 1000)) : null;
  const item = estado.itemAtual;
  const comProblemas = terminouComProblemas(c);
  const erros = itensComErro(c);
  const erroGeral = estado.erroGeral;
  const podeAgir = estado.fase === 'aguardando_envio' && item != null;
  const emAndamento = !rodando ? estado.emAndamento : null;
  const podeJaEnviei = podeAgir || emAndamento != null;

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
          {r.removido > 0 && <li><b>{r.removido}</b> removidos</li>}
        </ul>
        <p className="info">
          Hoje: {estado.enviosHoje}
          {estado.tetoDiario ? `/${estado.tetoDiario}` : ''} envios · {horario.ok ? 'dentro do horário' : horario.motivo}
        </p>
      </div>

      <div className={`cartao estado-${comProblemas ? 'concluida_problemas' : estado.fase}`}>
        <h3>{comProblemas ? 'Concluída com problemas' : ROTULO_FASE[estado.fase]}</h3>
        {estado.fase === 'intervalo' && faltaSeg != null && <p className="contagem">Próximo em {faltaSeg} s</p>}
        {estado.fase === 'contagem' && item && faltaSeg != null && (
          <p className="contagem contagem-envio" role="status">
            Enviando para <b>{item.nome}</b> em {faltaSeg}s
          </p>
        )}
        {estado.mensagem && <p className={estado.fase === 'concluida' && !comProblemas ? 'info' : 'aviso'}>{estado.mensagem}</p>}
        {item && (
          <>
            <p>
              <b>{item.nome}</b>
            </p>
            <div className="balao">{textoDoItem(item)}</div>
          </>
        )}
        {emAndamento && (
          <>
            <p className="aviso">
              Ficou em andamento: <b>{emAndamento.nome}</b>. Se a mensagem já saiu, clique em <b>Já enviei</b>. Ao retomar, confiro o WhatsApp antes de
              colar qualquer coisa — nunca envio de novo para o mesmo contato.
            </p>
            <div className="balao">{emAndamento.texto}</div>
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
          {estado.fase === 'proximo_pronto' && (
            <button type="button" className="primario" accessKey="p" title="Atalho: Alt+Shift+P" onClick={() => void executor.abrirProximo()}>
              Abrir próximo (Alt+Shift+P)
            </button>
          )}
          {estado.fase === 'contagem' && (
            <button type="button" className="perigo" onClick={() => void executor.cancelarEnvio()}>
              Cancelar
            </button>
          )}
          {rodando && estado.fase !== 'contagem' && (
            <button type="button" onClick={() => void executor.pausar()}>
              Pausar
            </button>
          )}
          {podeJaEnviei && (
            <button type="button" onClick={() => void executor.jaEnviei()}>
              Já enviei
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

      <FilaProximos executor={executor} estado={estado} dados={dados} />

      {estado.alertaAutomatico && (
        <div className="alerta" role="alert">
          <h3>Modo automático desligado</h3>
          <p>{estado.alertaAutomatico}</p>
        </div>
      )}

      {(erros.length > 0 || erroGeral) && (
        <div className="alerta" role="alert">
          <h3>
            {!erroGeral && erros.every((i) => i.status === 'pulado')
              ? erros.length === 1
                ? '1 contato pulado para revisar'
                : 'Contatos pulados para revisar'
              : erros.length + (erroGeral ? 1 : 0) === 1
                ? 'Deu problema com 1 contato'
                : 'Deu problema com contatos'}
          </h3>
          {comProblemas && (
            <ul className="lista">
              {motivosAgrupados(c).map((g) => (
                <li key={g.codigo}>
                  <b>{g.quantidade}×</b> <code>{g.codigo}</code> — {g.mensagem}
                </li>
              ))}
            </ul>
          )}
          {erroGeral && (
            <p>
              <b>{erroGeral.nome}</b> · <code>{erroGeral.codigo}</code>
              <br />
              {erroGeral.mensagem}
            </p>
          )}
          {erros.map((i) => (
            <p key={i.chave}>
              <b>{i.nome}</b> · <code>{i.codigo ?? 'sem código'}</code>
              <br />
              {i.motivo ?? 'sem detalhe registrado'}
            </p>
          ))}
          <p className="ajuda">Se não souber o motivo, copie o diagnóstico e mande para quem cuida da extensão.</p>
          <BotoesDiagnostico registro={registro} />
        </div>
      )}

    </section>
  );
}
