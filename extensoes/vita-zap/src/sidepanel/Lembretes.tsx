// Central de lembretes: Vencidos / Hoje / Próximos. Abrir leva ao WhatsApp Web, abre a conversa e
// COLA o rascunho na caixa (quem envia é você, com Enter).

import { useEffect, useState } from 'react';
import { abrirConversaNoWhatsApp, abrirConversaPorTelefone } from '../shared/crm-acoes';
import { ehLembreteCrm } from '../shared/crm-remoto';
import { agruparLembretes, formatarVencimento, prazoRapido, textoAtualizadoHa } from '../shared/crm-lembretes';
import type { EstadoConta } from '../shared/leads';
import type { Lembrete } from '../shared/crm-tipos';
import type { CrmPainel } from './crm';

function Secao({ titulo, itens, vencidos, crm, aoAbrir }: { titulo: string; itens: Lembrete[]; vencidos?: boolean; crm: CrmPainel; aoAbrir: (l: Lembrete) => void }) {
  return (
    <div className="cartao">
      <h3>
        {titulo} <small className="ajuda">({itens.length})</small>
      </h3>
      {itens.length === 0 ? (
        <p className="ajuda">Nada aqui.</p>
      ) : (
        <ul className="lista">
          {itens.map((l) => (
            <li key={l.id}>
              <div>
                <b>{l.nome}</b>
              </div>
              <div className={vencidos ? 'erro' : 'ajuda'}>{formatarVencimento(l.venceEm, crm.agora)}</div>
              {l.rascunho && <div className="balao">{l.rascunho}</div>}
              <div className="botoes">
                <button type="button" className="primario pequeno" onClick={() => aoAbrir(l)}>
                  Abrir conversa
                </button>
                <button
                  type="button"
                  className="pequeno"
                  onClick={() => void crm.fazer((r) => r.atualizarLembrete(l.id, { status: 'concluido' }))}
                >
                  Concluir
                </button>
                <button
                  type="button"
                  className="pequeno"
                  title="Adiar para amanhã às 9h"
                  onClick={() => void crm.fazer((r) => r.adiarLembrete(l.id, prazoRapido('amanha9h', new Date()), new Date()))}
                >
                  Adiar
                </button>
                <button
                  type="button"
                  className="pequeno perigo"
                  onClick={() => {
                    if (window.confirm(`Excluir o lembrete de "${l.nome}"?`)) void crm.fazer((r) => r.excluirLembrete(l.id));
                  }}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Atualizar do CRM": busca os lembretes agora (ignora o intervalo mínimo de 60 min). Só aparece com login. */
function AtualizarDoCrm({ crm }: { crm: CrmPainel }) {
  const [conta, setConta] = useState<EstadoConta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = (): void => void crm.repo.conta().then((c) => vivo && setConta(c), () => undefined);
    ler();
    const parar = crm.repo.aoMudar(ler);
    return () => {
      vivo = false;
      parar();
    };
  }, [crm.repo]);
  if (!conta?.usuario) return null;

  async function atualizar() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await crm.repo.sincronizarLembretes('botao');
      setMsg(r.ok ? `${r.quantidade} lembrete(s) do CRM.` : r.erro.mensagem);
      setConta(await crm.repo.conta());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não consegui atualizar do CRM.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <p className="ajuda">
      <button type="button" className="pequeno" disabled={ocupado} onClick={() => void atualizar()}>
        {ocupado ? 'Atualizando…' : 'Atualizar do CRM'}
      </button>{' '}
      {textoAtualizadoHa(conta.sincronizadoEm, crm.agora.getTime())}
      {msg ? ` · ${msg}` : ''}
    </p>
  );
}

export function Lembretes({ crm }: { crm: CrmPainel }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!crm.dados) return <div className="carregando">Carregando…</div>;
  const g = agruparLembretes(crm.dados.lembretes, crm.agora);

  async function abrir(l: Lembrete) {
    setMsg(null);
    try {
      // Lembrete do CRM Lembretes: abre a conversa pelo telefone (não envia nada).
      if (ehLembreteCrm(l.id) && l.telefone && (await abrirConversaPorTelefone(l.telefone))) {
        setMsg(`Abrindo a conversa de ${l.nome} pelo telefone no WhatsApp Web. Nada é enviado.`);
        return;
      }
      await abrirConversaNoWhatsApp(crm.repo, { nome: l.nome, telefone: l.telefone, rascunho: l.rascunho, lembreteId: l.id });
      setMsg(`Abrindo a conversa de ${l.nome} no WhatsApp Web. O rascunho (se houver) será colado na caixa: confira e aperte Enter.`);
    } catch {
      setMsg('Não consegui falar com a aba do WhatsApp Web. Abra web.whatsapp.com e recarregue a aba (F5).');
    }
  }

  const total = g.vencidos.length + g.hoje.length + g.proximos.length;
  return (
    <section>
      <p className="ajuda">Avisos de follow-up. Na hora marcada o Chrome mostra uma notificação; clique nela para abrir a conversa. Nada é enviado sozinho.</p>
      <AtualizarDoCrm crm={crm} />
      {msg && <p className="info">{msg}</p>}
      {total === 0 && <div className="cartao">Nenhum lembrete. No WhatsApp Web, use o botão de relógio no cabeçalho de uma conversa.</div>}
      <Secao titulo="Vencidos" itens={g.vencidos} vencidos crm={crm} aoAbrir={abrir} />
      <Secao titulo="Hoje" itens={g.hoje} crm={crm} aoAbrir={abrir} />
      <Secao titulo="Próximos" itens={g.proximos} crm={crm} aoAbrir={abrir} />
    </section>
  );
}
