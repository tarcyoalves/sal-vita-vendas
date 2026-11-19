// Tela "Hoje" (v0.7.60): um resumo SÓ DE LEITURA do que importa agora, com atalhos para a aba certa. Regras PURAS: recebe o que
// já está gravado localmente (e o estado do painel) e devolve cartões e alertas. Nada aqui lê o WhatsApp, fala com o CRM ou grava.

import type { AcaoIa, Julgamento, Liberacao, ModoAutomatico } from './automaticos';
import { ROTULO_MODO } from './automaticos';
import type { Campanha } from './campanha';
import type { ContatoVarrido } from './contatos';
import { ultimoEnvioPorChave } from './filtros';
import type { Followup } from './followup';
import { textoDaPrevisao, type PrevisaoDaFila } from './fila';
import { historicoSumindo, textoDoAviso } from './historico-sumindo';
import type { ConfigReativacao, Reativacao } from './reativacao';
import { pendentesDeSincronia } from './equipe';
import type { Envio, NaoEnviar } from './exportar';

/** Abas do painel que a tela Hoje sabe abrir. */
export type AbaDoPainel = 'lembretes' | 'acompanhar' | 'clientes' | 'hoje' | 'varredura' | 'previa' | 'execucao' | 'followup' | 'reativacao' | 'automaticos' | 'pedir' | 'dados';

export interface EntradaHoje {
  agora: Date;
  modo: ModoAutomatico;
  previsao: PrevisaoDaFila;
  followups: ReadonlyArray<Followup>;
  reativacoes: ReadonlyArray<Reativacao>;
  campanhas: ReadonlyArray<Campanha>;
  acoes: ReadonlyArray<AcaoIa>;
  /** Decisões da IA em Observação ainda sem julgamento. */
  pendentes: ReadonlyArray<Julgamento>;
  liberacao: Liberacao;
  contatos: ReadonlyArray<ContatoVarrido>;
  naoEnviar: ReadonlyArray<NaoEnviar>;
  envios: ReadonlyArray<Envio>;
  configReativacao: ConfigReativacao;
  followupPausado: boolean;
  reativacaoPausada: boolean;
  /** Último contato da equipe por chave (ISO): quem a equipe contatou há pouco não entra na reativação, então também não está "sumindo". */
  contatadoPelaEquipe?: ReadonlyMap<string, string>;
  /** O painel está logado no CRM? */
  logadoNoCrm: boolean;
  /** Por que a equipe/CRM não respondeu na última tentativa (null = tudo certo). */
  crmIndisponivel: string | null;
  /** A IA não respondeu na última rodada (null = tudo certo). */
  falhaDaIa: { motivo: string; em: number } | null;
}

export interface CartaoHoje {
  id: 'sai' | 'precisa' | 'agendou' | 'julgar' | 'sumindo';
  titulo: string;
  numero: number;
  /** Uma linha curta com o contexto. */
  detalhe: string;
  /** A aba para onde o cartão leva. */
  destino: AbaDoPainel;
  /** Atalhos extras (ex.: "Precisa de você" tem Follow-up e Reativação). */
  extras?: Array<{ rotulo: string; destino: AbaDoPainel }>;
}

export interface AlertaHoje {
  id: string;
  tipo: 'crm' | 'ia' | 'freio' | 'pausa';
  texto: string;
  destino: AbaDoPainel;
}

export interface ResumoHoje {
  cartoes: CartaoHoje[];
  alertas: AlertaHoje[];
  /** "Precisa de você" aberto em partes (sem repetir contato). */
  precisa: { total: number; followup: number; reativacao: number; revisar: number };
}

/** Pausas esperadas (horário, teto, modo, painel fechado, "por você"): não são erro. */
const PAUSA_ESPERADA = /^(domingo|fora do horário|teto diário|automático em|painel fechado|pausada por você|pausado por você|follow-up pausado|reativação pausada|follow-up trocou)/i;

function precisaDeVoce(followups: ReadonlyArray<Followup>, reativacoes: ReadonlyArray<Reativacao>): ResumoHoje['precisa'] {
  // Cada contato conta UMA vez (a reativação também cria item no follow-up): revisar > reativação > follow-up.
  const porChave = new Map<string, 'revisar' | 'reativacao' | 'followup'>();
  for (const f of followups) {
    if (f.estado === 'revisar') porChave.set(f.chave, 'revisar');
  }
  for (const r of reativacoes) {
    if (r.estado === 'precisa' && !porChave.has(r.chave)) porChave.set(r.chave, 'reativacao');
  }
  for (const f of followups) {
    if (f.estado === 'precisa' && !porChave.has(f.chave)) porChave.set(f.chave, f.origem === 'reativacao' ? 'reativacao' : 'followup');
  }
  const n = { followup: 0, reativacao: 0, revisar: 0 };
  for (const v of porChave.values()) n[v] += 1;
  return { total: porChave.size, ...n };
}

/** Agendamentos da IA que ainda vão acontecer (e não foram desfeitos), sem repetir contato. */
function agendadosPelaIa(acoes: ReadonlyArray<AcaoIa>, reativacoes: ReadonlyArray<Reativacao>, agora: Date): { n: number; proximo: number | null } {
  const porChave = new Map<string, number>();
  for (const a of acoes) {
    if (a.tipo !== 'agendou' || a.desfeitaEm || a.desfazer?.tipo !== 'agendamento') continue;
    if (a.desfazer.agendadoEm >= agora.getTime()) porChave.set(a.chave, Math.min(porChave.get(a.chave) ?? Infinity, a.desfazer.agendadoEm));
  }
  for (const r of reativacoes) {
    if (r.estado !== 'agendado' || !r.agendadoPara) continue;
    const ms = new Date(r.agendadoPara).getTime();
    if (Number.isFinite(ms) && ms >= agora.getTime()) porChave.set(r.chave, Math.min(porChave.get(r.chave) ?? Infinity, ms));
  }
  const datas = [...porChave.values()];
  return { n: porChave.size, proximo: datas.length > 0 ? Math.min(...datas) : null };
}

const dd = (ms: number): string => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' });
const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });

export function resumirHoje(e: EntradaHoje): ResumoHoje {
  const precisa = precisaDeVoce(e.followups, e.reativacoes);
  const agendadas = agendadosPelaIa(e.acoes, e.reativacoes, e.agora);
  const sumindo = historicoSumindo(e.contatos, e.configReativacao, e.reativacoes, {
    agora: e.agora,
    naoEnviar: new Set(e.naoEnviar.map((n) => n.chave)),
    ultimoEnvioPorChave: ultimoEnvioPorChave(e.envios),
    ...(e.contatadoPelaEquipe ? { contatadoPelaEquipePorChave: e.contatadoPelaEquipe } : {}),
  });
  const julgados = e.liberacao.julgados;

  const cartoes: CartaoHoje[] = [
    {
      id: 'sai',
      titulo: 'Sai hoje sozinho',
      numero: e.previsao.saemHoje,
      detalhe: `${textoDaPrevisao(e.previsao)} Modo: ${ROTULO_MODO[e.modo]}${e.modo === 'ligado' ? '' : ' (nada sai sozinho)'}.`,
      destino: 'automaticos',
    },
    {
      id: 'precisa',
      titulo: 'Precisa de você',
      numero: precisa.total,
      detalhe: precisa.total === 0 ? 'Nada esperando por você.' : `Follow-up ${precisa.followup} · Reativação ${precisa.reativacao} · Revisar ${precisa.revisar}`,
      destino: precisa.followup + precisa.revisar >= precisa.reativacao ? 'followup' : 'reativacao',
      extras: [
        { rotulo: `Follow-up (${precisa.followup + precisa.revisar})`, destino: 'followup' },
        { rotulo: `Reativação (${precisa.reativacao})`, destino: 'reativacao' },
      ],
    },
    {
      id: 'agendou',
      titulo: 'A IA agendou',
      numero: agendadas.n,
      detalhe: agendadas.n === 0 ? 'Nenhum agendamento da IA pela frente.' : `Próximo: ${agendadas.proximo != null ? dd(agendadas.proximo) : '—'}. No CRM, quem tem agendamento fica de fora das mensagens.`,
      destino: 'reativacao',
    },
    {
      id: 'julgar',
      titulo: 'Para julgar',
      numero: e.pendentes.length,
      detalhe: `${e.pendentes.length === 0 ? 'Nada em observação para julgar.' : 'Decisões da IA em observação.'} Placar: ${julgados === 0 ? 'sem julgamentos' : `${e.liberacao.acertos} de ${julgados} (${e.liberacao.percentual}%)`}.`,
      destino: 'automaticos',
    },
    {
      id: 'sumindo',
      titulo: 'Histórico sumindo',
      numero: sumindo.total,
      detalhe: textoDoAviso(sumindo) ?? 'Nenhuma conversa em risco de sumir do WhatsApp Web.',
      destino: 'reativacao',
    },
  ];

  const alertas: AlertaHoje[] = [];
  if (!e.logadoNoCrm) alertas.push({ id: 'crm-login', tipo: 'crm', texto: 'Sem login no CRM: o envio automático não roda e a trava de agendamento não confere. Entre na aba Dados.', destino: 'dados' });
  else if (e.crmIndisponivel) alertas.push({ id: 'crm', tipo: 'crm', texto: `CRM indisponível (${e.crmIndisponivel}). O "não enviar mais" deste computador vale, mas o envio automático pausa e a campanha manual só avisa.`, destino: 'dados' });
  const semConfirmar = pendentesDeSincronia(e.naoEnviar);
  if (semConfirmar > 0) alertas.push({ id: 'optout-pendente', tipo: 'crm', texto: `${semConfirmar} contato(s) em "Não enviar mais" estão bloqueados só neste computador (sincronização pendente: o CRM ainda não confirmou). Abra Dados e use "Tentar sincronizar".`, destino: 'dados' });
  if (e.falhaDaIa) alertas.push({ id: 'ia', tipo: 'ia', texto: `IA indisponível desde ${hhmm(e.falhaDaIa.em)} (${e.falhaDaIa.motivo}). Nada é decidido nem cobrado sem ela; a próxima rodada tenta de novo.`, destino: 'automaticos' });
  if (e.followupPausado) alertas.push({ id: 'pausa-followup', tipo: 'pausa', texto: 'Cobrança do follow-up pausada por você: nada é cobrado sozinho até retomar.', destino: 'followup' });
  if (e.reativacaoPausada) alertas.push({ id: 'pausa-reativacao', tipo: 'pausa', texto: 'Reativação pausada por você: nada é enviado até retomar.', destino: 'reativacao' });
  for (const c of e.campanhas) {
    if (c.status !== 'pausada' || !c.motivoPausa || PAUSA_ESPERADA.test(c.motivoPausa)) continue;
    const destino: AbaDoPainel = c.tipo === 'followup' ? 'followup' : c.tipo === 'reativacao' ? 'reativacao' : 'execucao';
    const freio = /problemas seguidos|freio/i.test(c.motivoPausa);
    // CRM indisponível já aparece acima como alerta do CRM; aqui só lembra que a campanha parou.
    alertas.push({ id: `campanha:${c.id}`, tipo: freio ? 'freio' : /^CRM indisponível/i.test(c.motivoPausa) ? 'crm' : 'pausa', texto: `${freio ? 'Freio acionado' : 'Campanha parada'} — "${c.nome}": ${c.motivoPausa}`, destino });
  }
  return { cartoes, alertas, precisa };
}
