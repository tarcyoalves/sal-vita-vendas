// Aba "Acompanhar": clientes prestes a fechar que não podem ser esquecidos (leads com a etiqueta "Acompanhar" do CRM).
// Fonte: cache local + 1 consulta ao CRM quando a aba abre (no máximo 1 a cada 15 min) ou no botão Atualizar.
// Nenhuma consulta periódica. Abrir conversa usa a busca do WhatsApp, sem recarregar a página. Nada é enviado.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { abrirConversaPorTelefone, textoDaAbertura } from '../shared/crm-acoes';
import { lembreteVencido, ordenarAcompanhando, resumoAcompanhando, textoSemContato, type ResumoAcompanhando } from '../shared/crm-acompanhar';
import { formatarVencimento, lerDataHoraLocal, PRAZOS_RAPIDOS, prazoRapido, textoAtualizadoHa } from '../shared/crm-lembretes';
import { LIMITE_TEXTO_CONTATO, type LeadCrm } from '../shared/crm-remoto';
import type { MotivoAcompanhando, ResultadoAcompanhando, ResultadoAcao } from '../shared/leads';
import type { CrmPainel } from './crm';

export interface AcompanhandoPainel {
  dados: ResultadoAcompanhando | null;
  carregando: boolean;
  /** `cache` = leitura local; `aba`/`botao` podem ir ao CRM (ver MotivoAcompanhando). */
  ler: (motivo: MotivoAcompanhando) => Promise<void>;
}

const SEM_RESPOSTA = 'A extensão não respondeu. Recarregue a extensão.';

/** Lista guardada pelo service worker. Relê o cache sempre que algo do CRM muda (nunca vai ao CRM por conta própria). */
export function useAcompanhando(crm: CrmPainel): AcompanhandoPainel {
  const [dados, setDados] = useState<ResultadoAcompanhando | null>(null);
  const [carregando, setCarregando] = useState(false);

  const ler = useCallback(
    async (motivo: MotivoAcompanhando) => {
      if (motivo !== 'cache') setCarregando(true);
      try {
        setDados(await crm.repo.acompanhando(motivo));
      } catch (e) {
        setDados({ ok: false, erro: { tipo: 'rede', mensagem: e instanceof Error && e.message ? e.message : SEM_RESPOSTA } });
      } finally {
        if (motivo !== 'cache') setCarregando(false);
      }
    },
    [crm.repo],
  );

  useEffect(() => {
    void ler('cache');
    return crm.repo.aoMudar(() => void ler('cache'));
  }, [crm.repo, ler]);

  return { dados, carregando, ler };
}

/** Contador da aba: null enquanto não há login/dados. */
export function resumoDoPainel(a: AcompanhandoPainel, agora: Date): ResumoAcompanhando | null {
  return a.dados?.ok ? resumoAcompanhando(a.dados.leads, agora) : null;
}

export function rotuloDaAbaAcompanhar(resumo: ResumoAcompanhando | null): string {
  return resumo && resumo.total > 0 ? `Acompanhar (${resumo.total})` : 'Acompanhar';
}

function dataCurta(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' });
}

function Cartao({ lead, crm, avisar }: { lead: LeadCrm; crm: CrmPainel; avisar: (m: string) => void }) {
  const [painel, setPainel] = useState<'contato' | 'reagendar' | null>(null);
  const [texto, setTexto] = useState('');
  const [personalizada, setPersonalizada] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const vencido = lembreteVencido(lead, crm.agora);

  async function executar(fazer: () => Promise<ResultadoAcao | { ok: true } | { ok: false; erro: { mensagem: string } }>, sucesso: string) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fazer();
      if (!r.ok) {
        setErro(r.erro.mensagem);
        return;
      }
      setPainel(null);
      setTexto('');
      setPersonalizada('');
      avisar('pendente' in r && r.pendente ? 'Sem conexão com o CRM: guardei a ação e reenvio sozinho quando a internet voltar.' : sucesso);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : SEM_RESPOSTA);
    } finally {
      setOcupado(false);
    }
  }

  async function abrir() {
    avisar('');
    try {
      const r = lead.telefone ? await abrirConversaPorTelefone(lead.telefone, lead.titulo) : null;
      avisar(r ? textoDaAbertura(r, lead.titulo) : 'Este lead não tem um telefone válido no CRM para abrir a conversa.');
    } catch {
      avisar('Não consegui falar com a aba do WhatsApp Web. Abra web.whatsapp.com e recarregue a aba (F5).');
    }
  }

  const reagendar = (em: number | null) => {
    if (em == null) {
      setErro('Escolha a data e a hora.');
      return;
    }
    void executar(async () => {
      const r = await crm.repo.reagendarTask(lead.id, em);
      return r;
    }, 'Lembrete reagendado no CRM.');
  };

  return (
    <li className={vencido ? 'acomp-vencido' : undefined}>
      <div>
        <b>{lead.titulo}</b> {vencido && <span className="vencido">lembrete vencido</span>}
      </div>
      <div className={vencido ? 'erro' : 'ajuda'}>{lead.lembreteEm && lead.lembreteAtivo ? `Próximo lembrete: ${formatarVencimento(lead.lembreteEm, crm.agora)}` : 'Sem lembrete'}</div>
      <div className="ajuda">
        {lead.ultimoContatoEm ? `Último contato: ${dataCurta(lead.ultimoContatoEm)} (${lead.contatos}x) · ` : ''}
        <b>{textoSemContato(lead, crm.agora)}</b>
      </div>
      <div className="botoes">
        <button type="button" className="primario pequeno" onClick={() => void abrir()}>
          Abrir conversa
        </button>
        <button type="button" className="pequeno" onClick={() => setPainel(painel === 'contato' ? null : 'contato')}>
          Registrar contato
        </button>
        <button type="button" className="pequeno" onClick={() => setPainel(painel === 'reagendar' ? null : 'reagendar')}>
          Reagendar
        </button>
      </div>
      {painel === 'contato' && (
        <div>
          <textarea
            rows={3}
            maxLength={LIMITE_TEXTO_CONTATO}
            aria-label="Texto do contato"
            placeholder="O que foi combinado? (preço, quantidade, prazo, retorno...)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="button" className="primario pequeno" disabled={ocupado} onClick={() => void executar(() => crm.repo.registrarContatoNaTask(lead.id, texto), 'Contato registrado nas notas do lead.')}>
            Registrar no CRM
          </button>
        </div>
      )}
      {painel === 'reagendar' && (
        <div>
          <div className="botoes">
            {PRAZOS_RAPIDOS.map((p) => (
              <button key={p.id} type="button" className="pequeno" disabled={ocupado} onClick={() => reagendar(prazoRapido(p.id, new Date()))}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <div className="botoes">
            <input type="datetime-local" aria-label="Data e hora personalizadas" value={personalizada} onChange={(e) => setPersonalizada(e.target.value)} />
            <button type="button" className="primario pequeno" disabled={ocupado} onClick={() => reagendar(lerDataHoraLocal(personalizada))}>
              Reagendar no CRM
            </button>
          </div>
        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
    </li>
  );
}

export function Acompanhar({ crm, acompanhando }: { crm: CrmPainel; acompanhando: AcompanhandoPainel }) {
  const [msg, setMsg] = useState<string | null>(null);
  const { dados, carregando, ler } = acompanhando;

  // Abriu a aba: no máximo 1 consulta ao CRM (o serviço ignora o pedido se a última tentativa tem menos de 15 min).
  useEffect(() => {
    void ler('aba');
  }, [ler]);

  const ordenados = useMemo(() => (dados?.ok ? ordenarAcompanhando(dados.leads, crm.agora) : []), [dados, crm.agora]);
  const resumo = dados?.ok ? resumoAcompanhando(dados.leads, crm.agora) : null;

  return (
    <section>
      <p className="ajuda">
        Clientes prestes a fechar que você marcou com <b>Acompanhar</b> na conversa. Ficam aqui até o fechamento (Marcar convertido tira da lista). Vencidos primeiro,
        depois quem está há mais tempo sem contato.
      </p>
      <p className="ajuda">
        <button type="button" className="pequeno" disabled={carregando} onClick={() => void ler('botao')}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>{' '}
        {dados?.ok ? textoAtualizadoHa(dados.atualizadoEm, crm.agora.getTime()) : ''}
        {resumo ? ` · ${resumo.total} em acompanhamento${resumo.vencidos > 0 ? `, ${resumo.vencidos} vencido${resumo.vencidos > 1 ? 's' : ''}` : ''}` : ''}
      </p>
      {dados && !dados.ok && <p className="erro">{dados.erro.mensagem}</p>}
      {dados?.ok && dados.desatualizado && <p className="aviso">Mostrando a lista guardada: {dados.aviso?.mensagem ?? 'não consegui atualizar do CRM.'}</p>}
      {msg && <p className="info">{msg}</p>}
      {dados?.ok && ordenados.length === 0 && (
        <div className="cartao">Nenhum cliente em acompanhamento. Na faixa do lead, no WhatsApp, use o botão Acompanhar.</div>
      )}
      {ordenados.length > 0 && (
        <ul className="lista">
          {ordenados.map((l) => (
            <Cartao key={l.id} lead={l} crm={crm} avisar={(m) => setMsg(m || null)} />
          ))}
        </ul>
      )}
    </section>
  );
}
