// Painel "Follow-up" (v0.7.54): cobrança automática de quem não respondeu + "Precisa de você" com resposta sugerida.
//
// - Cobrança automática: o MESMO Executor das campanhas (teto diário compartilhado, horário, intervalo 60–120 s, freio,
//   opt-out, conversa conferida antes do clique). Aqui só se monta a campanha de cobrança e se liga o Executor.
// - Precisa de você: NUNCA sai sozinho. "Abrir e colar" só cola o texto; quem envia é você (Enter).
// - Fica sempre montado (como a aba de envio): trocar de aba não interrompe a cobrança em andamento.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Banco } from '../shared/banco';
import {
  DIAS_MAXIMO,
  DIAS_MINIMO,
  JANELA_DIAS,
  MAX_COBRANCAS,
  ROTULO_CLASSE,
  type ConfigFollowup,
  type Followup,
} from '../shared/followup';
import { MSG_ESCREVA_ANTES, podeLigar, rotuloOrigem, type RascunhoMensagem } from '../shared/followup-estilo';
import { ehEventoConteudo } from '../shared/mensagens';
import { dentroDoHorario } from '../shared/politica';
import { montarMensagem } from '../shared/texto';
import { formatarDataBr, hojeNoFuso } from '../shared/datas';
import type { CrmPainel } from './crm';
import { type EstadoExecutor, Executor } from './executor';
import { MotorFollowup, type ResumoRodada, type VisaoFollowup } from './followup-motor';
import { MensagemCobranca } from './MensagemCobranca';
import { iniciarBatimento, protegerContraFechamento, MOTIVO_PAINEL_FECHADO } from './protecao';
import { assinarTrava, donoDaTrava, liberar, ROTULO_DONO, tentarTravar } from './trava-whatsapp';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  crm: CrmPainel;
}

type Lista = 'cobranca' | 'precisa' | 'saiu' | 'resolvido';

/** De quanto em quanto tempo o painel aberto confere se há o que fazer (sem tocar no WhatsApp quando não há). */
const INTERVALO_CICLO_MS = 20 * 60_000;
const PRIMEIRO_CICLO_MS = 20_000;

export const TEXTO_RISCO =
  'Atenção: o envio automático de mensagens pelo WhatsApp Web viola os Termos de Serviço do WhatsApp e pode levar ao bloqueio ou banimento do número. ' +
  'Os limites do Vita Zap (teto diário compartilhado com as campanhas, horário comercial, intervalo de 60 a 120 s, freio e conferência da conversa antes do clique) ' +
  'REDUZEM o risco, mas NÃO o eliminam. A cobrança só vai para quem não respondeu e nunca para quem está em "Não enviar mais". ' +
  'Quem respondeu NUNCA recebe nada sozinho: você revisa e envia.';

/** Pausas por horário/teto/painel escondido: o ciclo tenta de novo sozinho. Qualquer outra (freio, erro) exige "Retomar". */
export function pausaBenigna(motivo: string | null | undefined): boolean {
  return motivo != null && (/^(domingo|fora do horário|teto diário)/.test(motivo) || motivo === MOTIVO_PAINEL_FECHADO);
}

export function Followup({ db, crm }: Props) {
  const motor = useMemo(
    () =>
      new MotorFollowup({
        db,
        pedir,
        ia: crm.repo,
        criarLembrete: async (nome, venceEm, agora) => {
          const r = await crm.repo.criarLembrete({ ref: { nome }, venceEm }, agora);
          return r.ok ? null : r.erro;
        },
        agora: () => new Date(),
        aleatorio: Math.random,
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
      }),
    [db, crm.repo],
  );

  const [visao, setVisao] = useState<VisaoFollowup | null>(null);
  const [lista, setLista] = useState<Lista>('precisa');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoRodada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [executor, setExecutor] = useState<Executor | null>(null);
  const [estado, setEstado] = useState<EstadoExecutor | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [dono, setDono] = useState(donoDaTrava());
  const manualRef = useRef<{ id: string; nome: string } | null>(null);
  const pararRef = useRef(false);
  const precisaRetomarRef = useRef(false);
  const parouAteRef = useRef<string | null>(null);
  const emCicloRef = useRef(false);
  const visaoRef = useRef<VisaoFollowup | null>(null);
  visaoRef.current = visao;
  const estadoDoExecutor = useRef<EstadoExecutor | null>(null);
  estadoDoExecutor.current = estado;

  const recarregar = useCallback(async () => {
    setVisao(await motor.carregar());
  }, [motor]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  useEffect(() => assinarTrava(() => setDono(donoDaTrava())), []);

  // ── Executor da cobrança (o mesmo das campanhas) ──────────────────────────

  useEffect(() => {
    if (!executor) {
      setEstado(null);
      return;
    }
    const sair = executor.assinar((e) => {
      setEstado(e);
      void motor.aplicarCampanha(e.campanha).then(recarregar);
    });
    const ouvir = (msg: unknown) => {
      if (ehEventoConteudo(msg)) void executor.aoReceberEvento(msg);
    };
    chrome.runtime.onMessage.addListener(ouvir);
    const desproteger = protegerContraFechamento(executor);
    return () => {
      desproteger();
      sair();
      chrome.runtime.onMessage.removeListener(ouvir);
      if (executor.atual.fase !== 'parada' && executor.atual.fase !== 'concluida') void executor.pausar('follow-up trocou de campanha');
    };
  }, [executor, motor, recarregar]);

  const rodando = estado != null && estado.fase !== 'parada' && estado.fase !== 'concluida';
  useEffect(() => {
    if (!rodando) return;
    return iniciarBatimento(pedir);
  }, [rodando]);

  // Terminou ou parou: solta a trava; pausa que não é de horário/teto exige "Retomar" do atendente.
  useEffect(() => {
    if (!estado || rodando) return;
    liberar('followup');
    if (estado.fase === 'parada') {
      if (pausaBenigna(estado.mensagem)) {
        if (/^teto diário/.test(estado.mensagem ?? '')) parouAteRef.current = hojeNoFuso(new Date());
      } else if (estado.mensagem) precisaRetomarRef.current = true;
    }
  }, [estado, rodando]);

  // Mensagem em voo (o painel fechou no meio de uma cobrança): confere a conversa antes de qualquer colagem.
  useEffect(() => {
    let vivo = true;
    void motor.campanhaEmVoo().then(async (c) => {
      if (!c || !vivo) return;
      const ex = new Executor({ db, pedir, agora: () => new Date(), aleatorio: Math.random, agendar: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); }, obterEnvioAutomatico: () => true }, c);
      ex.setEnvioAutomatico(true);
      const ok = await ex.reconciliar();
      await motor.aplicarCampanha(ex.atual.campanha);
      if (vivo) {
        await recarregar();
        if (!ok) setAviso('Havia uma cobrança em andamento quando o painel fechou e não consegui conferir a conversa. Abra o WhatsApp Web e use "Verificar agora".');
      }
    });
    return () => {
      vivo = false;
    };
  }, [motor, db, recarregar]);

  // Envio detectado numa resposta que VOCÊ mandou ("Abrir e colar"): sai de "Precisa de você".
  useEffect(() => {
    const ouvir = (msg: unknown) => {
      if (!ehEventoConteudo(msg) || msg.tipo !== 'vitaZap:envioDetectado') return;
      const m = manualRef.current;
      if (!m || m.nome !== msg.nome) return;
      manualRef.current = null;
      void motor.marcarResolvido(m.id, 'respondido por você').then(recarregar);
    };
    chrome.runtime.onMessage.addListener(ouvir);
    return () => chrome.runtime.onMessage.removeListener(ouvir);
  }, [motor, recarregar]);

  // ── Ciclo ─────────────────────────────────────────────────────────────────

  const iniciarCobrancas = useCallback(
    async (config: ConfigFollowup): Promise<boolean> => {
      const campanha = await motor.montarCampanhaDeCobranca(config);
      await recarregar();
      if (!campanha) return false;
      const ex = new Executor(
        {
          db,
          pedir,
          agora: () => new Date(),
          aleatorio: Math.random,
          agendar: (fn, ms) => {
            const t = setTimeout(fn, ms);
            return () => clearTimeout(t);
          },
          // Envio automático É a decisão do dono para o follow-up (com a confirmação do risco): mesma rotina das campanhas.
          obterEnvioAutomatico: () => true,
        },
        campanha,
      );
      ex.setEnvioAutomatico(true);
      setExecutor(ex);
      await ex.iniciar();
      return true;
    },
    [motor, db, recarregar],
  );

  /** Verifica (lê as conversas, IA) e, se a cobrança automática está ligada e nada pausa, manda as cobranças. */
  const executarCiclo = useCallback(
    async (manual: boolean): Promise<void> => {
      const v = visaoRef.current;
      if (!v || emCicloRef.current) return;
      const dono0 = donoDaTrava();
      if (dono0 && dono0 !== 'followup') {
        if (manual) setAviso(`Agora não: ${ROTULO_DONO[dono0]}.`);
        return;
      }
      if (!tentarTravar('followup')) return;
      emCicloRef.current = true;
      pararRef.current = false;
      setAviso(null);
      setResumo(null);
      let entregouAoExecutor = false;
      try {
        setOcupado('Lendo as conversas…');
        const r = await motor.verificar(v.config, { recentes: manual, forcar: manual, parar: () => pararRef.current, aoProgredir: setOcupado });
        setResumo(r);
        if (r.aviso) setAviso(r.aviso);
        await recarregar();
        const config = (await motor.carregar()).config;
        if (config.ligado && !config.pausado && !r.parou && !(precisaRetomarRef.current && !manual)) {
          setOcupado('Preparando as cobranças…');
          entregouAoExecutor = await iniciarCobrancas(config);
        }
      } catch (e) {
        setAviso(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(null);
        emCicloRef.current = false;
        // Se o Executor não assumiu, solta a trava (se assumiu, ela cai quando ele parar: efeito do estado).
        if (!entregouAoExecutor) liberar('followup');
      }
    },
    [motor, recarregar, iniciarCobrancas],
  );

  const ligadoSemPausa = visao?.config.ligado === true && visao.config.pausado !== true;
  // Painel aberto + cobrança ligada: confere periodicamente (só mexe no WhatsApp se há conversa a ler ou cobrança a enviar).
  useEffect(() => {
    if (!ligadoSemPausa) return;
    const tentar = () => {
      if (document.visibilityState !== 'visible' || precisaRetomarRef.current) return;
      if (parouAteRef.current === hojeNoFuso(new Date())) return;
      if (!dentroDoHorario(new Date()).ok) return;
      if (estadoDoExecutor.current && executorAtivo(estadoDoExecutor.current)) return;
      void executarCiclo(false);
    };
    const primeiro = setTimeout(tentar, PRIMEIRO_CICLO_MS);
    const periodico = setInterval(tentar, INTERVALO_CICLO_MS);
    return () => {
      clearTimeout(primeiro);
      clearInterval(periodico);
    };
  }, [ligadoSemPausa, executarCiclo]);

  // ── Ações ─────────────────────────────────────────────────────────────────

  const mudarConfig = async (mudanca: Partial<ConfigFollowup>): Promise<void> => {
    if (!visao) return;
    const nova = await motor.salvarConfig({ ...visao.config, ...mudanca });
    await recarregar();
    if (mudanca.pausado === true && executor && executorAtivo(executor.atual)) await executor.pausar('follow-up pausado por você');
    if (mudanca.pausado === false) precisaRetomarRef.current = false;
    if (nova.ligado && mudanca.ligado === true) void executarCiclo(true);
  };

  const ligar = async (ligado: boolean): Promise<void> => {
    if (!ligado) {
      await mudarConfig({ ligado: false });
      return;
    }
    // Os modelos genéricos não são mais enviados: sem texto do dono salvo, não liga.
    const pode = podeLigar(visao?.config ?? { textos1: [] });
    if (!pode.ok) {
      setAviso(pode.motivo);
      return;
    }
    setAviso(null);
    const total = visao?.followups.filter((f) => f.estado === 'monitorando').length ?? 0;
    const ok = window.confirm(
      `${TEXTO_RISCO}\n\nHá ${total} contato(s) de disparos dos últimos ${JANELA_DIAS} dias sendo acompanhados. ` +
        `Quem não responder em ${visao?.config.dias ?? 3} dia(s) será cobrado automaticamente (no máximo ${MAX_COBRANCAS} vezes).\n\nLigar a cobrança automática?`,
    );
    if (ok) await mudarConfig({ ligado: true, confirmouRisco: true, pausado: false });
  };

  /** Salva a mensagem do dono e refaz o texto de quem já está na fila (nunca sai texto preparado com a configuração antiga). */
  const salvarMensagem = async (r: RascunhoMensagem): Promise<void> => {
    if (!visao || emCicloRef.current) return;
    emCicloRef.current = true;
    setOcupado('Salvando a mensagem e refazendo os textos da fila…');
    try {
      await motor.salvarConfig({ ...visao.config, modo: r.modo, textos1: r.textos1, textos2: r.textos2, estilo: r.estilo });
      await recarregar();
      setAviso(null);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
      emCicloRef.current = false;
    }
  };

  const verificarAgora = async (): Promise<void> => {
    await executarCiclo(true);
  };

  const pararTudo = async (): Promise<void> => {
    pararRef.current = true;
    if (executor && executorAtivo(executor.atual)) await executor.pausar('pausado por você');
  };

  const retomar = async (): Promise<void> => {
    precisaRetomarRef.current = false;
    parouAteRef.current = null;
    await executarCiclo(true);
  };

  const abrirEColar = async (f: Followup, texto: string): Promise<void> => {
    const t = texto.trim();
    if (t === '') return;
    if (!tentarTravar('manual')) {
      const d = donoDaTrava();
      setAviso(`Agora não: ${d ? ROTULO_DONO[d] : 'WhatsApp ocupado'}.`);
      return;
    }
    setAviso(null);
    try {
      const r = await pedir({ tipo: 'abrirEColar', nome: f.nome, texto: t, envioAutomatico: false }, true);
      if (!r.ok) setAviso(r.erro);
      else {
        manualRef.current = { id: f.id, nome: f.nome };
        setAviso(`Texto colado na conversa de ${f.nome}. Confira e aperte Enter: quem envia é você.`);
      }
    } finally {
      liberar('manual');
    }
  };

  const abrirConversa = async (f: Followup): Promise<void> => {
    if (!tentarTravar('manual')) return;
    try {
      const r = await pedir({ tipo: 'lerConversa', nome: f.nome }, true);
      if (!r.ok && r.codigo !== 'grupo' && r.codigo !== 'nao_confirmado') setAviso(r.erro);
    } finally {
      liberar('manual');
    }
  };

  const acao = (fn: () => Promise<void>) => () => void fn().then(recarregar);

  if (!visao) return <p className="carregando">Carregando…</p>;
  const { config, listas } = visao;
  const bloqueadoPor = dono && dono !== 'followup' ? ROTULO_DONO[dono] : null;
  const trabalhando = ocupado != null || rodando;

  return (
    <section>
      <div className="cartao">
        <h3>Follow-up com IA</h3>
        <p className="ajuda">
          Depois de um disparo, o Vita Zap lê as conversas (só leitura). Quem <b>não respondeu</b> é cobrado sozinho depois de {config.dias} dia(s), no máximo {MAX_COBRANCAS} vezes.
          Quem <b>respondeu</b> e precisa de atenção (preço, interesse, reclamação, pergunta, compra depois) vai para <b>Precisa de você</b>, com uma resposta sugerida: você revisa e envia.
          Quem pede para sair vai para "não enviar mais".
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={config.ligado} onChange={(e) => void ligar(e.target.checked)} />
          <span>Cobrança automática de quem não respondeu</span>
        </label>
        {!podeLigar(config).ok && !config.ligado && <p className="aviso">{MSG_ESCREVA_ANTES}: use "Sua mensagem de cobrança", logo abaixo.</p>}
        <div style={{ marginTop: 8, fontSize: 12.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <label htmlFor="followup-dias">Cobrar depois de</label>
          <select id="followup-dias" value={config.dias} onChange={(e) => void mudarConfig({ dias: Number(e.target.value) })} style={{ width: 'auto' }}>
            {Array.from({ length: DIAS_MAXIMO - DIAS_MINIMO + 1 }, (_, i) => i + DIAS_MINIMO).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span>dia(s) sem resposta (também é o intervalo mínimo entre cobranças)</span>
        </div>
        <p className="aviso" style={{ marginTop: 8 }}>{TEXTO_RISCO}</p>
        <div className="botoes">
          <button type="button" className="primario" disabled={trabalhando || bloqueadoPor != null} onClick={() => void verificarAgora()} title="Lê agora as conversas dos disparos (a partir de 2 horas) e manda as respostas para a IA">
            Verificar respostas agora
          </button>
          {config.ligado && !config.pausado && (
            <button type="button" onClick={() => void mudarConfig({ pausado: true })}>
              Pausar follow-up
            </button>
          )}
          {config.ligado && config.pausado && (
            <button type="button" className="primario" onClick={() => void mudarConfig({ pausado: false })}>
              Retomar follow-up
            </button>
          )}
          {trabalhando && (
            <button type="button" onClick={() => void pararTudo()}>
              Parar agora
            </button>
          )}
          {precisaRetomarRef.current && config.ligado && !trabalhando && (
            <button type="button" onClick={() => void retomar()}>
              Conferi o WhatsApp: retomar
            </button>
          )}
        </div>
        {config.ligado && config.pausado && <p className="aviso">Follow-up pausado: nada é cobrado sozinho até você retomar.</p>}
        {bloqueadoPor && <p className="ajuda">Aguardando: {bloqueadoPor}.</p>}
        {ocupado && <p className="info">{ocupado}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        {resumo && (
          <p className="ajuda">
            Última rodada: {resumo.lidas} conversa(s) lida(s) · {resumo.cobrancas} para cobrar · {resumo.precisam} precisam de você · {resumo.saidas} pediram para sair · {resumo.resolvidos} resolvidas · {resumo.revisar} a revisar{resumo.parou ? ' · parou antes do fim' : ''}.
          </p>
        )}
        <p className="ajuda">
          Aguardando passar {config.dias} dia(s): {listas.monitorando.length}. Só acompanha disparos dos últimos {JANELA_DIAS} dias. O painel precisa ficar aberto (fechou ou escondeu = nada é clicado).
        </p>
      </div>

      <MensagemCobranca config={config} ocupado={trabalhando} onSalvar={salvarMensagem} />

      <div className="botoes" role="tablist" aria-label="Listas do follow-up">
        {(
          [
            ['cobranca', `Cobrança automática (${listas.cobranca.length})`],
            ['precisa', `Precisa de você (${listas.precisa.length})`],
            ['saiu', `Pediram para sair (${listas.saiu.length})`],
            ['resolvido', `Resolvido (${listas.resolvido.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={lista === id} className={lista === id ? 'primario pequeno' : 'pequeno'} onClick={() => setLista(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {lista === 'cobranca' && (
        <div className="cartao">
          <h3>
            Cobrança automática — {listas.cobranca.length} agendada(s), {visao.enviadasHoje} enviada(s) hoje
          </h3>
          {estado && (
            <p className="ajuda">
              {estado.fase === 'intervalo' ? 'Intervalo entre contatos…' : estado.fase === 'abrindo' ? 'Abrindo a conversa…' : estado.fase === 'aguardando_envio' ? 'Conferindo e enviando…' : estado.fase === 'concluida' ? 'Rodada concluída.' : 'Parado.'}
              {estado.tetoDiario ? ` Teto diário (compartilhado com as campanhas): ${estado.enviosHoje}/${estado.tetoDiario}.` : ''}
              {estado.mensagem ? ` ${estado.mensagem}` : ''}
            </p>
          )}
          {listas.cobranca.length === 0 ? (
            <p className="ajuda">Ninguém na fila. Quem passar {config.dias} dia(s) sem responder entra aqui sozinho.</p>
          ) : (
            <ul className="lista">
              {listas.cobranca.map((f) => (
                <li key={f.id}>
                  <b>{f.nome}</b> <small>cobrança {f.cobrancas.length + 1} de {MAX_COBRANCAS} · texto: {rotuloOrigem(f.cobrancaOrigem)}</small>
                  <div className="balao">{montarMensagem(f.cobrancaModelo ?? '', f.primeiroNome)}</div>
                  <div className="botoes">
                    <button type="button" className="pequeno" onClick={acao(() => motor.marcarResolvido(f.id, 'tirado da fila por você'))}>
                      Tirar da fila
                    </button>
                    <button type="button" className="pequeno perigo" onClick={acao(() => motor.naoEnviarMais(f.id))}>
                      Não enviar mais
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="ajuda">Para enviar agora (dentro do horário e do teto), use "Verificar respostas agora": ele lê, prepara e envia.</p>
        </div>
      )}

      {lista === 'precisa' && (
        <div className="cartao">
          <h3>Precisa de você ({listas.precisa.length})</h3>
          <p className="ajuda">Nada aqui sai sozinho. "Abrir e colar" só cola o texto na conversa: você confere e aperta Enter.</p>
          {listas.precisa.length === 0 ? (
            <p className="ajuda">Ninguém esperando por você.</p>
          ) : (
            <ul className="lista">
              {listas.precisa.map((f) => {
                const revisar = f.estado === 'revisar';
                const texto = rascunhos[f.id] ?? f.sugestao ?? '';
                return (
                  <li key={f.id}>
                    <b>{f.nome}</b>{' '}
                    {revisar ? <span className="aviso" style={{ padding: '1px 6px' }}>revisar</span> : f.classe && <small>{ROTULO_CLASSE[f.classe]}</small>}
                    <div className="ajuda">{revisar ? f.motivo : f.resumo}</div>
                    {f.lembreteCriadoEm && f.lembreteDias != null && <div className="info">Lembrete criado para daqui a {f.lembreteDias} dia(s), às 9h.</div>}
                    {!revisar && (
                      <textarea
                        aria-label={`Resposta para ${f.nome}`}
                        value={texto}
                        placeholder="Escreva a resposta (a IA não sugeriu nada)"
                        rows={3}
                        style={{ width: '100%', marginTop: 4 }}
                        onChange={(e) => setRascunhos((r) => ({ ...r, [f.id]: e.target.value }))}
                      />
                    )}
                    <div className="botoes">
                      {!revisar && (
                        <button type="button" className="primario pequeno" disabled={texto.trim() === '' || bloqueadoPor != null} onClick={() => void abrirEColar(f, texto)}>
                          Abrir e colar
                        </button>
                      )}
                      {revisar && (
                        <button type="button" className="pequeno" disabled={bloqueadoPor != null} onClick={() => void abrirConversa(f)}>
                          Abrir conversa
                        </button>
                      )}
                      {revisar && (
                        <button type="button" className="pequeno" title="Só depois de conferir no WhatsApp" onClick={acao(() => motor.voltarAMonitorar(f.id))}>
                          Conferi: voltar a acompanhar
                        </button>
                      )}
                      <button type="button" className="pequeno" onClick={acao(() => motor.marcarResolvido(f.id))}>
                        Resolvido
                      </button>
                      <button type="button" className="pequeno perigo" onClick={acao(() => motor.naoEnviarMais(f.id))}>
                        Não enviar mais
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {lista === 'saiu' && (
        <div className="cartao">
          <h3>Pediram para sair ({listas.saiu.length})</h3>
          <p className="ajuda">Estão em "Não enviar mais": nunca entram em campanha nem em cobrança.</p>
          <ul className="lista">
            {listas.saiu.map((f) => (
              <li key={f.id}>
                <b>{f.nome}</b> <small>{formatarDataBr(f.atualizadoEm.slice(0, 10))}</small>
                <div className="ajuda">{f.motivo ?? f.resumo}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lista === 'resolvido' && (
        <div className="cartao">
          <h3>Resolvido ({listas.resolvido.length})</h3>
          <ul className="lista">
            {listas.resolvido.map((f) => (
              <li key={f.id}>
                <b>{f.nome}</b> <small>{formatarDataBr(f.atualizadoEm.slice(0, 10))}{f.cobrancas.length > 0 ? ` · ${f.cobrancas.length} cobrança(s)` : ''}</small>
                <div className="ajuda">{f.motivo ?? f.resumo ?? ''}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function executorAtivo(e: EstadoExecutor): boolean {
  return e.fase !== 'parada' && e.fase !== 'concluida';
}
