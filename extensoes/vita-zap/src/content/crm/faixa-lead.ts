// Faixa do lead do CRM Lembretes, logo abaixo do cabeçalho da conversa aberta: status, etiquetas, próximo
// lembrete e últimas notas, mais as ações (Registrar contato, Reagendar, Etiquetas, Convertido) e, quando a
// conversa ainda não tem lead, "Vincular a um lead" / "Criar lead".
// Só aparece com login no CRM; sem login (modo local) não há faixa. Shadow DOM, como o resto da UI.
// Nada aqui envia mensagem de WhatsApp.

import { formatarVencimento } from '../../shared/crm-lembretes';
import { ETIQUETA_ACOMPANHAR, type LeadCrm } from '../../shared/crm-remoto';
import type { EstadoLead } from '../../shared/leads';
import { criarHost, h, isolarCliques, sincronizarTema } from './ui';

export interface AcoesFaixa {
  registrarContato: (ancora: HTMLElement) => void;
  reagendar: (ancora: HTMLElement) => void;
  etiquetas: (ancora: HTMLElement) => void;
  converter: (ancora: HTMLElement) => void;
  /** Põe/tira a etiqueta "Acompanhar" (um clique, sem painel). */
  acompanhar: (ancora: HTMLElement) => void;
  vincular: (ancora: HTMLElement) => void;
  criar: (ancora: HTMLElement) => void;
  escolher: (ancora: HTMLElement) => void;
}

const STATUS: Record<string, string> = { pending: 'Pendente', completed: 'Concluído', cancelled: 'Cancelado' };

function dataCurta(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' });
}

/** Última linha não vazia das notas (as de "Registrar contato" vão sempre para o fim). */
export function ultimaNota(notas: string, max = 140): string {
  const linhas = notas.split('\n').map((l) => l.trim()).filter(Boolean);
  const l = linhas[linhas.length - 1] ?? '';
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}

export class FaixaLead {
  readonly h = criarHost('vita-zap-lead');
  private chaveRender = '';

  constructor() {
    // position/z-index: no WhatsApp de 10/2026 o painel das mensagens é posicionado por cima do que
    // vem depois do header; sem isto a faixa fica por baixo (apagada e sem receber cliques).
    Object.assign(this.h.host.style, { display: 'block', flex: '0 0 auto', position: 'relative', zIndex: '5' });
    isolarCliques(this.h.host);
  }

  remover(): void {
    this.h.host.remove();
    this.chaveRender = '';
  }

  /** `estado` null (ou sem-login sem erro) = sem faixa. `header` null = nenhuma conversa aberta. */
  atualizar(header: HTMLElement | null, estado: EstadoLead | null, agora: Date, acoes: AcoesFaixa): void {
    if (!header || !estado || (estado.tipo === 'sem-login' && !estado.erro)) {
      this.remover();
      return;
    }
    if (this.h.host.previousElementSibling !== header || this.h.host.parentElement !== header.parentElement) {
      header.insertAdjacentElement('afterend', this.h.host);
      this.chaveRender = '';
    }
    sincronizarTema(this.h.host);
    // Os tempos relativos ("amanhã 09:00") dependem do dia: entram na chave de redesenho.
    const chave = JSON.stringify([estado, estado.tipo === 'lead' && estado.lead.lembreteEm ? formatarVencimento(estado.lead.lembreteEm, agora) : '']);
    if (chave === this.chaveRender) return;
    this.chaveRender = chave;
    this.h.conteudo.replaceChildren(this.montar(estado, agora, acoes));
  }

  private botao(rotulo: string, aoClicar: (a: HTMLElement) => void, classe = 'btn'): HTMLButtonElement {
    return h('button', { class: classe, type: 'button', onclick: (e) => aoClicar(e.currentTarget as HTMLElement) }, rotulo);
  }

  private montar(estado: EstadoLead, agora: Date, a: AcoesFaixa): HTMLElement {
    const faixa = h('div', { class: 'faixa' });
    if (estado.tipo === 'sem-login' || estado.tipo === 'erro') {
      const erro = estado.erro;
      faixa.append(h('span', { class: 'vencido' }, `CRM: ${erro?.mensagem ?? 'sem conexão'}`));
      if (erro?.tipo === 'nao-autenticado' || erro?.tipo === 'ip') faixa.append(h('span', { class: 'dica' }, 'Abra o painel do Vita Zap, aba Dados, e entre de novo.'));
      return faixa;
    }
    if (estado.tipo === 'nao-encontrado') {
      faixa.append(
        h('span', { class: 'dica' }, estado.semTelefone ? 'Sem lead no CRM (não achei o telefone desta conversa).' : 'Sem lead no CRM com este telefone.'),
        this.botao('Vincular a um lead', a.vincular),
        this.botao('Criar lead', a.criar, 'btn pri'),
      );
      return faixa;
    }
    if (estado.tipo === 'varios') {
      faixa.append(h('span', { class: 'dica' }, `${estado.candidatos.length} leads com este telefone.`), this.botao('Escolher o lead', a.escolher, 'btn pri'));
      return faixa;
    }
    return this.montarLead(faixa, estado.lead, estado, agora, a);
  }

  private montarLead(faixa: HTMLElement, lead: LeadCrm, estado: Extract<EstadoLead, { tipo: 'lead' }>, agora: Date, a: AcoesFaixa): HTMLElement {
    const acompanhando = lead.etiquetas.includes(ETIQUETA_ACOMPANHAR);
    const etiquetas = lead.etiquetas.filter((t) => t !== ETIQUETA_ACOMPANHAR); // o selo "Em acompanhamento" já a representa
    const linha1 = h('div', { class: 'faixa-linha' });
    linha1.append(
      h('strong', { class: 'faixa-titulo', title: lead.titulo }, `Lead: ${lead.titulo}`),
      h('span', { class: lead.convertidoEm ? 'tag ok' : 'tag neutra' }, lead.convertidoEm ? `Convertido ${dataCurta(lead.convertidoEm)}` : (STATUS[lead.status] ?? lead.status)),
      ...(acompanhando ? [h('span', { class: 'tag acomp', title: 'Etiqueta "Acompanhar": este cliente está na aba Acompanhar até o fechamento' }, 'Em acompanhamento')] : []),
      ...etiquetas.slice(0, 6).map((t) => h('span', { class: 'tag neutra' }, t)),
      ...(etiquetas.length > 6 ? [h('span', { class: 'dica' }, `+${etiquetas.length - 6}`)] : []),
    );
    const linha2 = h('div', { class: 'faixa-linha' });
    if (lead.lembreteEm && lead.lembreteAtivo) {
      linha2.append(h('span', { class: lead.lembreteEm <= agora.getTime() ? 'vencido' : 'dica' }, `Próximo lembrete: ${formatarVencimento(lead.lembreteEm, agora)}`));
    } else {
      linha2.append(h('span', { class: 'dica' }, 'Sem lembrete'));
    }
    if (lead.ultimoContatoEm) linha2.append(h('span', { class: 'dica' }, `Último contato: ${dataCurta(lead.ultimoContatoEm)} (${lead.contatos}x)`));
    const nota = ultimaNota(lead.notas);
    const linha3 = nota ? h('div', { class: 'faixa-nota', title: lead.notas }, `Notas: ${nota}`) : null;
    const avisos = h('div', { class: 'faixa-linha' });
    if (estado.pendentes > 0) avisos.append(h('span', { class: 'aviso-mini' }, `${estado.pendentes} ação(ões) guardada(s), enviando quando a conexão voltar`));
    if (estado.desatualizado) avisos.append(h('span', { class: 'aviso-mini' }, estado.aviso ? `Dados salvos, não atualizados: ${estado.aviso.mensagem}` : 'Dados salvos, não atualizados.'));
    const acoes = h('div', { class: 'faixa-linha' }, this.botao('Registrar contato', a.registrarContato, 'btn pri'), this.botao('Reagendar lembrete', a.reagendar), this.botao('Etiquetas', a.etiquetas), lead.convertidoEm && !acompanhando ? null : this.botao(acompanhando ? 'Parar de acompanhar' : 'Acompanhar', a.acompanhar, acompanhando ? 'btn' : 'btn acomp'), lead.convertidoEm ? null : this.botao('Marcar convertido', a.converter));
    faixa.append(linha1, linha2, ...(linha3 ? [linha3] : []), ...(avisos.childElementCount > 0 ? [avisos] : []), acoes);
    return faixa;
  }
}
