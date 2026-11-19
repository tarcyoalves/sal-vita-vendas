// Aba "Automáticos" (v0.7.59): o modo dos automáticos (Desligado | Observação | Ligado), o placar da IA, o que a IA faria em
// Observação (Acertou/Errou), a previsão da fila com o teto diário e "O que a IA fez" com Desfazer.
//
// Nada aqui envia mensagem: o envio é sempre do Executor (e só no modo Ligado). Esta tela só muda o modo, guarda julgamentos e
// desfaz ações da IA (opt-out e o agendamento que ELA criou no CRM).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type DecisaoCerta,
  type Julgamento,
  MAX_ACOES_IA,
  MAX_JULGAMENTOS,
  MIN_ACERTO_PERCENTUAL,
  MIN_JULGAMENTOS,
  MODOS_AUTOMATICOS,
  ROTULO_ACAO_IA,
  ROTULO_DECISAO_CERTA,
  ROTULO_MODO,
  ROTULO_TIPO_DECISAO,
  TIPOS_DE_DECISAO,
  type ModoAutomatico,
} from '../shared/automaticos';
import type { Banco } from '../shared/banco';
import { formatarDataBr, hojeNoFuso } from '../shared/datas';
import { ORDEM_DA_FILA, ROTULO_GRUPO, textoDaPrevisao } from '../shared/fila';
import type { CrmPainel } from './crm';
import { useEquipe } from './equipe';
import { aoMudarModo, carregarVisao, definirModo, desfazerAcao, julgarDecisao, reabrirJulgamento, type VisaoAutomaticos } from './automaticos-motor';

interface Props {
  db: Banco;
  crm: CrmPainel;
  /** A aba está à vista: recarrega (os motores gravam decisões enquanto ela está escondida). */
  ativa?: boolean;
}

export const TEXTO_RISCO_AUTOMATICOS =
  'Atenção: o envio automático de mensagens pelo WhatsApp Web viola os Termos de Serviço do WhatsApp e pode levar ao bloqueio ou banimento do número. ' +
  'Os limites do Vita Zap (teto diário compartilhado, horário comercial, intervalo de 60 a 120 s, freio, conferência da conversa antes do clique e a releitura da conversa ' +
  'imediatamente antes de cada envio) REDUZEM o risco, mas NÃO o eliminam. Só recebe mensagem quem a IA considerou em condição, nunca quem está em "Não enviar mais", ' +
  'nunca grupo e nunca cliente com agendamento futuro no CRM. Quem respondeu NUNCA recebe nada sozinho. O painel precisa ficar aberto.';

const DESCRICAO_MODO: Record<ModoAutomatico, string> = {
  desligado: 'Nada roda sozinho. Você ainda pode usar "Verificar agora" e "Avaliar agora" nas abas.',
  observacao: 'A IA lê, classifica, decide e prepara o texto, mas NADA é enviado, agendado no CRM nem marcado "Não enviar mais". Cada decisão vira um item abaixo para você julgar.',
  ligado: 'Envia sozinha as cobranças e as mensagens de reativação (com todos os limites). Só liga depois que o placar da IA aprovar.',
};

const dataHora = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatarDataBr(hojeNoFuso(d)).slice(0, 5)} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' })}`;
};

export function Automaticos({ db, crm, ativa }: Props) {
  const [visao, setVisao] = useState<VisaoAutomaticos | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [errando, setErrando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [certa, setCerta] = useState<DecisaoCerta | ''>('');

  // As Orientações para a IA de hoje vão junto: se mudaram desde a aprovação do placar, a aprovação é cancelada (v0.7.62).
  const orientacoes = useCallback(async (): Promise<string | undefined> => {
    try {
      return await Promise.resolve().then(() => crm.repo.orientacoesIa());
    } catch {
      return undefined; // sem ler as Orientações não dá para comparar: nada é invalidado nem aprovado às cegas
    }
  }, [crm.repo]);
  const recarregar = useCallback(async () => setVisao(await carregarVisao(db, new Date(), await orientacoes())), [db, orientacoes]);
  useEffect(() => {
    void recarregar();
  }, [recarregar, ativa]);
  useEffect(() => aoMudarModo(() => void recarregar()), [recarregar]);

  const aprovadoAntes = visao != null && (visao.aprovacao === 'valida' || visao.aprovacao === 'anterior');
  const equipe = useEquipe(db, crm);
  const desfazerDeps = useMemo(
    () => ({
      db,
      agora: () => new Date(),
      desfazerAgendamento: async (p: { taskId: number; agendadoEm: number }) => {
        try {
          return await crm.repo.desfazerAgendamento(p);
        } catch (e) {
          return { ok: false as const, mensagem: e instanceof Error ? e.message : String(e) };
        }
      },
      // Desfazer o "não enviar mais" feito pela IA também tira da lista da equipe no CRM.
      ...(equipe ? { desmarcarNaoEnviar: (chave: string) => equipe.desmarcar(chave) } : {}),
    }),
    [db, crm.repo, equipe],
  );

  if (!visao) return <p className="carregando">Carregando…</p>;

  const escolherModo = async (modo: ModoAutomatico): Promise<void> => {
    setAviso(null);
    setInfo(null);
    if (modo === visao.modo) return;
    if (modo === 'ligado') {
      // O placar vale só para a PRIMEIRA vez; abaixo do mínimo o botão explica por quê (sem nem perguntar o risco).
      if (!aprovadoAntes && !visao.liberacao.liberado) {
        setAviso(visao.liberacao.motivo);
        return;
      }
      if (!window.confirm(`${TEXTO_RISCO_AUTOMATICOS}\n\nLigar o envio automático da cobrança e da reativação?`)) return;
    }
    const r = await definirModo(db, modo, { confirmouRisco: modo === 'ligado', ...(modo === 'ligado' ? { orientacoes: await orientacoes() } : {}) });
    if (!r.ok) setAviso(r.motivo);
    else setInfo(modo === 'observacao' ? 'Modo Observação: nada será enviado. Julgue o que a IA faria abaixo.' : modo === 'ligado' ? 'Envio automático ligado.' : 'Automáticos desligados.');
    await recarregar();
  };

  const julgar = async (j: Julgamento, veredito: 'acertou' | 'errou'): Promise<void> => {
    await julgarDecisao(db, j.id, veredito, new Date(), { motivo, decisaoCerta: certa === '' ? null : certa });
    setErrando(null);
    setMotivo('');
    setCerta('');
    await recarregar();
  };

  const desfazer = async (id: string): Promise<void> => {
    setAviso(null);
    setInfo(null);
    const r = await desfazerAcao(desfazerDeps, id);
    if (r.ok) setInfo(r.mensagem);
    else setAviso(r.mensagem);
    await recarregar();
  };

  const { liberacao, placar, fila } = visao;
  const julgados = visao.julgamentos.filter((j) => j.veredito != null);

  return (
    <section>
      <div className="cartao" aria-label="Modo dos automáticos">
        <h3>Modo dos automáticos</h3>
        <p className="ajuda">Vale para a cobrança do Follow-up e para a Reativação. Em dúvida, fique em <b>Observação</b>.</p>
        <div className="botoes" role="radiogroup" aria-label="Modo dos automáticos">
          {MODOS_AUTOMATICOS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={visao.modo === m} className={visao.modo === m ? 'primario' : ''} onClick={() => void escolherModo(m)}>
              {ROTULO_MODO[m]}
            </button>
          ))}
        </div>
        <p className="ajuda">{DESCRICAO_MODO[visao.modo]}</p>
        {visao.migrado && (
          <p className="aviso" role="alert">
            O automático estava ligado numa versão anterior e agora está em <b>Observação</b>: nada é enviado até o placar da IA aprovar e você ligar de novo.
          </p>
        )}
        {(visao.followup.desligadaSemTexto || visao.reativacao.desligadaSemTexto) && <p className="aviso">Um dos automáticos está desligado porque não tem uma mensagem sua: escreva a mensagem na aba dele.</p>}
        <p className="ajuda">
          Cobrança do Follow-up: <b>{ROTULO_MODO[visao.followup.automatico]}</b> · Reativação: <b>{ROTULO_MODO[visao.reativacao.automatico]}</b>
        </p>
        <p className={liberacao.liberado || aprovadoAntes ? 'info' : 'ajuda'}>
          {visao.aprovacao === 'anterior'
            ? 'Aprovado anteriormente (registro antigo, de antes do controle das Orientações para a IA). Se você mudar as Orientações, a aprovação é cancelada e o placar recomeça.'
            : aprovadoAntes
              ? 'O placar já liberou o envio automático uma vez, com as Orientações para a IA de hoje.'
              : liberacao.liberado
                ? `Placar aprovado: ${liberacao.acertos} de ${liberacao.julgados} (${liberacao.percentualTexto}%) nas decisões que geram envio. Você já pode ligar.`
                : `Para ligar o envio: ${MIN_JULGAMENTOS} julgamentos com ${MIN_ACERTO_PERCENTUAL}% de acerto nas decisões que geram envio. Progresso: ${liberacao.julgados} de ${MIN_JULGAMENTOS}${liberacao.julgados > 0 ? ` (${liberacao.percentualTexto}% de acerto)` : ''}. ${liberacao.faltam > 0 ? `Faltam ${liberacao.faltam}.` : liberacao.motivo ?? ''}`}
        </p>
        {visao.placarDesde && !aprovadoAntes && <p className="ajuda">O placar recomeçou em {dataHora(visao.placarDesde)} porque as Orientações para a IA mudaram: só contam os julgamentos feitos depois disso.</p>}
        {info && <p className="info">{info}</p>}
        {aviso && <p className="aviso" role="alert">{aviso}</p>}
      </div>

      <div className="cartao" aria-label="Fila de hoje">
        <h3>Fila de hoje</h3>
        <p><b>{textoDaPrevisao(fila)}</b></p>
        <p className="ajuda">Ordem fixa de prioridade (o teto diário é compartilhado):</p>
        <ol className="ajuda" style={{ margin: '4px 0 4px 18px', padding: 0 }}>
          {ORDEM_DA_FILA.map((g) => (
            <li key={g}>
              {ROTULO_GRUPO[g]}: {fila.porGrupo[g]} na fila, {fila.hojePorGrupo[g]} saem hoje
            </li>
          ))}
          <li>4. Campanhas comuns pendentes: {fila.comunsPendentes} contato(s); seguem como sempre, só saem quando você inicia a campanha (não entram na conta acima)</li>
        </ol>
        {visao.modo !== 'ligado' && <p className="ajuda">Em {ROTULO_MODO[visao.modo]} nada sai sozinho: a fila acima é só a previsão para quando o envio estiver ligado.</p>}
      </div>

      <div className="cartao" aria-label="O que a IA faria">
        <h3>O que a IA faria ({visao.pendentes.length})</h3>
        <p className="ajuda">Decisões tomadas em Observação, ainda sem julgamento. Nada disto foi enviado, agendado nem marcado.</p>
        {visao.pendentes.length === 0 ? (
          <p className="ajuda">Nada para julgar agora. Com o modo Observação ligado, as decisões da IA aparecem aqui.</p>
        ) : (
          <ul className="lista">
            {visao.pendentes.map((j) => (
              <li key={j.id}>
                <b>{j.nome}</b> <small>{ROTULO_TIPO_DECISAO[j.tipo]} · {dataHora(j.criadoEm)}</small>
                <div className="ajuda">{j.resumo}</div>
                {j.texto && <div className="balao">{j.texto}</div>}
                {errando === j.id ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5 }}>
                      Motivo (opcional, curto)
                      <input type="text" value={motivo} maxLength={160} aria-label="Motivo do erro" onChange={(e) => setMotivo(e.target.value)} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12.5 }}>
                      Qual era a decisão certa?
                      <select aria-label="Decisão certa" value={certa} onChange={(e) => setCerta(e.target.value as DecisaoCerta | '')}>
                        <option value="">(não sei / prefiro não dizer)</option>
                        {[...TIPOS_DE_DECISAO, 'nada' as const].map((t) => (
                          <option key={t} value={t}>{ROTULO_DECISAO_CERTA[t]}</option>
                        ))}
                      </select>
                    </label>
                    <div className="botoes">
                      <button type="button" className="pequeno perigo" onClick={() => void julgar(j, 'errou')}>Confirmar: errou</button>
                      <button type="button" className="pequeno" onClick={() => setErrando(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="botoes">
                    <button type="button" className="pequeno primario" onClick={() => void julgar(j, 'acertou')}>Acertou</button>
                    <button type="button" className="pequeno perigo" onClick={() => { setErrando(j.id); setMotivo(''); setCerta(''); }}>Errou</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cartao" aria-label="Placar da IA">
        <h3>Placar da IA</h3>
        <p className="ajuda">Acertos / julgamentos por tipo de decisão (últimos {MAX_JULGAMENTOS} julgamentos guardados). Só "cobrar" e "retomar" contam para liberar o envio.</p>
        <ul className="lista">
          {placar.map((l) => (
            <li key={l.tipo}>
              <b>{ROTULO_TIPO_DECISAO[l.tipo]}</b>: {l.acertos}/{l.total}{l.percentual != null ? ` (${l.percentual}%)` : ' (sem julgamento)'}
            </li>
          ))}
        </ul>
        {julgados.length > 0 && (
          <details>
            <summary>Últimos julgamentos ({julgados.length})</summary>
            <ul className="lista">
              {julgados.slice(0, 30).map((j) => (
                <li key={j.id}>
                  <b>{j.nome}</b> <small>{ROTULO_TIPO_DECISAO[j.tipo]} · {j.veredito === 'acertou' ? 'acertou' : 'errou'}{j.decisaoCerta ? ` (certo: ${ROTULO_DECISAO_CERTA[j.decisaoCerta]})` : ''}</small>
                  {j.motivo && <div className="ajuda">{j.motivo}</div>}
                  <button type="button" className="pequeno" onClick={() => void reabrirJulgamento(db, j.id).then(recarregar)}>Julgar de novo</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="cartao" aria-label="O que a IA fez">
        <h3>O que a IA fez ({visao.acoes.length})</h3>
        <p className="ajuda">
          Cada ação automática (últimas {MAX_ACOES_IA}). <b>Desfazer</b> vale para "não enviar mais" (sai da lista) e para o agendamento que a IA criou no CRM (só remove o lembrete que ELA criou, e só se ainda for o mesmo).
          <b> Mensagem enviada não tem desfazer.</b>
        </p>
        {visao.acoes.length === 0 ? (
          <p className="ajuda">A IA ainda não fez nada sozinha.</p>
        ) : (
          <ul className="lista">
            {visao.acoes.map((a) => (
              <li key={a.id}>
                <b>{a.nome}</b> <small>{ROTULO_ACAO_IA[a.tipo]} · {dataHora(a.criadoEm)} · {a.origem === 'followup' ? 'follow-up' : 'reativação'}</small>
                <div className="ajuda">{a.resumo}</div>
                {a.desfeitaEm ? (
                  <div className="info">Desfeita em {dataHora(a.desfeitaEm)}.</div>
                ) : a.desfazer ? (
                  <div className="botoes">
                    <button type="button" className="pequeno" onClick={() => void desfazer(a.id)}>Desfazer</button>
                  </div>
                ) : (
                  <div className="ajuda">{a.tipo === 'enviou' ? 'Envio não tem desfazer.' : 'Sem desfazer para esta ação.'}</div>
                )}
                {a.avisoDesfazer && !a.desfeitaEm && <div className="aviso">{a.avisoDesfazer}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
