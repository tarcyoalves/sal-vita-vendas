// Anotações do modo Observação e do "O que a IA fez" (v0.7.59), compartilhadas pelos dois motores (follow-up e reativação).
// Só grava no IndexedDB local; nunca fala com o WhatsApp nem com o CRM.

import { type OrigemAutomatico, novaDecisao } from '../shared/automaticos';
import { type Banco, registrarDecisao } from '../shared/banco';
import { type ClassificacaoIa, type EstadoFollowup, ROTULO_CLASSE } from '../shared/followup';

/** Observação: a decisão da IA sobre uma RESPOSTA do cliente vira um item "o que a IA faria" para o dono julgar. */
export async function anotarDecisaoDaResposta(
  db: Banco,
  d: { origem: OrigemAutomatico; chave: string; nome: string; contexto: string; estadoDepois: EstadoFollowup; motivoDepois: string | null; optOut: boolean; c: ClassificacaoIa },
  agora: Date,
): Promise<void> {
  const base = { origem: d.origem, chave: d.chave, nome: d.nome, contexto: d.contexto };
  if (d.optOut) await registrarDecisao(db, novaDecisao({ ...base, tipo: 'sair', resumo: `Marcaria "não enviar mais": pediu para sair. ${d.c.resumo}` }, agora));
  else if (d.estadoDepois === 'precisa') await registrarDecisao(db, novaDecisao({ ...base, tipo: 'precisa', resumo: `Chamaria você: ${ROTULO_CLASSE[d.c.classe]}. ${d.c.resumo}`, texto: d.c.sugestao || null }, agora));
  else if (d.estadoDepois === 'resolvido') await registrarDecisao(db, novaDecisao({ ...base, tipo: 'resolver', resumo: `Daria por resolvido: ${d.motivoDepois ?? d.c.resumo}` }, agora));
}
