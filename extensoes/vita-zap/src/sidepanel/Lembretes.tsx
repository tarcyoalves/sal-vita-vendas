// Central de lembretes: Vencidos / Hoje / Próximos. Abrir leva ao WhatsApp Web, abre a conversa e
// COLA o rascunho na caixa (quem envia é você, com Enter).

import { useState } from 'react';
import { abrirConversaNoWhatsApp } from '../shared/crm-acoes';
import { agruparLembretes, formatarVencimento, prazoRapido } from '../shared/crm-lembretes';
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

export function Lembretes({ crm }: { crm: CrmPainel }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!crm.dados) return <div className="carregando">Carregando…</div>;
  const g = agruparLembretes(crm.dados.lembretes, crm.agora);

  async function abrir(l: Lembrete) {
    setMsg(null);
    try {
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
      {msg && <p className="info">{msg}</p>}
      {total === 0 && <div className="cartao">Nenhum lembrete. No WhatsApp Web, use o botão de relógio no cabeçalho de uma conversa.</div>}
      <Secao titulo="Vencidos" itens={g.vencidos} vencidos crm={crm} aoAbrir={abrir} />
      <Secao titulo="Hoje" itens={g.hoje} crm={crm} aoAbrir={abrir} />
      <Secao titulo="Próximos" itens={g.proximos} crm={crm} aoAbrir={abrir} />
    </section>
  );
}
