// Resultado por texto do dono (v0.7.60): quantos foram enviados e quantos responderam, por texto, SÓ localmente.
// Um provedor lê o registro local (IndexedDB) e o editor de textos pergunta "como foi este texto?" pelo contexto: sem passar props
// por três abas. O texto é identificado pelo hash do conteúdo; editar o texto muda o hash e zera a contagem dele.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listarResultadosTexto, type Banco } from '../shared/banco';
import { AVISO_AMOSTRA_PEQUENA, hashDoTextoDoDono, resultadoDoTexto, rotuloDoResultado, type EnvioDoTexto, type ResultadoDoTexto } from '../shared/resultado-texto';

type ResultadoDe = (texto: string) => ResultadoDoTexto | null;

const Contexto = createContext<ResultadoDe>(() => null);

interface Props {
  db: Banco;
  /** Muda quando vale recarregar (trocou de aba: o Executor pode ter enviado enquanto a aba estava escondida). */
  versao: string;
  children: ReactNode;
}

export function ProvedorResultadosTexto({ db, versao, children }: Props) {
  const [envios, setEnvios] = useState<EnvioDoTexto[]>([]);
  useEffect(() => {
    let vivo = true;
    void listarResultadosTexto(db).then((x) => {
      if (vivo) setEnvios(x);
    }, () => undefined);
    return () => {
      vivo = false;
    };
  }, [db, versao]);
  const resultadoDe = useCallback<ResultadoDe>((texto) => (texto.trim() === '' ? null : resultadoDoTexto(envios, hashDoTextoDoDono(texto))), [envios]);
  const valor = useMemo(() => resultadoDe, [resultadoDe]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useResultadoDoTexto = (): ResultadoDe => useContext(Contexto);

/** A linha "enviado 42 · respondeu 9 (21%)" com o aviso de amostra pequena; sem envio, uma frase curta (editar zera a contagem). */
export function ResultadoDoTextoNaLinha({ resultado }: { resultado: ResultadoDoTexto | null }) {
  if (resultado == null) return null;
  const rotulo = rotuloDoResultado(resultado);
  if (rotulo == null) return <span className="ajuda" title="Editar o texto zera a contagem dele.">ainda sem envios deste texto</span>;
  return (
    <span className="ajuda" title="Respondeu = a leitura da conversa achou resposta do cliente em até 7 dias depois do envio. Só neste computador. Editar o texto zera a contagem dele.">
      {rotulo}
      {resultado.amostraPequena && <span className="aviso" style={{ marginLeft: 6 }}> {AVISO_AMOSTRA_PEQUENA}</span>}
    </span>
  );
}
