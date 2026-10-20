import { useEffect, useMemo, useState } from 'react';
import { type RegistroDiagnostico, textoDiagnostico } from '../shared/diagnostico';

/** "Copiar diagnóstico" e "Baixar diagnóstico (.txt)". O texto não tem mensagens e mascara telefones. */
export function BotoesDiagnostico({ registro }: { registro: RegistroDiagnostico }) {
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => registro.assinar(() => setVersao((v) => v + 1)), [registro]);

  const texto = useMemo(() => textoDiagnostico(registro.lista(), registro.versao), [registro, versao]);
  const url = useMemo(() => URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })), [texto]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Diagnóstico copiado. Cole na conversa com quem vai ajudar.');
    } catch {
      setAviso('Não consegui copiar. Use "Baixar diagnóstico (.txt)".');
    }
  }

  const nome = `vita-zap-diagnostico-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
  return (
    <>
      <div className="botoes">
        <button type="button" onClick={() => void copiar()}>
          Copiar diagnóstico
        </button>
        <a className="botao" href={url} download={nome}>
          Baixar diagnóstico (.txt)
        </a>
      </div>
      {aviso && <p className="info">{aviso}</p>}
    </>
  );
}
