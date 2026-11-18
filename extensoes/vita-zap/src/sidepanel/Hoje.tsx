// Aba "Hoje" (v0.7.60): resumo SÓ DE LEITURA do que importa agora, com um atalho em cada cartão para a aba certa.
// Nada aqui envia, lê o WhatsApp, fala com o CRM ou grava: só junta o que já está guardado (shared/hoje.ts).

import { useCallback, useEffect, useState } from 'react';
import { listarCampanhas, listarContatos, listarEnvios, listarFollowups, listarNaoEnviar, listarReativacoes, type Banco } from '../shared/banco';
import { resumirHoje, type AbaDoPainel, type ResumoHoje } from '../shared/hoje';
import { carregarVisao, aoMudarModo } from './automaticos-motor';
import { useVersaoEquipe } from './equipe';
import { aoMudarSaude, falhaAtualDaIa } from './saude-painel';
import { contatadoPelaEquipe, indisponibilidadeDaEquipe } from './sincronia-equipe';

interface Props {
  db: Banco;
  /** A aba está à vista: recarrega (os motores gravam enquanto ela está escondida). */
  ativa?: boolean;
  /** O painel está logado no CRM. */
  logadoNoCrm: boolean;
  /** Abre a aba do atalho. */
  ir: (aba: AbaDoPainel) => void;
}

async function montar(db: Banco, agora: Date, logadoNoCrm: boolean): Promise<ResumoHoje> {
  const [visao, followups, reativacoes, campanhas, contatos, naoEnviar, envios] = await Promise.all([
    carregarVisao(db, agora),
    listarFollowups(db),
    listarReativacoes(db),
    listarCampanhas(db),
    listarContatos(db),
    listarNaoEnviar(db),
    listarEnvios(db),
  ]);
  return resumirHoje({
    agora,
    modo: visao.modo,
    previsao: visao.fila,
    followups,
    reativacoes,
    campanhas,
    acoes: visao.acoes,
    pendentes: visao.pendentes,
    liberacao: visao.liberacao,
    contatos,
    naoEnviar,
    envios,
    configReativacao: visao.reativacao,
    followupPausado: visao.followup.ligado && visao.followup.pausado,
    reativacaoPausada: visao.reativacao.ligado && visao.reativacao.pausado,
    contatadoPelaEquipe: contatadoPelaEquipe(),
    logadoNoCrm,
    crmIndisponivel: indisponibilidadeDaEquipe(),
    falhaDaIa: falhaAtualDaIa(),
  });
}

export function Hoje({ db, ativa, logadoNoCrm, ir }: Props) {
  const [resumo, setResumo] = useState<ResumoHoje | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const versaoEquipe = useVersaoEquipe();

  const recarregar = useCallback(async () => {
    try {
      setResumo(await montar(db, new Date(), logadoNoCrm));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [db, logadoNoCrm]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, ativa, versaoEquipe]);
  useEffect(() => aoMudarModo(() => void recarregar()), [recarregar]);
  useEffect(() => aoMudarSaude(() => void recarregar()), [recarregar]);
  // À vista, atualiza a cada minuto (a previsão e os agendamentos andam com o relógio).
  useEffect(() => {
    if (!ativa) return;
    const t = setInterval(() => void recarregar(), 60_000);
    return () => clearInterval(t);
  }, [ativa, recarregar]);

  if (erro) return <p className="aviso" role="alert">Não consegui montar o resumo: {erro}</p>;
  if (!resumo) return <p className="carregando">Carregando…</p>;

  return (
    <section aria-label="Hoje">
      {resumo.alertas.length > 0 && (
        <div className="cartao hoje-alertas" aria-label="Avisos">
          <h3>Atenção ({resumo.alertas.length})</h3>
          <ul className="lista">
            {resumo.alertas.map((a) => (
              <li key={a.id} className={`hoje-alerta hoje-alerta-${a.tipo}`}>
                <span className="aviso" role="alert">{a.texto}</span>
                <div className="botoes">
                  <button type="button" className="pequeno" onClick={() => ir(a.destino)}>Abrir</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {resumo.cartoes.map((c) => (
        <div key={c.id} className="cartao hoje-cartao" aria-label={c.titulo} data-cartao={c.id}>
          <div className="hoje-topo">
            <h3>{c.titulo}</h3>
            <span className="hoje-numero" aria-label={`${c.numero} em ${c.titulo}`}>{c.numero}</span>
          </div>
          <p className="ajuda">{c.detalhe}</p>
          <div className="botoes">
            <button type="button" className="pequeno primario" onClick={() => ir(c.destino)}>Abrir</button>
            {c.extras?.map((x) => (
              <button key={x.rotulo} type="button" className="pequeno" onClick={() => ir(x.destino)}>{x.rotulo}</button>
            ))}
          </div>
        </div>
      ))}
      {resumo.alertas.length === 0 && <p className="info">Nenhum erro nem pausa ativa: CRM e IA responderam na última tentativa.</p>}
    </section>
  );
}
