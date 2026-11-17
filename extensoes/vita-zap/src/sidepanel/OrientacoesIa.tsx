// "Orientações para a IA" (v0.7.57): regras fixas do dono, até 1500 caracteres, salvas na extensão e enviadas em TODA chamada
// de IA (classificar respostas, escrever cobrança/reativação, avaliar reativação, Pedir à IA). O servidor as trata como
// DADOS do dono, sempre abaixo das regras de segurança/LGPD/conformidade: não liberam link, preço nem alegação sobre o produto.

import { useEffect, useState } from 'react';
import { MAX_ORIENTACOES, PLACEHOLDER_ORIENTACOES, normalizarOrientacoes } from '../shared/orientacoes';
import type { CrmPainel } from './crm';

export function OrientacoesIa({ crm }: { crm: Pick<CrmPainel, 'repo'> }) {
  const [salvo, setSalvo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.resolve()
      .then(() => crm.repo.orientacoesIa())
      .then(
      (t) => {
        if (!vivo) return;
        setSalvo(t);
        setTexto(t);
      },
      () => {
        if (vivo) setMsg('Não consegui ler as orientações salvas (a extensão não respondeu).');
      },
    );
    return () => {
      vivo = false;
    };
  }, [crm.repo]);

  const mudou = salvo !== null && normalizarOrientacoes(texto) !== salvo;

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    try {
      const t = await crm.repo.salvarOrientacoesIa(texto);
      setSalvo(t);
      setTexto(t);
      setMsg(t === '' ? 'Orientações apagadas: a IA volta a seguir só as regras da Sal Vita.' : 'Orientações salvas. Valem para a próxima chamada de IA.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <details className="cartao" open={salvo !== null && salvo !== ''}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Orientações para a IA{salvo ? ' (ativas)' : ''}</summary>
      <p className="ajuda">
        Regras fixas suas, em português. Elas vão em <b>todas</b> as chamadas de IA (ler respostas, escrever cobrança e reativação, avaliar reativação, Pedir à IA).
        A IA as segue, mas <b>nunca acima</b> das regras de segurança, LGPD e conformidade: orientação não libera link, preço nem alegação sobre o produto, e o texto da IA continua passando pela mesma conferência antes de qualquer envio.
      </p>
      <textarea
        aria-label="Orientações para a IA"
        value={texto}
        rows={5}
        maxLength={MAX_ORIENTACOES}
        style={{ width: '100%' }}
        placeholder={PLACEHOLDER_ORIENTACOES}
        disabled={salvo === null || ocupado}
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="ajuda" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{texto.length}/{MAX_ORIENTACOES} caracteres</span>
        <span>{mudou ? 'Não salvo' : ''}</span>
      </div>
      <div className="botoes">
        <button type="button" className="primario pequeno" disabled={!mudou || ocupado} onClick={() => void salvar()}>
          Salvar orientações
        </button>
        {salvo && (
          <button type="button" className="pequeno" disabled={ocupado} onClick={() => { setTexto(''); }}>
            Limpar o campo
          </button>
        )}
      </div>
      {msg && <p className="info">{msg}</p>}
    </details>
  );
}
