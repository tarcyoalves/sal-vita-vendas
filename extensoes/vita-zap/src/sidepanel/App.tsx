import { useCallback, useEffect, useRef, useState } from 'react';
import { abrirBanco, listarCampanhas, listarContatos, listarEnvios, listarNaoEnviar, type Banco } from '../shared/banco';
import type { Campanha } from '../shared/campanha';
import type { ContatoVarrido } from '../shared/contatos';
import type { Envio, NaoEnviar } from '../shared/exportar';
import { Clientes } from './Clientes';
import { useCrm } from './crm';
import { Dados } from './Dados';
import { Execucao } from './Execucao';
import { Lembretes } from './Lembretes';
import { Previa } from './Previa';
import { Varredura } from './Varredura';

type Aba = 'lembretes' | 'clientes' | 'varredura' | 'previa' | 'execucao' | 'dados';

export interface DadosLocais {
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
}

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'lembretes', rotulo: 'Lembretes' },
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
  const pedidoAtendido = useRef(0);
  const [dados, setDados] = useState<DadosLocais>({ contatos: [], campanhas: [], envios: [], naoEnviar: [] });
  const [campanhaAtiva, setCampanhaAtiva] = useState<string | null>(null);

  // Abriu o painel: busca os lembretes do CRM (no máximo 1 por hora; sem login não consulta nada).
  useEffect(() => {
    void crm.repo.sincronizarLembretes('painel').catch(() => undefined);
  }, [crm.repo]);

  // Botão "Clientes" / "Entrar no CRM" da barra do WhatsApp: a página grava o pedido na configuração e o painel
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
      <header className="topo">
        <strong>Vita Zap</strong>
        <span className="selo">CRM · você aperta o Enter</span>
      </header>
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a.id} type="button" className={a.id === aba ? 'ativa' : ''} onClick={() => setAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </nav>
      <main>
        {aba === 'lembretes' && <Lembretes crm={crm} />}
        {aba === 'clientes' && <Clientes crm={crm} />}
        {aba === 'varredura' && <Varredura db={db} dados={dados} aoMudar={recarregar} aoContinuar={() => setAba('previa')} />}
        {aba === 'previa' && (
          <Previa
            db={db}
            dados={dados}
            aoAprovar={async (id) => {
              await recarregar();
              setCampanhaAtiva(id);
              setAba('execucao');
            }}
          />
        )}
        {/* Sempre montada: trocar de aba não pode interromper uma campanha em andamento. */}
        <div hidden={aba !== 'execucao'}>
          <Execucao db={db} dados={dados} campanhaId={campanhaAtiva} aoEscolher={setCampanhaAtiva} aoMudar={recarregar} />
        </div>
        {aba === 'dados' && <Dados db={db} dados={dados} aoMudar={recarregar} crm={crm} />}
      </main>
    </div>
  );
}
