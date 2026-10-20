// Campanha: itens, aprovação e transições de estado (funções puras; o painel grava no IndexedDB).

import type { Filtros } from './filtros';
import { registrarProblema } from './politica';
import { montarMensagem, sortearModelo, usaPrimeiroNome, validarModelo } from './texto';
import { primeiroNome as extrairPrimeiroNome } from './nomes';

export type StatusItem = 'pendente' | 'enviado' | 'pulado' | 'nao_cliente' | 'problema' | 'nao_enviar' | 'removido';
export type StatusCampanha = 'rascunho' | 'em_execucao' | 'pausada' | 'concluida';

export interface ItemCampanha {
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Modelo sorteado (com {primeiroNome}); o texto final é montado na hora de colar. */
  modelo: string;
  status: StatusItem;
  motivo: string | null;
  /** Código do erro (CodigoErro, ou 'manual') quando o item virou problema/pulado por erro. */
  codigo?: string | null;
  atualizadoEm: string | null;
  /** 0.3.3: texto final deste contato, editado pelo usuário (null/ausente = texto do modelo). */
  textoPersonalizado?: string | null;
  /** 0.3.3: de onde veio o contato (ex.: 'contém CLIENTE; última conversa 10/10/2026'), para a fila. */
  origem?: string | null;
}

export interface Campanha {
  id: string;
  nome: string;
  criadaEm: string;
  aprovadaEm: string | null;
  termoBusca: string;
  filtros: Filtros;
  modelos: string[];
  status: StatusCampanha;
  motivoPausa: string | null;
  itens: ItemCampanha[];
  problemasSeguidos: number;
  ultimoEnvioEm: string | null;
  intervaloAtualSeg: number | null;
}

export function novoId(agora: Date, aleatorio: () => number = Math.random): string {
  return `c${agora.getTime().toString(36)}${Math.floor(aleatorio() * 1e6).toString(36)}`;
}

export function criarItens(
  selecionados: ReadonlyArray<{ chave: string; nome: string }>,
  modelos: string[],
  termosIgnorar: string[],
  aleatorio: () => number = Math.random,
): ItemCampanha[] {
  const vistos = new Set<string>();
  const itens: ItemCampanha[] = [];
  for (const s of selecionados) {
    if (vistos.has(s.chave)) continue; // uma mensagem por contato por campanha
    vistos.add(s.chave);
    itens.push({
      chave: s.chave,
      nome: s.nome,
      primeiroNome: extrairPrimeiroNome(s.nome, termosIgnorar),
      modelo: sortearModelo(modelos, aleatorio),
      status: 'pendente',
      motivo: null,
      atualizadoEm: null,
    });
  }
  return itens;
}

export function temTextoPersonalizado(item: ItemCampanha): boolean {
  return item.textoPersonalizado != null && item.textoPersonalizado.trim() !== '';
}

/** Texto que será colado: o texto editado deste contato, se houver; senão o modelo sorteado. */
export function textoDoItem(item: ItemCampanha): string {
  return montarMensagem(temTextoPersonalizado(item) ? (item.textoPersonalizado as string) : item.modelo, item.primeiroNome);
}

export interface EdicaoItem {
  primeiroNome: string;
  texto: string;
}

export type ResultadoEdicao = { ok: true; item: ItemCampanha } | { ok: false; erros: string[] };

/**
 * Valida e aplica a edição de um contato pendente: primeiro nome não vazio e texto com as mesmas
 * regras do texto da campanha (sem link, sem quebra de linha, tamanho máximo). Texto igual ao do
 * modelo vira "sem override" (null).
 */
export function aplicarEdicao(item: ItemCampanha, e: EdicaoItem): ResultadoEdicao {
  const primeiroNome = e.primeiroNome.trim();
  const erros: string[] = [];
  if (primeiroNome === '') erros.push('o primeiro nome não pode ficar vazio');
  const texto = montarMensagem(e.texto, primeiroNome);
  for (const m of validarModelo(texto)) erros.push(m);
  if (erros.length > 0) return { ok: false, erros: [...new Set(erros)] };
  const doModelo = montarMensagem(item.modelo, primeiroNome);
  return { ok: true, item: { ...item, primeiroNome, textoPersonalizado: texto === doModelo ? null : texto } };
}

/**
 * Contatos que ainda podem ser editados/removidos/reordenados: pendentes que não estão travados
 * (o item em andamento, `travados`, nunca muda).
 */
export function editaveis(c: Pick<Campanha, 'itens'>, travados: ReadonlySet<string>): ItemCampanha[] {
  return c.itens.filter((i) => i.status === 'pendente' && !travados.has(i.chave));
}

/** Remove da fila (status 'removido'): não conta como problema, nem envio, nem teto. */
export function removerDaFila(c: Campanha, chave: string, agora: Date): Campanha {
  const item = c.itens.find((i) => i.chave === chave);
  if (!item || item.status !== 'pendente') return c;
  return { ...c, itens: c.itens.map((i) => (i.chave === chave ? { ...i, status: 'removido' as const, motivo: 'removido por você', codigo: null, atualizadoEm: agora.toISOString() } : i)) };
}

/** Desfaz a remoção (só enquanto o item não foi executado: ainda está 'removido'). */
export function desfazerRemocao(c: Campanha, chave: string): Campanha {
  const item = c.itens.find((i) => i.chave === chave);
  if (!item || item.status !== 'removido') return c;
  return { ...c, itens: c.itens.map((i) => (i.chave === chave ? { ...i, status: 'pendente' as const, motivo: null, codigo: null, atualizadoEm: null } : i)) };
}

/**
 * Reordena SÓ os pendentes editáveis: os demais itens (concluídos e o travado) ficam onde estão.
 * `para`: 'cima' | 'baixo' (uma posição) ou 'topo' (vira o próximo).
 */
export function moverNaFila(c: Campanha, chave: string, para: 'cima' | 'baixo' | 'topo', travados: ReadonlySet<string>): Campanha {
  const posicoes = c.itens.flatMap((i, n) => (i.status === 'pendente' && !travados.has(i.chave) ? [n] : []));
  const fila = posicoes.map((n) => c.itens[n]);
  const de = fila.findIndex((i) => i.chave === chave);
  if (de < 0) return c;
  const alvo = para === 'topo' ? 0 : para === 'cima' ? de - 1 : de + 1;
  if (alvo < 0 || alvo >= fila.length || alvo === de) return c;
  const [movido] = fila.splice(de, 1);
  fila.splice(alvo, 0, movido);
  const itens = [...c.itens];
  posicoes.forEach((n, k) => {
    itens[n] = fila[k];
  });
  return { ...c, itens };
}

/** Erros que impedem aprovar (lista vazia = pode aprovar). */
export function validarParaAprovar(c: Pick<Campanha, 'itens' | 'modelos'>): string[] {
  const erros: string[] = [];
  if (c.itens.length === 0) erros.push('nenhum contato na campanha');
  for (const m of c.modelos) for (const e of validarModelo(m)) erros.push(e);
  const chaves = new Set<string>();
  for (const item of c.itens) {
    if (chaves.has(item.chave)) erros.push(`contato repetido: ${item.nome}`);
    chaves.add(item.chave);
    if (usaPrimeiroNome(item.modelo) && item.primeiroNome.trim() === '') erros.push(`preencha o primeiro nome de "${item.nome}"`);
    for (const e of validarModelo(textoDoItem(item))) erros.push(`${item.nome}: ${e}`);
  }
  return [...new Set(erros)];
}

export function proximoPendente(c: Campanha): ItemCampanha | null {
  return c.itens.find((i) => i.status === 'pendente') ?? null;
}

export function resumo(c: Campanha): Record<StatusItem, number> {
  const r: Record<StatusItem, number> = { pendente: 0, enviado: 0, pulado: 0, nao_cliente: 0, problema: 0, nao_enviar: 0, removido: 0 };
  for (const i of c.itens) r[i.status] += 1;
  return r;
}

/**
 * Muda o status de um item. Só sai de "pendente": um item já enviado/pulado não muda mais
 * (garante uma mensagem por contato por campanha). Devolve a mesma campanha se nada mudou.
 */
export function marcarItem(c: Campanha, chave: string, status: Exclude<StatusItem, 'pendente'>, agora: Date, motivo: string | null = null, codigo: string | null = null): Campanha {
  const item = c.itens.find((i) => i.chave === chave);
  if (!item || item.status !== 'pendente') return c;
  const itens = c.itens.map((i) => (i.chave === chave ? { ...i, status, motivo, codigo, atualizadoEm: agora.toISOString() } : i));
  let problemasSeguidos = c.problemasSeguidos;
  let statusCampanha: StatusCampanha = c.status;
  let motivoPausa = c.motivoPausa;
  if (status === 'problema') {
    const r = registrarProblema(problemasSeguidos);
    problemasSeguidos = r.problemasSeguidos;
    if (r.pausar) {
      statusCampanha = 'pausada';
      motivoPausa = `${problemasSeguidos} problemas seguidos — confira o WhatsApp antes de continuar`;
    }
  } else if (status === 'enviado') {
    problemasSeguidos = 0;
  }
  const novo: Campanha = { ...c, itens, problemasSeguidos, status: statusCampanha, motivoPausa };
  if (statusCampanha === 'em_execucao' && !novo.itens.some((i) => i.status === 'pendente')) {
    return { ...novo, status: 'concluida', motivoPausa: null };
  }
  return novo;
}

/**
 * Campanha terminada sem nenhum envio e com problemas (ou com contatos pulados para revisar por
 * um erro de conferência): não é um "concluída" verde.
 */
export function terminouComProblemas(c: Campanha): boolean {
  const r = resumo(c);
  return c.status === 'concluida' && r.enviado === 0 && itensComErro(c).length > 0;
}

export interface GrupoMotivo {
  codigo: string;
  quantidade: number;
  mensagem: string;
}

/** Itens que viraram problema (ou foram pulados por um erro com código), com o motivo. */
export function itensComErro(c: Campanha): ItemCampanha[] {
  return c.itens.filter((i) => i.status === 'problema' || (i.status === 'pulado' && i.codigo));
}

/** Motivos dos problemas agrupados por código (mensagem do primeiro caso de cada código). */
export function motivosAgrupados(c: Campanha): GrupoMotivo[] {
  const grupos = new Map<string, GrupoMotivo>();
  for (const i of itensComErro(c)) {
    const codigo = i.codigo ?? 'desconhecido';
    const g = grupos.get(codigo);
    if (g) g.quantidade += 1;
    else grupos.set(codigo, { codigo, quantidade: 1, mensagem: i.motivo ?? 'sem detalhe registrado' });
  }
  return [...grupos.values()];
}
