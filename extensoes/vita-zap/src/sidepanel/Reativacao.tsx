// Painel "Reativação" (v0.7.56): follow-up por inatividade (25/30/40 dias desde a ÚLTIMA conversa).
//
// A versão web do WhatsApp não guarda as conversas antigas. Para quem está há 25 dias sem conversa, a IA lê a última conversa
// (só leitura), o resumo vai para o CRM e ela decide: retomar agora (mensagem SUA, pelo mesmo Executor das campanhas), esperar
// mais tempo (agendamento no CRM, sem mensagem) ou chamar você. Cliente com agendamento futuro no CRM nunca entra: o agendamento prevalece.
//
// - Mensagens automáticas: o MESMO Executor das campanhas (teto diário compartilhado, horário, intervalo 60–120 s, freio,
//   "Não enviar mais", conversa conferida antes do clique, trava de agendamento antes de abrir cada contato).
// - "Avaliar agora" só lê e avalia: não envia nada.
// - Fica sempre montado (como a aba de envio): trocar de aba não interrompe a rodada.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { podeEnviar, ROTULO_MODO } from '../shared/automaticos';
import { type Banco, lerConfigFollowup, listarFollowups } from '../shared/banco';
import { reativacaoDeveEsperar } from '../shared/fila';
import { hojeNoFuso, formatarDataBr } from '../shared/datas';
import { ehEventoConteudo } from '../shared/mensagens';
import { dentroDoHorario } from '../shared/politica';
import { montarMensagem } from '../shared/texto';
import { errosDoRascunho, MAX_ESTILO, previaDosTextos, MARCADOR_NOME, NOME_EXEMPLO, SUGESTOES_1, SUGESTOES_2, rotuloOrigem, type ModoCobranca } from '../shared/followup-estilo';
import {
  AGENDA_LONGA_MAX,
  AGENDA_LONGA_MIN,
  MSG_ESCREVA_ANTES_REATIVACAO,
  ROTULO_DECISAO,
  assinaturaReativacao,
  candidatosEtapa1,
  normalizarEtapas,
  podeLigarReativacao,
  rotuloEtapa,
  ultimoEnvio,
  type ConfigReativacao,
  type Reativacao as RegistroReativacao,
} from '../shared/reativacao';
import type { DadosLocais } from './App';
import { aoMudarModo } from './automaticos-motor';
import type { CrmPainel } from './crm';
import { type EstadoExecutor, Executor } from './executor';
import { EditorDeTextos } from './MensagemCobranca';
import { iniciarBatimento, protegerContraFechamento, MOTIVO_PAINEL_FECHADO } from './protecao';
import { MotorReativacao, type ResumoReativacao, type VisaoReativacao } from './reativacao-motor';
import { assinarTrava, donoDaTrava, liberar, ROTULO_DONO, tentarTravar } from './trava-whatsapp';
import { telefoneConhecidoDe, useTrava } from './trava';
import { useEquipe } from './equipe';
import { contatadoPelaEquipe } from './sincronia-equipe';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  crm: CrmPainel;
  dados: DadosLocais;
  /** A aba está à vista: recarrega (o dono pode ter resolvido itens pela lista do Follow-up). */
  ativa?: boolean;
  /** Abre a aba "Automáticos" (modo, placar, fila e "O que a IA fez"). */
  aoAbrirAutomaticos?: () => void;
}

type Lista = 'pronto' | 'agendado' | 'precisa' | 'travado' | 'aguardando' | 'encerrado';

const INTERVALO_CICLO_MS = 20 * 60_000;
const PRIMEIRO_CICLO_MS = 30_000;

/** Pausas que o ciclo tenta de novo sozinho (horário, teto, painel escondido, CRM fora do ar). Qualquer outra exige "Retomar". */
export function pausaBenignaReativacao(motivo: string | null | undefined): boolean {
  return motivo != null && (/^(domingo|fora do horário|teto diário|CRM indisponível|automático em)/.test(motivo) || motivo === MOTIVO_PAINEL_FECHADO);
}

function dataCurta(iso: string | null | undefined): string {
  return iso ? formatarDataBr(hojeNoFuso(new Date(iso))).slice(0, 5) : '';
}

export function Reativacao({ db, crm, dados, ativa, aoAbrirAutomaticos }: Props) {
  const trava = useTrava(db, crm);
  const equipe = useEquipe(db, crm);
  const dadosCrm = useRef(crm.dados);
  dadosCrm.current = crm.dados;
  const contatosRef = useRef(dados.contatos);
  contatosRef.current = dados.contatos;

  const motor = useMemo(
    () =>
      new MotorReativacao({
        db,
        pedir,
        ia: crm.repo,
        travar: trava ? (contatos, forcar) => trava.varios(contatos, forcar) : async (contatos) => contatos.map(() => ({ tipo: 'indisponivel' as const, motivo: 'sem CRM neste painel' })),
        criarLembrete: async (nome, venceEm, agora) => {
          const r = await crm.repo.criarLembrete({ ref: { nome }, venceEm }, agora);
          return r.ok ? null : r.erro;
        },
        telefoneLocal: telefoneConhecidoDe(null, () => dadosCrm.current),
        agora: () => new Date(),
        aleatorio: Math.random,
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
        // Equipe (0.7.60): "não enviar mais" fresco e contato da equipe antes de montar a fila.
        preparar: equipe ? (contatos) => equipe.preparar(contatos) : undefined,
      }),
    [db, crm.repo, trava, equipe],
  );

  const [visao, setVisao] = useState<VisaoReativacao | null>(null);
  const [lista, setLista] = useState<Lista>('pronto');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoReativacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [executor, setExecutor] = useState<Executor | null>(null);
  const [estado, setEstado] = useState<EstadoExecutor | null>(null);
  const [dono, setDono] = useState(donoDaTrava());
  const pararRef = useRef(false);
  const precisaRetomarRef = useRef(false);
  const parouAteRef = useRef<string | null>(null);
  const emCicloRef = useRef(false);
  const visaoRef = useRef<VisaoReativacao | null>(null);
  visaoRef.current = visao;
  const estadoDoExecutor = useRef<EstadoExecutor | null>(null);
  estadoDoExecutor.current = estado;

  const recarregar = useCallback(async () => setVisao(await motor.carregar()), [motor]);
  useEffect(() => {
    void recarregar();
  }, [recarregar, ativa]);
  useEffect(() => assinarTrava(() => setDono(donoDaTrava())), []);
  // O modo (Desligado | Observação | Ligado) é escolhido na aba "Automáticos": recarrega a configuração quando ele muda.
  useEffect(() => aoMudarModo(() => void recarregar()), [recarregar]);

  // ── Executor (o mesmo das campanhas) ──────────────────────────────────────

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
      if (executor.atual.fase !== 'parada' && executor.atual.fase !== 'concluida') void executor.pausar('reativação trocou de campanha');
    };
  }, [executor, motor, recarregar]);

  const rodando = estado != null && estado.fase !== 'parada' && estado.fase !== 'concluida';
  useEffect(() => {
    if (!rodando) return;
    return iniciarBatimento(pedir);
  }, [rodando]);

  useEffect(() => {
    if (!estado || rodando) return;
    liberar('reativacao');
    if (estado.fase === 'parada') {
      if (pausaBenignaReativacao(estado.mensagem)) {
        if (/^teto diário/.test(estado.mensagem ?? '')) parouAteRef.current = hojeNoFuso(new Date());
      } else if (estado.mensagem) precisaRetomarRef.current = true;
    }
  }, [estado, rodando]);

  // Mensagem em voo (o painel fechou no meio de um envio): confere a conversa antes de qualquer colagem.
  useEffect(() => {
    let vivo = true;
    void motor.campanhaEmVoo().then(async (c) => {
      if (!c || !vivo) return;
      const ex = new Executor({ db, pedir, agora: () => new Date(), aleatorio: Math.random, agendar: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); }, obterEnvioAutomatico: () => true, trava: trava?.executor, equipe: equipe?.executor, aoEnviar: equipe?.aoEnviar }, c);
      ex.setEnvioAutomatico(true);
      const ok = await ex.reconciliar();
      await motor.aplicarCampanha(ex.atual.campanha);
      if (vivo) {
        await recarregar();
        if (!ok) setAviso('Havia uma mensagem de reativação em andamento quando o painel fechou e não consegui conferir a conversa. Abra o WhatsApp Web e use "Avaliar agora".');
      }
    });
    return () => {
      vivo = false;
    };
  }, [motor, db, recarregar, trava, equipe]);

  // ── Ciclo ─────────────────────────────────────────────────────────────────

  const iniciarEnvios = useCallback(
    async (config: ConfigReativacao): Promise<boolean> => {
      const campanha = await motor.montarCampanha(config);
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
          // Envio automático É a decisão do dono para a reativação (com a confirmação do risco): mesma rotina das campanhas.
          obterEnvioAutomatico: () => true,
          trava: trava?.executor,
          equipe: equipe?.executor,
          aoEnviar: equipe?.aoEnviar,
        },
        campanha,
      );
      ex.setEnvioAutomatico(true);
      setExecutor(ex);
      await ex.iniciar();
      return true;
    },
    [motor, db, recarregar, trava],
  );

  /** Lê/avalia (só leitura) e, se `enviar` e a reativação está ligada e nada pausa, manda as mensagens prontas. */
  const executarCiclo = useCallback(
    async (manual: boolean, enviar: boolean): Promise<void> => {
      if (!visaoRef.current || emCicloRef.current) return;
      const dono0 = donoDaTrava();
      if (dono0 && dono0 !== 'reativacao') {
        if (manual) setAviso(`Agora não: ${ROTULO_DONO[dono0]}.`);
        return;
      }
      if (!tentarTravar('reativacao')) return;
      emCicloRef.current = true;
      pararRef.current = false;
      setAviso(null);
      setResumo(null);
      let entregouAoExecutor = false;
      try {
        setOcupado('Lendo as últimas conversas…');
        // Configuração fresca: o modo pode ter mudado na aba "Automáticos" desde a última vez que esta aba carregou.
        const r = await motor.rodada((await motor.carregar()).config, contatosRef.current, { manual, parar: () => pararRef.current, aoProgredir: setOcupado });
        setResumo(r);
        if (r.aviso) setAviso(r.aviso);
        await recarregar();
        const config = (await motor.carregar()).config;
        // Só o modo Ligado envia: em Observação a rodada lê, decide e prepara o texto, e para por aí.
        if (enviar && podeEnviar(config) && !config.pausado && !r.parou && !(precisaRetomarRef.current && !manual)) {
          // Prioridade da fila (teto diário compartilhado): a cobrança de quem não respondeu sai ANTES da reativação.
          const [cfgFollowup, followups] = await Promise.all([lerConfigFollowup(db), listarFollowups(db)]);
          if (reativacaoDeveEsperar(cfgFollowup, followups.filter((f) => f.estado === 'cobranca').length)) {
            setAviso('A cobrança do follow-up tem prioridade no teto diário: a reativação espera a fila de cobrança acabar.');
          } else {
            setOcupado('Preparando as mensagens…');
            entregouAoExecutor = await iniciarEnvios(config);
          }
        }
      } catch (e) {
        setAviso(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(null);
        emCicloRef.current = false;
        if (!entregouAoExecutor) liberar('reativacao');
      }
    },
    [motor, recarregar, iniciarEnvios],
  );

  const ligadoSemPausa = visao?.config.ligado === true && visao.config.pausado !== true;
  useEffect(() => {
    if (!ligadoSemPausa) return;
    const tentar = () => {
      if (document.visibilityState !== 'visible' || precisaRetomarRef.current) return;
      if (parouAteRef.current === hojeNoFuso(new Date())) return;
      if (!dentroDoHorario(new Date()).ok) return;
      if (estadoDoExecutor.current && executorAtivo(estadoDoExecutor.current)) return;
      void executarCiclo(false, true);
    };
    const primeiro = setTimeout(tentar, PRIMEIRO_CICLO_MS);
    const periodico = setInterval(tentar, INTERVALO_CICLO_MS);
    return () => {
      clearTimeout(primeiro);
      clearInterval(periodico);
    };
  }, [ligadoSemPausa, executarCiclo]);

  // ── Ações ─────────────────────────────────────────────────────────────────

  const mudarConfig = async (mudanca: Partial<ConfigReativacao>): Promise<void> => {
    if (!visao) return;
    await motor.salvarConfig({ ...visao.config, ...mudanca });
    await recarregar();
    if (mudanca.pausado === true && executor && executorAtivo(executor.atual)) await executor.pausar('reativação pausada por você');
    if (mudanca.pausado === false) precisaRetomarRef.current = false;
  };

  const pararTudo = async (): Promise<void> => {
    pararRef.current = true;
    if (executor && executorAtivo(executor.atual)) await executor.pausar('pausado por você');
  };

  const acao = (fn: () => Promise<void>) => () => void fn().then(recarregar);

  if (!visao) return <p className="carregando">Carregando…</p>;
  const { config, listas } = visao;
  const bloqueadoPor = dono && dono !== 'reativacao' ? ROTULO_DONO[dono] : null;
  const trabalhando = ocupado != null || rodando;
  const cand = elegiveisAgora(config, dados, visao.registros);
  const varreduraEm = dados.contatos.reduce((m, c) => (c.varridoEm > m ? c.varridoEm : m), '');

  return (
    <section>
      <p className="ajuda">As <b>Orientações para a IA</b> (aba "Pedir à IA") valem aqui também, sempre abaixo das regras de segurança.</p>
      <div className="cartao">
        <h3>Reativação por inatividade</h3>
        <p className="ajuda">
          O WhatsApp Web não guarda as conversas antigas (o histórico fica só no celular). Para quem está há <b>{config.etapas[0]}</b> dias sem conversa, a IA lê a <b>última conversa</b> e o resumo vai para o <b>CRM</b>:
          assim o contexto não se perde. Depois ela decide: <b>retomar agora</b> (mensagem sua), <b>esperar mais tempo</b> (agendamento no CRM, sem mensagem) ou <b>chamar você</b> (assunto delicado).
          Aos {config.etapas[1]} e {config.etapas[2]} dias, só quem recebeu a mensagem anterior e <b>não respondeu</b>. Quem respondeu sai da sequência e vai para "Precisa de você" do Follow-up.
        </p>
        <p className="aviso" style={{ margin: '6px 0' }}>
          <b>Trava de agendamento:</b> cliente com agendamento futuro no CRM (mesmo daqui a 60 dias) <b>não</b> entra na reativação, nas campanhas nem na cobrança: o agendamento prevalece.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, margin: '4px 0' }}>
          Reativação automática: <span aria-label="Modo atual">{ROTULO_MODO[config.automatico]}</span>
          {aoAbrirAutomaticos && (
            <button type="button" className="pequeno" style={{ marginLeft: 8 }} onClick={aoAbrirAutomaticos}>
              Mudar o modo (aba Automáticos)
            </button>
          )}
        </p>
        {config.automatico === 'observacao' && <p className="info">Observação: a IA lê e decide, mas NADA é enviado, agendado no CRM nem marcado. Julgue o que ela faria na aba Automáticos.</p>}
        {config.migradoParaObservacao && <p className="aviso" role="alert">A reativação automática estava ligada numa versão anterior e agora está em Observação: nada é enviado até o placar da IA aprovar e você ligar de novo.</p>}
        {!podeLigarReativacao(config).ok && !config.ligado && <p className="aviso">{MSG_ESCREVA_ANTES_REATIVACAO}: use "Suas mensagens de reativação", logo abaixo.</p>}
        {config.desligadaSemTexto && !config.ligado && <p className="aviso" role="alert">A reativação foi desligada: estava ligada sem uma mensagem sua. Escreva a mensagem e ligue de novo.</p>}
        <p className="aviso" style={{ marginTop: 8 }}>Atenção: o envio automático pelo WhatsApp Web viola os Termos de Serviço do WhatsApp e pode levar ao bloqueio ou banimento do número. Os limites do Vita Zap reduzem o risco, mas não o eliminam. Assunto delicado vai para "Precisa de você".</p>
        <div className="botoes">
          <button type="button" className="primario" disabled={trabalhando || bloqueadoPor != null} onClick={() => void executarCiclo(true, false)} title="Só lê as conversas e avalia com a IA. Não envia nada.">
            Avaliar agora (não envia)
          </button>
          {config.ligado && !config.pausado && (
            <button type="button" onClick={() => void mudarConfig({ pausado: true })}>Pausar reativação</button>
          )}
          {config.ligado && config.pausado && (
            <button type="button" className="primario" onClick={() => void mudarConfig({ pausado: false })}>Retomar reativação</button>
          )}
          {trabalhando && <button type="button" onClick={() => void pararTudo()}>Parar agora</button>}
          {precisaRetomarRef.current && config.ligado && !trabalhando && (
            <button type="button" onClick={() => { precisaRetomarRef.current = false; parouAteRef.current = null; void executarCiclo(true, true); }}>Conferi o WhatsApp: retomar</button>
          )}
        </div>
        {config.ligado && config.pausado && <p className="aviso">Reativação pausada: nada é enviado até você retomar.</p>}
        {bloqueadoPor && <p className="ajuda">Aguardando: {bloqueadoPor}.</p>}
        {ocupado && <p className="info">{ocupado}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        {estado?.avisoTrava && <p className="aviso">{estado.avisoTrava}</p>}
        {resumo && (
          <p className="ajuda">
            Última rodada: {resumo.lidas} conversa(s) lida(s) · {resumo.prontos} para receber · {resumo.agendados} agendada(s) pela IA · {resumo.precisam} precisam de você · {resumo.travados} travada(s) por agendamento ·{' '}
            {resumo.saidas} pediram para sair · {resumo.respostas} respostas · {resumo.concluidos} encerrada(s){resumo.recentes > 0 ? ` · ${resumo.recentes} com conversa recente` : ''}
            {resumo.semConferencia > 0 ? ` · ${resumo.semConferencia} sem conferir o CRM` : ''}{resumo.parou ? ' · parou antes do fim' : ''}.
          </p>
        )}
        <p className="ajuda">
          {dados.contatos.length === 0
            ? 'Faça a varredura primeiro (aba 1): a reativação usa a data da última conversa da lista do WhatsApp.'
            : `${cand.elegiveis.length} contato(s) com a última conversa há ${config.etapas[0]}+ dias entram na próxima rodada${varreduraEm ? ` (varredura de ${dataCurta(varreduraEm)})` : ''}${cand.aRevisarNaVarredura > 0 ? ` · ${cand.aRevisarNaVarredura} com dúvida na varredura (não entram sozinhos)` : ''}. Painel aberto e visível: a reativação confere a cada 20 minutos, dentro do horário.`}
        </p>
      </div>

      <Ajustes config={config} ocupado={trabalhando} onSalvar={(m) => mudarConfig(m)} />
      <MensagensReativacao config={config} ocupado={trabalhando} onSalvar={(m) => motor.salvarConfig({ ...config, ...m }).then(recarregar)} />

      <div className="botoes" role="tablist" aria-label="Listas da reativação">
        {(
          [
            ['pronto', `Vai receber hoje (${listas.pronto.length})`],
            ['agendado', `Agendados pela IA (${listas.agendado.length})`],
            ['precisa', `Precisa de você (${listas.precisa.length})`],
            ['travado', `Travados por agendamento (${listas.travado.length})`],
            ['aguardando', `Aguardando resposta (${listas.aguardando.length})`],
            ['encerrado', `Encerrados (${listas.resolvido.length + listas.respondeu.length + listas.saiu.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={lista === id} className={lista === id ? 'primario pequeno' : 'pequeno'} onClick={() => setLista(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {lista === 'pronto' && (
        <div className="cartao">
          <h3>Vai receber hoje — {listas.pronto.length} na fila, {visao.enviadasHoje} enviada(s) hoje</h3>
          {estado && (
            <p className="ajuda">
              {estado.fase === 'intervalo' ? 'Intervalo entre contatos…' : estado.fase === 'abrindo' ? 'Relendo/abrindo a conversa…' : estado.fase === 'aguardando_envio' ? 'Conferindo e enviando…' : estado.fase === 'concluida' ? 'Rodada concluída.' : 'Parado.'}
              {estado.tetoDiario ? ` Teto diário (compartilhado com campanhas e follow-up): ${estado.enviosHoje}/${estado.tetoDiario}.` : ''}
              {estado.mensagem ? ` ${estado.mensagem}` : ''}
            </p>
          )}
          {listas.pronto.length === 0 ? (
            <p className="ajuda">Ninguém na fila. Quem a IA considerar em condição de ser retomado aparece aqui, com o texto que será enviado.</p>
          ) : (
            <ul className="lista">
              {listas.pronto.map((r) => (
                <li key={r.chave}>
                  <b>{r.nome}</b> <small>{rotuloEtapa(r.textoPronto?.etapa ?? r.etapa + 1)} · texto: {rotuloOrigem(r.textoPronto?.origem)}</small>
                  {r.resumo && <div className="ajuda">{r.resumo}</div>}
                  <div className="balao">{montarMensagem(r.textoPronto?.modelo ?? '', r.primeiroNome)}</div>
                  <div className="botoes">
                    <button type="button" className="pequeno" onClick={acao(() => motor.tirarDaFila(r.chave))}>Tirar da fila</button>
                    <button type="button" className="pequeno perigo" onClick={acao(() => motor.naoEnviarMais(r.chave))}>Não enviar mais</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="ajuda">As mensagens saem pelo ciclo (reativação ligada, dentro do horário e do teto). "Avaliar agora" nunca envia.</p>
        </div>
      )}

      {lista === 'agendado' && (
        <Cartao titulo={`Agendados pela IA (${listas.agendado.length})`} ajuda="A IA entendeu que o cliente precisa de mais tempo ou ficou de dar um retorno: criou um agendamento no CRM e NENHUMA mensagem foi enviada." itens={listas.agendado} vazio="Nenhum agendamento criado pela reativação ainda.">
          {(r) => (
            <>
              <b>{r.nome}</b> <small>{r.agendadoPara ? `agendado para ${dataCurta(r.agendadoPara)}` : ''} · {r.diasSugeridos != null ? `em ${r.diasSugeridos} dias` : ''}</small>
              <div className="ajuda">{r.resumo}</div>
              {r.observado ? <div className="info">Observação: a IA agendaria, mas NADA foi agendado no CRM.</div> : r.crmSalvoEm == null && <div className="aviso">O resumo ainda não chegou ao CRM.</div>}
            </>
          )}
        </Cartao>
      )}

      {lista === 'precisa' && (
        <Cartao titulo={`Precisa de você (${listas.precisa.length})`} ajuda="Assunto delicado, conversa vazia ou dúvida na leitura: nada é enviado. Responda pelo Follow-up → Precisa de você (a mesma lista)." itens={listas.precisa} vazio="Ninguém esperando por você aqui.">
          {(r) => (
            <>
              <b>{r.nome}</b> {r.decisao && <small>{ROTULO_DECISAO[r.decisao]}</small>}
              <div className="ajuda">{r.motivo ?? r.resumo}</div>
              <div className="botoes">
                <button type="button" className="pequeno" onClick={acao(() => motor.tirarDaFila(r.chave))}>Resolvido</button>
                <button type="button" className="pequeno perigo" onClick={acao(() => motor.naoEnviarMais(r.chave))}>Não enviar mais</button>
              </div>
            </>
          )}
        </Cartao>
      )}

      {lista === 'travado' && (
        <Cartao titulo={`Travados por agendamento (${listas.travado.length})`} ajuda="Têm agendamento futuro no CRM: não entram em reativação, campanha nem cobrança. Voltam a ser elegíveis quando a data passar ou o lembrete for concluído." itens={listas.travado} vazio="Ninguém travado por agendamento.">
          {(r) => (
            <>
              <b>{r.nome}</b> <small>{r.agendadoPara ? `até ${dataCurta(r.agendadoPara)}` : ''}</small>
              <div className="ajuda">{r.motivo}</div>
            </>
          )}
        </Cartao>
      )}

      {lista === 'aguardando' && (
        <Cartao titulo={`Aguardando resposta (${listas.aguardando.length})`} ajuda={`Receberam uma mensagem de reativação. Se não responderem, recebem a próxima etapa (${config.etapas[1]} e ${config.etapas[2]} dias); depois da última, são encerrados.`} itens={listas.aguardando} vazio="Ninguém aguardando.">
          {(r) => (
            <>
              <b>{r.nome}</b> <small>recebeu a {rotuloEtapa(r.etapa)} em {dataCurta(ultimoEnvio(r))}</small>
              <div className="ajuda">{r.resumo}</div>
            </>
          )}
        </Cartao>
      )}

      {lista === 'encerrado' && (
        <Cartao titulo={`Encerrados (${listas.resolvido.length + listas.respondeu.length + listas.saiu.length})`} ajuda="Resolvidos, sem resposta depois da última etapa, que responderam (foram para o Follow-up) ou pediram para sair." itens={[...listas.resolvido, ...listas.respondeu, ...listas.saiu]} vazio="Nada encerrado ainda.">
          {(r) => (
            <>
              <b>{r.nome}</b> <small>{r.estado === 'saiu' ? 'não enviar mais' : r.estado === 'respondeu' ? 'respondeu (Follow-up)' : 'resolvido'} · {dataCurta(r.atualizadoEm)}</small>
              <div className="ajuda">{r.motivo ?? r.resumo}</div>
            </>
          )}
        </Cartao>
      )}
    </section>
  );
}

function executorAtivo(e: EstadoExecutor): boolean {
  return e.fase !== 'parada' && e.fase !== 'concluida';
}

function elegiveisAgora(config: ConfigReativacao, dados: DadosLocais, registros: ReadonlyArray<RegistroReativacao>) {
  return candidatosEtapa1(dados.contatos, config, new Map(registros.map((r) => [r.chave, r])), {
    agora: new Date(),
    naoEnviar: new Set(dados.naoEnviar.map((n) => n.chave)),
    ultimoEnvioPorChave: new Map(Object.entries(ultimoPorChave(dados))),
    contatadoPelaEquipePorChave: contatadoPelaEquipe(),
  });
}

function ultimoPorChave(dados: DadosLocais): Record<string, string> {
  const m: Record<string, string> = {};
  for (const e of dados.envios) if (!m[e.chave] || e.enviadoEm > m[e.chave]) m[e.chave] = e.enviadoEm;
  return m;
}

function Cartao({ titulo, ajuda, itens, vazio, children }: { titulo: string; ajuda: string; itens: RegistroReativacao[]; vazio: string; children: (r: RegistroReativacao) => React.ReactNode }) {
  return (
    <div className="cartao">
      <h3>{titulo}</h3>
      <p className="ajuda">{ajuda}</p>
      {itens.length === 0 ? (
        <p className="ajuda">{vazio}</p>
      ) : (
        <ul className="lista">
          {itens.map((r) => (
            <li key={r.chave}>{children(r)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Ajustes (etapas, público, agendamento longo) ────────────────────────────

function Ajustes({ config, ocupado, onSalvar }: { config: ConfigReativacao; ocupado: boolean; onSalvar: (m: Partial<ConfigReativacao>) => Promise<void> }) {
  const [etapas, setEtapas] = useState<string[]>(config.etapas.map(String));
  const [termo, setTermo] = useState(config.termo);
  useEffect(() => setEtapas(config.etapas.map(String)), [config.etapas.join(',')]);
  useEffect(() => setTermo(config.termo), [config.termo]);
  const salvarEtapas = () => void onSalvar({ etapas: normalizarEtapas(etapas.map((e) => Number(e))) });
  return (
    <div className="cartao">
      <h3>Ajustes</h3>
      <div style={{ fontSize: 12.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <span>Etapas (dias desde a última conversa):</span>
        {etapas.map((v, i) => (
          <input key={i} type="number" min={7} max={365} aria-label={`Etapa ${i + 1} (dias)`} value={v} disabled={ocupado} style={{ width: 64 }} onChange={(e) => setEtapas((l) => l.map((x, k) => (k === i ? e.target.value : x)))} onBlur={salvarEtapas} />
        ))}
        <span className="ajuda">padrão 25, 30 e 40; no mínimo 3 dias entre uma e outra</span>
      </div>
      <label style={{ display: 'block', marginTop: 8, fontSize: 12.5 }}>
        Só contatos com este termo no nome (vazio = qualquer contato salvo):{' '}
        <input type="text" value={termo} disabled={ocupado} style={{ width: 140 }} aria-label="Termo no nome" onChange={(e) => setTermo(e.target.value)} onBlur={() => termo !== config.termo && void onSalvar({ termo })} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={config.palavraInteira} disabled={ocupado} onChange={(e) => void onSalvar({ palavraInteira: e.target.checked })} />
        <span>Palavra inteira (&quot;PR&quot; não casa com &quot;COMPRAS&quot;)</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={config.soMinha} disabled={ocupado} onChange={(e) => void onSalvar({ soMinha: e.target.checked })} />
        <span>Só contatos que já receberam mensagem minha (mesma regra da Varredura)</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={config.agendaLonga} disabled={ocupado} onChange={(e) => void onSalvar({ agendaLonga: e.target.checked })} />
        <span>
          Sem resposta depois da última etapa: agendar uma nova tentativa no CRM em{' '}
          <input type="number" min={AGENDA_LONGA_MIN} max={AGENDA_LONGA_MAX} aria-label="Dias da nova tentativa" value={config.agendaLongaDias} disabled={ocupado || !config.agendaLonga} style={{ width: 64 }} onChange={(e) => void onSalvar({ agendaLongaDias: Number(e.target.value) })} /> dias
        </span>
      </label>
    </div>
  );
}

// ── Mensagens por etapa (mesmo sistema de estilo da 0.7.55) ─────────────────

interface Rascunho {
  modo: ModoCobranca;
  estilo: string;
  textos1: string[];
  textos2: string[];
  textos3: string[];
}

const doConfig = (c: ConfigReativacao): Rascunho => ({ modo: c.modo, estilo: c.estilo, textos1: c.textos1.length > 0 ? [...c.textos1] : [''], textos2: [...c.textos2], textos3: [...c.textos3] });

function MensagensReativacao({ config, ocupado, onSalvar }: { config: ConfigReativacao; ocupado: boolean; onSalvar: (m: Partial<ConfigReativacao>) => Promise<unknown> }) {
  const [r, setR] = useState<Rascunho>(() => doConfig(config));
  const [previa, setPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState(false);
  const assinaturaSalva = assinaturaReativacao(config);
  useEffect(() => setR(doConfig(config)), [assinaturaSalva]);

  const erros1 = errosDoRascunho({ modo: r.modo, estilo: r.estilo, textos1: r.textos1, textos2: [] });
  const erros2 = errosDoRascunho({ modo: r.modo, estilo: r.estilo, textos1: r.textos2, textos2: [] });
  const erros3 = errosDoRascunho({ modo: r.modo, estilo: r.estilo, textos1: r.textos3, textos2: [] });
  const ok = erros1.ok && erros2.ok && erros3.ok;
  const limpo = (l: string[]) => l.map((t) => t.trim()).filter(Boolean);
  const mudou = assinaturaReativacao({ modo: r.modo, estilo: r.modo === 'ia_estilo' ? r.estilo.trim() : config.estilo, textos1: limpo(r.textos1), textos2: limpo(r.textos2), textos3: limpo(r.textos3) }) !== assinaturaSalva;
  const semTexto1 = r.textos1.every((t) => t.trim() === '');
  const editar = (m: Partial<Rascunho>) => {
    setSalvoAgora(false);
    setR((x) => ({ ...x, ...m }));
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar({ modo: r.modo, estilo: r.estilo, textos1: r.textos1, textos2: r.textos2, textos3: r.textos3 });
      setSalvoAgora(true);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="cartao" aria-label="Suas mensagens de reativação">
      <h3>Suas mensagens de reativação</h3>
      <p className="ajuda">
        Você define o estilo: a reativação só usa o que você escrever aqui (textos próprios, separados da cobrança). Use <b>{MARCADOR_NOME}</b> se quiser o primeiro nome do cliente (opcional). Sem link, sem preço e sem alegação sobre o produto.
      </p>
      <div role="radiogroup" aria-label="Modo da mensagem de reativação" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
        {(
          [
            ['meus_textos', 'Usar os meus textos', 'O app sorteia uma das suas variações para cada contato. Sem IA.'],
            ['ia_estilo', 'IA escreve no meu estilo', 'A IA escreve cada mensagem imitando o seu jeito (instruções + os seus textos como exemplo). Se a IA falhar, sai um dos seus textos.'],
          ] as Array<[ModoCobranca, string, string]>
        ).map(([id, rotulo, desc]) => (
          <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="modo-reativacao" value={id} checked={r.modo === id} onChange={() => editar({ modo: id })} style={{ width: 'auto', flex: 'none', margin: '3px 0 0' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              <b>{rotulo}</b>
              <br />
              <span className="ajuda">{desc}</span>
            </span>
          </label>
        ))}
      </div>
      {r.modo === 'ia_estilo' && (
        <label style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          Como devo escrever
          <textarea value={r.estilo} rows={3} maxLength={MAX_ESTILO + 100} style={{ width: '100%', fontWeight: 400 }} placeholder="Ex.: curto e informal, trato por você, no máximo 1 emoji." onChange={(e) => editar({ estilo: e.target.value })} />
          <span className="ajuda" style={{ fontWeight: 400 }}>{r.estilo.trim().length}/{MAX_ESTILO} caracteres.</span>
          {erros1.estilo && <span className="aviso" style={{ display: 'block' }}>{erros1.estilo}</span>}
        </label>
      )}
      <EditorDeTextos idBase="reativacao1" titulo={`Etapa 1 (${config.etapas[0]} dias)`} ajuda="Obrigatório: pelo menos 1 variação. Retoma o contato com leveza." lista={r.textos1} erros={erros1.textos1} sugestoes={SUGESTOES_1} onChange={(l) => editar({ textos1: l })} />
      <EditorDeTextos idBase="reativacao2" titulo={`Etapa 2 (${config.etapas[1]} dias)`} ajuda="Opcional. Sem textos aqui, usa os da etapa 1 (sem repetir o que o contato já recebeu)." lista={r.textos2} erros={erros2.textos1} sugestoes={SUGESTOES_2} onChange={(l) => editar({ textos2: l })} />
      <EditorDeTextos idBase="reativacao3" titulo={`Etapa 3 (${config.etapas[2]} dias, última)`} ajuda="Opcional. Sem textos aqui, usa os da etapa 2 (ou da 1)." lista={r.textos3} erros={erros3.textos1} sugestoes={SUGESTOES_2} onChange={(l) => editar({ textos3: l })} />
      {semTexto1 && <p className="aviso">Sem pelo menos 1 texto para a etapa 1, a reativação não liga.</p>}
      <div className="botoes">
        <button type="button" className="primario" disabled={!ok || !mudou || salvando || ocupado} onClick={() => void salvar()}>Salvar minhas mensagens</button>
        <button type="button" onClick={() => setPrevia((p) => !p)} aria-expanded={previa}>Ver exemplo</button>
      </div>
      {ocupado && <p className="ajuda">Há uma leitura ou envio em andamento: espere terminar (ou use "Parar agora") para salvar.</p>}
      {mudou && !salvoAgora && <p className="ajuda">Há alterações não salvas. O que está salvo é o que a reativação usa.</p>}
      {salvoAgora && !mudou && <p className="info">Mensagens salvas. Quem já estava na fila teve o texto refeito.</p>}
      {previa && (
        <div aria-label="Exemplo das mensagens">
          <p className="ajuda">Como fica para um cliente fictício chamado "{NOME_EXEMPLO}":</p>
          {([['Etapa 1', r.textos1], ['Etapa 2', r.textos2.length > 0 ? r.textos2 : r.textos1], ['Etapa 3', r.textos3.length > 0 ? r.textos3 : r.textos2.length > 0 ? r.textos2 : r.textos1]] as const).map(([rotulo, l]) => {
            const exemplos = previaDosTextos(l);
            return (
              <div key={rotulo}>
                <b style={{ fontSize: 12 }}>{rotulo}</b>
                {exemplos.length === 0 ? <p className="ajuda">Escreva um texto para ver o exemplo.</p> : exemplos.map((e, i) => <div key={i} className="balao">{e}</div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
