// As abas do painel e como a barra as reparte em linhas (v0.7.60): a barra tem que caber em 400 px sem cortar texto.
import type { AbaDoPainel } from '../shared/hoje';

export type Aba = AbaDoPainel;

export const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'lembretes', rotulo: 'Lembretes' },
  { id: 'acompanhar', rotulo: 'Acompanhar' },
  { id: 'clientes', rotulo: 'Clientes' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'varredura', rotulo: '1. Varredura' },
  { id: 'previa', rotulo: '2. Prévia' },
  { id: 'execucao', rotulo: '3. Envio' },
  { id: 'followup', rotulo: 'Follow-up' },
  { id: 'reativacao', rotulo: 'Reativação' },
  { id: 'automaticos', rotulo: 'Automáticos' },
  { id: 'pedir', rotulo: 'Pedir à IA' },
  { id: 'dados', rotulo: 'Dados' },
];

/** Linha 1: o CRM. Linhas 2 e 3: campanhas e IA (5 + 4 abas), cada uma com o texto inteiro a 400 px. */
export const LINHAS_DE_ABAS: ReadonlyArray<{ classe: string; ids: readonly Aba[] }> = [
  { classe: 'abas-linha abas-linha-crm', ids: ['lembretes', 'acompanhar', 'clientes'] },
  { classe: 'abas-linha abas-linha-campanha', ids: ['hoje', 'varredura', 'previa', 'execucao', 'followup'] },
  { classe: 'abas-linha abas-linha-campanha', ids: ['reativacao', 'automaticos', 'pedir', 'dados'] },
];

/** A aba em que o painel abre. */
export const ABA_INICIAL: Aba = 'hoje';
