// Lista "Clientes" do painel lateral: contatos com fase, etiquetas, última interação e próximo
// lembrete; busca e ordenação por "mais tempo sem contato". Lógica pura.

import { acharNoIndice, criarIndice } from './crm-contatos';
import { instanteNoFuso } from './crm-lembretes';
import { ehContatoCliente, idadeDaUltima } from './crm-regras';
import { normalizarTexto } from './nomes';
import type { Contato, Conversa, DadosCrm, Etiqueta, Fase, Lembrete } from './crm-tipos';

export type OrdemClientes = 'semContato' | 'recentes' | 'nome' | 'proximoLembrete';

export const ORDENS: ReadonlyArray<{ id: OrdemClientes; rotulo: string }> = [
  { id: 'semContato', rotulo: 'Mais tempo sem contato' },
  { id: 'recentes', rotulo: 'Contato mais recente' },
  { id: 'proximoLembrete', rotulo: 'Próximo lembrete' },
  { id: 'nome', rotulo: 'Nome (A–Z)' },
];

export interface LinhaCliente {
  /** Id do contato; para quem só foi visto na lista (sem anotações), a chave da conversa. */
  id: string;
  /** Há registro do contato (com id interno)? */
  temContato: boolean;
  nome: string;
  telefone?: string;
  fase?: Fase;
  etiquetas: Etiqueta[];
  notas: number;
  /** Instante estimado da última mensagem (qualquer lado) lida da lista; null se nunca vimos. */
  ultimaInteracaoEm: number | null;
  /** "há 3 dias", ou "" se nunca vimos a conversa. */
  ultimaInteracaoTexto: string;
  dias: number | null;
  /** O cliente falou por último e ainda não foi respondido / dispensado. */
  precisaResposta: boolean;
  proximoLembrete: Lembrete | null;
  grupo: boolean;
}

export interface OpcoesClientes {
  busca?: string;
  /** Só contatos com "cliente" no nome (a aba Clientes liga; pedido do dono em 22/10/2026). */
  apenasClientes?: boolean;
  ordem?: OrdemClientes;
  fase?: Fase | null;
  etiquetaId?: string | null;
  /** Só contatos com alguma anotação do usuário (fase, etiqueta, nota ou lembrete). */
  soComDados?: boolean;
  /** Mostra grupos (padrão: não). */
  incluirGrupos?: boolean;
}

/** Instante estimado da última mensagem: data (e hora, se o rótulo era uma hora) lidas da linha. */
export function instanteDaUltima(c: Pick<Conversa, 'dataMsg' | 'hora' | 'desdeEm'>): number {
  if (c.dataMsg) {
    const [h, m] = (c.hora ?? '12:00').split(':').map(Number);
    return instanteNoFuso(c.dataMsg, h, m);
  }
  return c.desdeEm;
}

function proximoLembreteDe(lembretes: Lembrete[], contatoId: string | undefined): Lembrete | null {
  let melhor: Lembrete | null = null;
  if (!contatoId) return null;
  for (const l of lembretes) {
    if (l.contatoId !== contatoId || l.status === 'concluido') continue;
    if (!melhor || l.venceEm < melhor.venceEm) melhor = l;
  }
  return melhor;
}

export function temDadosDoUsuario(c: Contato | undefined, lembretes: Lembrete[]): boolean {
  if (!c) return false;
  return c.fase != null || c.etiquetas.length > 0 || c.notas.length > 0 || lembretes.some((l) => l.contatoId === c.id && l.status !== 'concluido');
}

/** Todos os contatos conhecidos (com dados do usuário e/ou vistos na lista), já filtrados e ordenados. */
export function montarClientes(dados: DadosCrm, agora: Date, op: OpcoesClientes = {}): LinhaCliente[] {
  const ind = criarIndice(dados);
  // Une cada conversa lida da lista ao contato dela (por telefone ou nome); a mais recente vence.
  const conversaDoContato = new Map<string, Conversa>();
  const soConversas: Conversa[] = [];
  for (const conv of Object.values(dados.conversas)) {
    const c = acharNoIndice(ind, { nome: conv.nome, telefone: conv.telefone });
    if (!c) {
      soConversas.push(conv);
      continue;
    }
    const atual = conversaDoContato.get(c.id);
    if (!atual || conv.vistaEm > atual.vistaEm) conversaDoContato.set(c.id, conv);
  }
  const etiquetasPorId = new Map(dados.etiquetas.map((e) => [e.id, e]));
  const q = normalizarTexto(op.busca ?? '');
  const linhas: LinhaCliente[] = [];
  const candidatos: Array<{ contato?: Contato; conversa?: Conversa }> = [
    ...Object.values(dados.contatos).map((contato) => ({ contato, conversa: conversaDoContato.get(contato.id) })),
    ...soConversas.map((conversa) => ({ conversa })),
  ];

  for (const { contato, conversa } of candidatos) {
    if (conversa?.grupo && !op.incluirGrupos) continue;
    // Só contatos de cliente ("cliente" no nome), como a faixa do lead: contato pessoal não entra.
    if (op.apenasClientes && !ehContatoCliente(contato?.nome ?? conversa?.nome)) continue;
    if (op.soComDados && !temDadosDoUsuario(contato, dados.lembretes)) continue;
    const etiquetas = (contato?.etiquetas ?? []).map((id) => etiquetasPorId.get(id)).filter((e): e is Etiqueta => e != null);
    if (op.fase && contato?.fase !== op.fase) continue;
    if (op.etiquetaId && !contato?.etiquetas.includes(op.etiquetaId)) continue;

    const idade = conversa ? idadeDaUltima(conversa, agora) : null;
    const linha: LinhaCliente = {
      id: contato?.id ?? conversa?.chave ?? '',
      temContato: contato != null,
      nome: contato?.nome ?? conversa?.nome ?? '',
      telefone: contato?.telefone ?? conversa?.telefone,
      fase: contato?.fase,
      etiquetas,
      notas: contato?.notas.length ?? 0,
      ultimaInteracaoEm: conversa ? instanteDaUltima(conversa) : (contato?.ultimoContatoEm ?? null),
      ultimaInteracaoTexto: idade?.texto ?? '',
      dias: idade?.dias ?? null,
      precisaResposta: conversa != null && !conversa.grupo && !conversa.arquivada && conversa.ultimaDeMim === false && !(contato?.dispensadaAss != null && contato.dispensadaAss === conversa.ass),
      proximoLembrete: proximoLembreteDe(dados.lembretes, contato?.id),
      grupo: conversa?.grupo === true,
    };

    if (q !== '') {
      const alvo = normalizarTexto([linha.nome, linha.telefone ?? '', linha.etiquetas.map((e) => e.nome).join(' '), linha.fase ?? '', contato?.notas.map((n) => n.texto).join(' ') ?? ''].join(' '));
      if (!alvo.includes(q)) continue;
    }
    linhas.push(linha);
  }

  const ordem = op.ordem ?? 'semContato';
  const porNome = (a: LinhaCliente, b: LinhaCliente): number => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  linhas.sort((a, b) => {
    switch (ordem) {
      case 'nome':
        return porNome(a, b);
      case 'proximoLembrete': {
        const x = a.proximoLembrete?.venceEm ?? Infinity;
        const y = b.proximoLembrete?.venceEm ?? Infinity;
        return x === y ? porNome(a, b) : x < y ? -1 : 1;
      }
      case 'recentes': {
        const x = a.ultimaInteracaoEm ?? -Infinity;
        const y = b.ultimaInteracaoEm ?? -Infinity;
        return x === y ? porNome(a, b) : y - x > 0 ? 1 : -1;
      }
      case 'semContato': {
        // Mais antigo primeiro; quem nunca vimos (sem conversa lida) vai para o fim.
        const x = a.ultimaInteracaoEm ?? Infinity;
        const y = b.ultimaInteracaoEm ?? Infinity;
        return x === y ? porNome(a, b) : x < y ? -1 : 1;
      }
    }
  });
  return linhas;
}
