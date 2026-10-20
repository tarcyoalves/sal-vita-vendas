import { useCallback, useEffect, useMemo, useState } from 'react';
import { abrirBanco, lerAutomatico, listarCampanhas, listarContatos, listarEnvios, listarNaoEnviar, type Banco } from '../shared/banco';
import { ESTADO_AUTOMATICO_PADRAO, type EstadoAutomatico } from '../shared/automatico';
import type { Campanha } from '../shared/campanha';
import { RegistroDiagnostico } from '../shared/diagnostico';
import type { ContatoVarrido } from '../shared/contatos';
import type { Envio, NaoEnviar } from '../shared/exportar';
import { Dados } from './Dados';
import { Execucao } from './Execucao';
import { Previa } from './Previa';
import { Varredura } from './Varredura';

type Aba = 'varredura' | 'previa' | 'execucao' | 'dados';

export interface DadosLocais {
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
}

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'varredura', rotulo: '1. Varredura' },
  { id: 'previa', rotulo: '2. Prévia' },
  { id: 'execucao', rotulo: '3. Envio' },
  { id: 'dados', rotulo: 'Dados' },
];

export function App() {
  const [db, setDb] = useState<Banco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('varredura');
  const [dados, setDados] = useState<DadosLocais>({ contatos: [], campanhas: [], envios: [], naoEnviar: [] });
  const [campanhaAtiva, setCampanhaAtiva] = useState<string | null>(null);
  const [automatico, setAutomatico] = useState<EstadoAutomatico>(ESTADO_AUTOMATICO_PADRAO);

  useEffect(() => {
    abrirBanco().then(setDb, (e: unknown) => setErro(`Não abri o banco local: ${String(e)}`));
  }, []);

  const registro = useMemo(() => {
    if (!db) return null;
    let versao = '?';
    try {
      versao = chrome.runtime.getManifest().version;
    } catch {
      // fora do Chrome (testes)
    }
    const r = new RegistroDiagnostico(db, versao);
    void r.carregar().catch(() => undefined);
    return r;
  }, [db]);

  const recarregar = useCallback(async () => {
    if (!db) return;
    const [contatos, campanhas, envios, naoEnviar] = await Promise.all([
      listarContatos(db),
      listarCampanhas(db),
      listarEnvios(db),
      listarNaoEnviar(db),
    ]);
    setDados({ contatos, campanhas, envios, naoEnviar });
    setAutomatico(await lerAutomatico(db));
  }, [db]);

  // O freio pode desligar o automático sozinho: o selo do topo acompanha o banco.
  useEffect(() => {
    if (!db) return;
    const t = setInterval(() => void lerAutomatico(db).then(setAutomatico, () => undefined), 2000);
    return () => clearInterval(t);
  }, [db]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro) return <div className="erro">{erro}</div>;
  if (!db || !registro) return <div className="carregando">Carregando…</div>;

  return (
    <div className="app">
      <header className="topo">
        <strong>Vita Zap</strong>
        {automatico.ligado ? (
          <span className="selo auto" role="status">AUTOMÁTICO</span>
        ) : (
          <span className="selo">fase 1 · você aperta o Enter</span>
        )}
      </header>
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a.id} type="button" className={a.id === aba ? 'ativa' : ''} onClick={() => setAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </nav>
      <main>
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
          <Execucao db={db} registro={registro} dados={dados} campanhaId={campanhaAtiva} aoEscolher={setCampanhaAtiva} aoMudar={recarregar} />
        </div>
        {aba === 'dados' && <Dados db={db} registro={registro} dados={dados} automatico={automatico} aoMudar={recarregar} />}
      </main>
    </div>
  );
}
