import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { abrirBanco, aoMarcarNaoEnviar, listarCampanhas, listarContatos, listarEnvios, listarNaoEnviar, type Banco } from '../shared/banco';
import type { Campanha } from '../shared/campanha';
import type { ContatoVarrido } from '../shared/contatos';
import type { Envio, NaoEnviar } from '../shared/exportar';
import type { EstadoConta } from '../shared/leads';
import { Acompanhar, resumoDoPainel, rotuloDaAbaAcompanhar, useAcompanhando } from './Acompanhar';
import { Clientes } from './Clientes';
import { ContaCrm } from './ContaCrm';
import { AvisoVersao } from './AvisoVersao';
import { Automaticos } from './Automaticos';
import { conectarAutomaticamente, dependenciasPadrao } from './conexao';
import { useCrm } from './crm';
import { ABA_INICIAL, ABAS, LINHAS_DE_ABAS, type Aba } from './abas';
import { Dados } from './Dados';
import { useEquipe } from './equipe';
import { Execucao } from './Execucao';
import { Followup } from './Followup';
import { Hoje } from './Hoje';
import { Lembretes } from './Lembretes';
import { PedirIa } from './PedirIa';
import { Previa } from './Previa';
import { Reativacao } from './Reativacao';
import { ProvedorResultadosTexto } from './ResultadosTexto';
import { Varredura } from './Varredura';

export interface DadosLocais {
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
}

export function App() {
  const [db, setDb] = useState<Banco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(ABA_INICIAL);
  const crm = useCrm();
  const acompanhando = useAcompanhando(crm);
  const resumoAcomp = resumoDoPainel(acompanhando, crm.agora);
  const pedidoAtendido = useRef(0);
  const [dados, setDados] = useState<DadosLocais>({ contatos: [], campanhas: [], envios: [], naoEnviar: [] });
  const [campanhaAtiva, setCampanhaAtiva] = useState<string | null>(null);
  const [conta, setConta] = useState<EstadoConta | null>(null);

  useEffect(() => {
    let vivo = true;
    crm.repo.conta().then((c) => {
      if (vivo) setConta(c);
    }).catch(() => undefined);
    return crm.repo.aoMudar(() => {
      crm.repo.conta().then((c) => {
        if (vivo) setConta(c);
      }).catch(() => undefined);
    });
  }, [crm.repo]);

  // Abriu o painel: se o Chrome já deu acesso ao CRM e o atendente está logado no site, conecta sozinho (sem senha);
  // depois busca os lembretes do CRM (no máximo 1 por hora; sem login não consulta nada).
  useEffect(() => {
    void conectarAutomaticamente(dependenciasPadrao(crm.repo))
      .then(() => crm.repo.sincronizarLembretes('painel'))
      .catch(() => undefined);
  }, [crm.repo]);

  // Botão "Clientes" / "Conectar ao CRM" da barra do WhatsApp: a página grava o pedido na configuração e o painel
  // abre nessa aba (só pedidos de até 15 s, para não pular de aba por um pedido antigo).
  const pedido = crm.dados?.config.pedidoPainel;
  useEffect(() => {
    if (!pedido || pedido.ts <= pedidoAtendido.current) return;
    pedidoAtendido.current = pedido.ts;
    if (Date.now() - pedido.ts < 15_000) setAba(pedido.aba);
  }, [pedido]);

  useEffect(() => {
    abrirBanco().then(setDb, (e: unknown) => setErro(`Não abri o banco local: ${String(e)}`));
  }, []);

  const recarregar = useCallback(async () => {
    if (!db) return;
    const [contatos, campanhas, envios, naoEnviar] = await Promise.all([
      listarContatos(db),
      listarCampanhas(db),
      listarEnvios(db),
      listarNaoEnviar(db),
    ]);
    setDados({ contatos, campanhas, envios, naoEnviar });
  }, [db]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Equipe (0.7.60): ao abrir o painel, o "não enviar mais" e os envios daqui sobem ao CRM e o que outros marcaram vem para cá
  // (a união vale). Depois, cada "não enviar mais" marcado aqui sobe em ~1,5 s. Sem rede: o que existe aqui continua valendo.
  const equipe = useEquipe(db, crm);
  const logado = conta?.usuario != null;
  useEffect(() => {
    if (!equipe || !logado) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void equipe
      .sincronizar({ forcar: true })
      .then(async (r) => {
        if (vivo) void recarregar(); // confirmado/pendente mudam o rótulo de cada "não enviar mais"
        // Quem a equipe contatou há pouco (uma consulta em lote, cache de 5 min): a tela Hoje e a prévia já abrem certas.
        if (vivo && r.ok && db) await equipe.preparar((await listarContatos(db)).filter((c) => c.temConversa && !c.soNumero && !c.pareceGrupo).map((c) => ({ nome: c.nome, chave: c.chave })));
      })
      .catch(() => undefined);
    const parar = aoMarcarNaoEnviar(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void equipe.sincronizar({ soOptOuts: true }).then((r) => {
          if (vivo) void recarregar();
        });
      }, 1500);
    });
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      parar();
    };
  }, [equipe, logado, recarregar, db]);

  // A aba 3 só lista campanhas comuns: as de cobrança do follow-up e as de reativação têm o painel próprio.
  const dadosDasCampanhas = useMemo(() => ({ ...dados, campanhas: dados.campanhas.filter((c) => c.tipo == null) }), [dados]);

  if (erro) return <div className="erro">{erro}</div>;
  if (!db) return <div className="carregando">Carregando…</div>;

  return (
    <div className="app">
      {conta && !conta.usuario && (
        <div className="painel-bloqueio-overlay" role="dialog" aria-modal="true">
          <div className="painel-bloqueio-card">
            <div className="painel-bloqueio-icone" aria-hidden="true">🔒</div>
            <h2 className="painel-bloqueio-titulo">Acesso Protegido</h2>
            <p className="painel-bloqueio-desc">
              Autentique-se com sua conta do CRM Sal Vita para desbloquear os recursos do Vita Zap.
            </p>
            <ContaCrm crm={crm} />
          </div>
        </div>
      )}
      <header className="topo">
        <div className="topo-marca">
          <span className="topo-logo" aria-hidden="true">VZ</span>
          <strong>Vita Zap</strong>
        </div>
        <span className="selo">CRM · você aperta o Enter</span>
      </header>
      <AvisoVersao />
      <nav className="abas" aria-label="Navegação do painel">
        {LINHAS_DE_ABAS.map((linha) => (
          <div key={linha.ids[0]} className={linha.classe}>
            {linha.ids.map((id) => {
              const a = ABAS.find((x) => x.id === id)!;
              const alerta = a.id === 'acompanhar' && (resumoAcomp?.vencidos ?? 0) > 0;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`${a.id === aba ? 'ativa' : ''}${alerta ? ' alerta' : ''}`.trim()}
                  title={alerta ? 'Há cliente em acompanhamento com lembrete vencido' : undefined}
                  onClick={() => setAba(a.id)}
                >
                  {a.id === 'acompanhar' ? rotuloDaAbaAcompanhar(resumoAcomp) : a.rotulo}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <main>
        <ProvedorResultadosTexto db={db} versao={aba}>
        {/* Sempre montada: o resumo se atualiza sozinho e a troca de aba não perde nada. */}
        <div hidden={aba !== 'hoje'}>
          <Hoje db={db} ativa={aba === 'hoje'} logadoNoCrm={conta == null || conta.usuario != null} ir={setAba} />
        </div>
        {aba === 'lembretes' && <Lembretes crm={crm} />}
        {aba === 'acompanhar' && <Acompanhar crm={crm} acompanhando={acompanhando} />}
        {aba === 'clientes' && <Clientes crm={crm} />}
        {aba === 'varredura' && <Varredura db={db} dados={dados} aoMudar={recarregar} aoContinuar={() => setAba('previa')} />}
        {aba === 'previa' && (
          <Previa
            db={db}
            dados={dados}
            crm={crm}
            aoIrParaVarredura={() => setAba('varredura')}
            aoMudar={recarregar}
            aoAprovar={async (id) => {
              await recarregar();
              setCampanhaAtiva(id);
              setAba('execucao');
            }}
          />
        )}
        {/* Sempre montada: trocar de aba não pode interromper uma campanha em andamento. */}
        <div hidden={aba !== 'execucao'}>
          <Execucao db={db} dados={dadosDasCampanhas} crm={crm} campanhaId={campanhaAtiva} aoEscolher={setCampanhaAtiva} aoMudar={recarregar} />
        </div>
        {/* Também sempre montada: a cobrança automática do follow-up continua com a aba fechada. */}
        <div hidden={aba !== 'followup'}>
          <Followup db={db} crm={crm} ativa={aba === 'followup'} aoAbrirAutomaticos={() => setAba('automaticos')} />
        </div>
        {/* Também sempre montada: a reativação automática continua com a aba fechada. */}
        <div hidden={aba !== 'reativacao'}>
          <Reativacao db={db} crm={crm} dados={dados} ativa={aba === 'reativacao'} aoAbrirAutomaticos={() => setAba('automaticos')} />
        </div>
        <div hidden={aba !== 'automaticos'}>
          <Automaticos db={db} crm={crm} ativa={aba === 'automaticos'} />
        </div>
        {/* Também montada sempre: a leitura das conversas continua com a aba fechada. */}
        <div hidden={aba !== 'pedir'}>
          <PedirIa
            db={db}
            crm={crm}
            dados={dados}
            ativa={aba === 'pedir'}
            aoAprovar={async (id) => {
              await recarregar();
              setCampanhaAtiva(id);
              setAba('execucao');
            }}
          />
        </div>
        {aba === 'dados' && <Dados db={db} dados={dados} aoMudar={recarregar} crm={crm} />}
        </ProvedorResultadosTexto>
      </main>
    </div>
  );
}
