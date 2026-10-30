// Operações puras sobre os dados do CRM em memória: achar/criar/vincular contatos, notas,
// etiquetas (com cor) e fase do funil. Quem grava é o repositório (repositorio-local.ts).
//
// Identidade: o contato tem um ID INTERNO opaco. Nome exibido e telefone são atributos: o nome
// pode mudar no WhatsApp e o telefone pode ser descoberto depois. "Vincular" junta registros
// que eram a mesma pessoa.

import { normalizarTexto } from './nomes';
import { chaveDoTelefone, normalizarTelefone, telefoneDoNomeExibido } from './telefone';
import { novoId } from './id';
import { CORES_ETIQUETA, FASES, type Contato, type DadosCrm, type Etiqueta, type Fase, type Lembrete, type Nota, type RefContato } from './crm-tipos';

export const MAX_NOTA = 2000;
export const MAX_ETIQUETA = 30;

// ── Achar e criar contatos ───────────────────────────────────────────────────

/** Chave de nome para alias: o nome normalizado, ou null se o "nome" é só um número (aí vale o telefone). */
export function aliasDoNome(nome: string): string | null {
  if (telefoneDoNomeExibido(nome)) return null;
  const a = normalizarTexto(nome);
  return a === '' ? null : a;
}

/** Telefone normalizado de uma referência: o campo `telefone` ou, se o nome exibido é um número, ele. */
export function telefoneDaRef(ref: RefContato): string | null {
  return normalizarTelefone(ref.telefone) ?? telefoneDoNomeExibido(ref.nome);
}

export interface Indice {
  porId: Map<string, Contato>;
  porTelefone: Map<string, Contato>;
  porAlias: Map<string, Contato[]>;
}

export function criarIndice(dados: DadosCrm): Indice {
  const porId = new Map<string, Contato>();
  const porTelefone = new Map<string, Contato>();
  const porAlias = new Map<string, Contato[]>();
  for (const c of Object.values(dados.contatos)) {
    porId.set(c.id, c);
    if (c.telefone) porTelefone.set(chaveDoTelefone(c.telefone), c);
    for (const a of c.aliases) porAlias.set(a, [...(porAlias.get(a) ?? []), c]);
  }
  return { porId, porTelefone, porAlias };
}

/**
 * Acha o contato: 1) pelo id; 2) pelo telefone; 3) pelo nome (alias), ignorando quem já tem
 * OUTRO telefone (mesmo nome, outra pessoa). Sem achar, devolve undefined.
 */
export function acharNoIndice(ind: Indice, ref: RefContato): Contato | undefined {
  if (ref.contatoId) {
    const c = ind.porId.get(ref.contatoId);
    if (c) return c;
  }
  const tel = telefoneDaRef(ref);
  if (tel) {
    const c = ind.porTelefone.get(chaveDoTelefone(tel));
    if (c) return c;
  }
  const alias = aliasDoNome(ref.nome);
  if (!alias) return undefined;
  const candidatos = (ind.porAlias.get(alias) ?? []).filter((c) => !tel || !c.telefone || chaveDoTelefone(c.telefone) === chaveDoTelefone(tel));
  if (!tel && candidatos.length > 1) return undefined;
  return candidatos.sort((a, b) => b.atualizadoEm - a.atualizadoEm)[0];
}

export function acharContato(dados: DadosCrm, ref: RefContato): Contato | undefined {
  return acharNoIndice(criarIndice(dados), ref);
}

/**
 * Acha ou cria o contato e atualiza o que a referência trouxe de novo: telefone descoberto,
 * nome novo (vira alias). Se o telefone descoberto já era de OUTRO registro, os dois são
 * vinculados (mesma pessoa).
 */
export function garantirContato(dados: DadosCrm, ref: RefContato, agora: number): Contato {
  const tel = telefoneDaRef(ref);
  const alias = aliasDoNome(ref.nome);
  let c = acharContato(dados, ref);
  if (!c) {
    c = { id: novoId(), nome: ref.nome, ...(tel ? { telefone: tel } : {}), aliases: alias ? [alias] : [], etiquetas: [], notas: [], criadoEm: agora, atualizadoEm: agora };
    dados.contatos[c.id] = c;
    return c;
  }
  if (tel && !c.telefone) {
    // Se o telefone já é de outro registro, junta os dois.
    const outro = Object.values(dados.contatos).find((x) => x.id !== c?.id && x.telefone && chaveDoTelefone(x.telefone) === chaveDoTelefone(tel));
    if (outro) c = juntarContatos(dados, c.id, outro.id, agora);
    c.telefone = tel;
  }
  if (alias && !c.aliases.includes(alias)) c.aliases.push(alias);
  if (!telefoneDoNomeExibido(ref.nome) && telefoneDoNomeExibido(c.nome)) c.nome = ref.nome; // agora o contato tem nome salvo
  return c;
}

/** Atualiza só o que já existe (não cria contato): usado pela leitura da lista. Devolve o contato ou undefined. */
export function atualizarSeExistir(dados: DadosCrm, ref: RefContato, agora: number): Contato | undefined {
  return acharContato(dados, ref) ? garantirContato(dados, ref, agora) : undefined;
}

// ── Vincular ─────────────────────────────────────────────────────────────────

/** Junta `origemId` e `destinoId` num só (fica o id de origem). Notas, etiquetas e lembretes passam para ele. */
export function juntarContatos(dados: DadosCrm, origemId: string, destinoId: string, agora: number): Contato {
  const o = dados.contatos[origemId];
  const d = dados.contatos[destinoId];
  if (!o) throw new Error('contato de origem não encontrado');
  if (!d || o.id === d.id) return o;
  const notas = new Map<string, Nota>();
  for (const n of [...o.notas, ...d.notas]) if (!notas.has(n.id)) notas.set(n.id, n);
  o.notas = [...notas.values()].sort((a, b) => b.criadaEm - a.criadaEm);
  o.etiquetas = [...new Set([...o.etiquetas, ...d.etiquetas])];
  o.aliases = [...new Set([...o.aliases, ...d.aliases])];
  o.telefone = o.telefone ?? d.telefone;
  o.fase = o.fase ?? d.fase;
  if (d.convertidoEm != null) o.convertidoEm = Math.min(o.convertidoEm ?? Infinity, d.convertidoEm);
  if (d.ultimoContatoEm != null) o.ultimoContatoEm = Math.max(o.ultimoContatoEm ?? 0, d.ultimoContatoEm);
  o.criadoEm = Math.min(o.criadoEm, d.criadoEm);
  o.atualizadoEm = agora;
  for (const l of dados.lembretes) if (l.contatoId === d.id) l.contatoId = o.id;
  delete dados.contatos[d.id];
  return o;
}

export type DestinoVinculo = { contatoId: string } | { telefone: string } | { nome: string };

/**
 * Vincula o contato a outra identidade: outro contato (junta os dois), um telefone (e, se ele já
 * era de outro contato, junta) ou outro nome (alias). Erro em texto se o destino é inválido.
 */
export function vincularContato(dados: DadosCrm, contatoId: string, destino: DestinoVinculo, agora: number): { erro: string } | { contato: Contato } {
  const c = dados.contatos[contatoId];
  if (!c) return { erro: 'Contato não encontrado.' };
  if ('contatoId' in destino) {
    if (!dados.contatos[destino.contatoId]) return { erro: 'Contato de destino não encontrado.' };
    return { contato: juntarContatos(dados, c.id, destino.contatoId, agora) };
  }
  if ('telefone' in destino) {
    const tel = normalizarTelefone(destino.telefone);
    if (!tel) return { erro: 'Telefone inválido. Use DDD + número (ex.: 84 99999-0000).' };
    const outro = Object.values(dados.contatos).find((x) => x.id !== c.id && x.telefone && chaveDoTelefone(x.telefone) === chaveDoTelefone(tel));
    const resultado = outro ? juntarContatos(dados, c.id, outro.id, agora) : c;
    resultado.telefone = tel;
    resultado.atualizadoEm = agora;
    return { contato: resultado };
  }
  const alias = aliasDoNome(destino.nome);
  if (!alias) return { erro: 'Informe um nome.' };
  if (!c.aliases.includes(alias)) c.aliases.push(alias);
  c.atualizadoEm = agora;
  return { contato: c };
}

// ── Notas ────────────────────────────────────────────────────────────────────

/** Erro em texto se a nota não pode ser salva; null se está ok. */
export function validarNota(texto: string): string | null {
  const t = texto.trim();
  if (t === '') return 'Escreva a nota antes de salvar.';
  if (t.length > MAX_NOTA) return `A nota passa de ${MAX_NOTA} caracteres.`;
  return null;
}

export function adicionarNota(c: Contato, texto: string, agora: number, id = novoId()): string | null {
  const t = texto.trim();
  const erro = validarNota(texto);
  if (erro) return erro;
  c.notas.unshift({ id, texto: t, criadaEm: agora });
  c.atualizadoEm = agora;
  return null;
}

export function editarNota(c: Contato, notaId: string, texto: string, agora: number): string | null {
  const t = texto.trim();
  if (t === '') return 'A nota não pode ficar vazia (use Excluir).';
  if (t.length > MAX_NOTA) return `A nota passa de ${MAX_NOTA} caracteres.`;
  const n = c.notas.find((x) => x.id === notaId);
  if (!n) return 'Nota não encontrada.';
  n.texto = t;
  n.editadaEm = agora;
  c.atualizadoEm = agora;
  return null;
}

export function excluirNota(c: Contato, notaId: string, agora: number): void {
  c.notas = c.notas.filter((n) => n.id !== notaId);
  c.atualizadoEm = agora;
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

/** Cria a etiqueta. Erro (texto) se o nome é vazio, comprido ou repetido (sem diferenciar maiúscula/acento). */
export function criarEtiqueta(dados: DadosCrm, nome: string, cor: string, id = novoId()): { erro: string } | { etiqueta: Etiqueta } {
  const n = nome.trim();
  if (n === '') return { erro: 'Dê um nome à etiqueta.' };
  if (n.length > MAX_ETIQUETA) return { erro: `O nome passa de ${MAX_ETIQUETA} caracteres.` };
  if (dados.etiquetas.some((e) => normalizarTexto(e.nome) === normalizarTexto(n))) return { erro: 'Já existe uma etiqueta com esse nome.' };
  const etiqueta: Etiqueta = { id, nome: n, cor: (CORES_ETIQUETA as readonly string[]).includes(cor) || /^#[0-9a-f]{6}$/i.test(cor) ? cor : CORES_ETIQUETA[0] };
  dados.etiquetas.push(etiqueta);
  return { etiqueta };
}

/** Liga/desliga a etiqueta no contato. Devolve true se ficou ligada. */
export function alternarEtiqueta(c: Contato, etiquetaId: string, agora: number): boolean {
  const tem = c.etiquetas.includes(etiquetaId);
  c.etiquetas = tem ? c.etiquetas.filter((e) => e !== etiquetaId) : [...c.etiquetas, etiquetaId];
  c.atualizadoEm = agora;
  return !tem;
}

/** Remove a etiqueta de todos os contatos e dos filtros salvos. */
export function excluirEtiqueta(dados: DadosCrm, etiquetaId: string): void {
  dados.etiquetas = dados.etiquetas.filter((e) => e.id !== etiquetaId);
  for (const c of Object.values(dados.contatos)) c.etiquetas = c.etiquetas.filter((e) => e !== etiquetaId);
  dados.config = { ...dados.config, filtroEtiquetas: dados.config.filtroEtiquetas.filter((e) => e !== etiquetaId) };
}

export function renomearEtiqueta(dados: DadosCrm, etiquetaId: string, nome: string, cor: string): string | null {
  const n = nome.trim();
  if (n === '') return 'Dê um nome à etiqueta.';
  if (dados.etiquetas.some((e) => e.id !== etiquetaId && normalizarTexto(e.nome) === normalizarTexto(n))) return 'Já existe uma etiqueta com esse nome.';
  const e = dados.etiquetas.find((x) => x.id === etiquetaId);
  if (!e) return 'Etiqueta não encontrada.';
  e.nome = n.slice(0, MAX_ETIQUETA);
  e.cor = cor;
  return null;
}

// ── Fase, dispensa, último contato ───────────────────────────────────────────

/** Define a fase do funil (null tira a fase). "Fechado" marca o instante da conversão. */
export function definirFase(c: Contato, fase: Fase | null, agora: number): void {
  if (fase) c.fase = fase;
  else delete c.fase;
  if (fase === 'fechado') c.convertidoEm = c.convertidoEm ?? agora;
  else delete c.convertidoEm;
  c.atualizadoEm = agora;
}

export function dispensarContato(c: Contato, assinatura: string, agora: number): void {
  c.dispensadaAss = assinatura;
  c.dispensadaEm = agora;
  c.atualizadoEm = agora;
}

export function reativarContato(c: Contato, agora: number): void {
  delete c.dispensadaAss;
  delete c.dispensadaEm;
  c.atualizadoEm = agora;
}

/** Só avança: um valor mais antigo não desfaz um mais novo. */
export function registrarUltimoContatoEm(c: Contato, em: number): boolean {
  if (c.ultimoContatoEm != null && c.ultimoContatoEm >= em) return false;
  c.ultimoContatoEm = em;
  return true;
}

/** Lembretes ainda não concluídos do contato. */
export function lembretesDoContato(dados: DadosCrm, contatoId: string): Lembrete[] {
  return dados.lembretes.filter((l) => l.contatoId === contatoId && l.status !== 'concluido');
}

/** Itens do filtro: as fases primeiro ("fase:<id>") e depois as etiquetas, com o texto de busca aplicado. */
export function opcoesDeFiltro(dados: DadosCrm, busca: string): Array<{ id: string; rotulo: string; cor: string; tipo: 'fase' | 'etiqueta' }> {
  const q = normalizarTexto(busca);
  const fases = FASES.map((f) => ({ id: `fase:${f.id}`, rotulo: f.rotulo, cor: f.cor, tipo: 'fase' as const }));
  const etiquetas = dados.etiquetas.map((e) => ({ id: e.id, rotulo: e.nome, cor: e.cor, tipo: 'etiqueta' as const }));
  return [...fases, ...etiquetas].filter((o) => q === '' || normalizarTexto(o.rotulo).includes(q));
}
