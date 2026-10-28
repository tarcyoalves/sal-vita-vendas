import { useCallback, useEffect, useRef, useState } from 'react';
import { abrirBanco, listarCampanhas, listarContatos, listarEnvios, listarNaoEnviar, type Banco } from '../shared/banco';
import type { Campanha } from '../shared/campanha';
import type { ContatoVarrido } from '../shared/contatos';
import type { Envio, NaoEnviar } from '../shared/exportar';
import type { EstadoConta } from '../shared/leads';
import { Acompanhar, resumoDoPainel, rotuloDaAbaAcompanhar, useAcompanhando } from './Acompanhar';
import { Clientes } from './Clientes';
import { ContaCrm } from './ContaCrm';
import { AvisoVersao } from './AvisoVersao';
import { conectarAutomaticamente, dependenciasPadrao } from './conexao';
import { useCrm } from './crm';
import { Dados } from './Dados';
import { Execucao } from './Execucao';
import { Lembretes } from './Lembretes';
import { Previa } from './Previa';
import { Varredura } from './Varredura';

type Aba = 'lembretes' | 'acompanhar' | 'clientes' | 'varredura' | 'previa' | 'execucao' | 'dados';

export interface DadosLocais {
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
}

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'lembretes', rotulo: 'Lembretes' },
  { id: 'acompanhar', rotulo: 'Acompanhar' },
  { id: 'clientes', rotulo: 'Clientes' },
  { id: 'varredura', rotulo: '1. Varredura' },
  { id: 'previa', rotulo: '2. Prévia' },
  { id: 'execucao', rotulo: '3. Envio' },
  { id: 'dados', rotulo: 'Dados' },
];

export function App() {
  const [db, setDb] = useState<Banco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('lembretes');
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
        <div className="abas-linha abas-linha-crm">
          {ABAS.slice(0, 3).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${a.id === aba ? 'ativa' : ''}${a.id === 'acompanhar' && (resumoAcomp?.vencidos ?? 0) > 0 ? ' alerta' : ''}`.trim()}
              title={a.id === 'acompanhar' && (resumoAcomp?.vencidos ?? 0) > 0 ? 'Há cliente em acompanhamento com lembrete vencido' : undefined}
              onClick={() => setAba(a.id)}
            >
              {a.id === 'acompanhar' ? rotuloDaAbaAcompanhar(resumoAcomp) : a.rotulo}
            </button>
          ))}
        </div>
        <div className="abas-linha abas-linha-campanha">
          {ABAS.slice(3).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${a.id === aba ? 'ativa' : ''}`.trim()}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </nav>
      <main>
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
            aoAprovar={async (id) => {
              await recarregar();
              setCampanhaAtiva(id);
              setAba('execucao');
            }}
          />
        )}
        {/* Sempre montada: trocar de aba não pode interromper uma campanha em andamento. */}
        <div hidden={aba !== 'execucao'}>
          <Execucao db={db} dados={dados} crm={crm} campanhaId={campanhaAtiva} aoEscolher={setCampanhaAtiva} aoMudar={recarregar} />
        </div>
        {aba === 'dados' && <Dados db={db} dados={dados} aoMudar={recarregar} crm={crm} />}
      </main>
    </div>
  );
}
