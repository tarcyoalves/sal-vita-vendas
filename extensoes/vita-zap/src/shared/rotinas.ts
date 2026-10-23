// Rotinas de campanha (playbooks de vendas com 1 clique).
// Tipos e rotinas padrão prontas (reativação 30d+, cobrança de orçamento sem resposta, pós-venda).
// Quem persiste as preferências de rotinas customizadas é src/sidepanel/preferencias.ts.

import type { Fase } from './crm-tipos';
import { novoId } from './id';

export interface Rotina {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  padrao?: boolean;
  // Critérios de filtro
  diasSemContato?: number;
  fases?: Fase[];
  tags?: string[];
  aguardandoResposta?: boolean;
  // Textos
  textoBase: string;
  variacoes: string[];
}

export const ROTINAS_PADRAO: Rotina[] = [
  {
    id: 'reativacao-30d',
    nome: 'Reativação 30d+',
    descricao: 'Clientes sem conversa há mais de 30 dias',
    icone: '🔄',
    padrao: true,
    diasSemContato: 30,
    textoBase: 'Boa tarde, {primeiro_nome}, tudo bem? Como estão de sal por aí para este mês?',
    variacoes: [
      'Olá, {primeiro_nome}, tudo bem por aí? Como está o estoque de sal de vocês?',
      'Boa tarde, {primeiro_nome}! Passando para saber como vocês estão e se vão precisar repor sal esses dias.',
    ],
  },
  {
    id: 'cobrar-orcamento',
    nome: 'Cobrar Orçamento',
    descricao: 'Cotação enviada sem resposta há 2+ dias',
    icone: '⏳',
    padrao: true,
    fases: ['orcamento'],
    aguardandoResposta: true,
    diasSemContato: 2,
    textoBase: 'Oi, {primeiro_nome}, tudo bem? Conseguiu dar uma olhada na cotação que te passei? Ficou alguma dúvida ou quer que ajuste algo?',
    variacoes: [
      'Olá, {primeiro_nome}, boa tarde! Vi que te passei os valores outro dia. Teve chance de avaliar? Qualquer dúvida estou por aqui!',
      'Oi, {primeiro_nome}, tudo certo? Passando para saber se você conseguiu ver o orçamento que te enviei. Posso te ajudar em algo?',
    ],
  },
  {
    id: 'pos-venda-15d',
    nome: 'Pós-Venda 15d',
    descricao: 'Clientes com pedido fechado há 15+ dias',
    icone: '📦',
    padrao: true,
    fases: ['fechado'],
    diasSemContato: 15,
    textoBase: 'Oi, {primeiro_nome}, tudo bem? Passando para saber se o pedido de sal chegou certinho e se está tudo bem por aí!',
    variacoes: [
      'Olá, {primeiro_nome}, boa tarde! Deu tudo certo com a entrega do sal? Qualquer coisa que precisar estamos à disposição!',
    ],
  },
];

export function mesclarComPadrao(salvas: Rotina[]): Rotina[] {
  if (!Array.isArray(salvas) || salvas.length === 0) return [...ROTINAS_PADRAO];
  const idsCustom = new Set(salvas.map((r) => r.id));
  const padroesFaltando = ROTINAS_PADRAO.filter((p) => !idsCustom.has(p.id));
  return [...salvas, ...padroesFaltando];
}

export function novaRotina(dados: Omit<Rotina, 'id' | 'padrao'>): Rotina {
  return {
    ...dados,
    id: `rotina-${novoId()}`,
    padrao: false,
  };
}
