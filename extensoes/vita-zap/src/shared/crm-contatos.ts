// Operações sobre contatos: notas, etiquetas (com cor) e fase do funil. Funções que mexem no
// objeto `dados` em memória; quem chama decide quando gravar.

import { normalizarTexto } from './nomes';
import { garantirContato, novoId } from './crm-store';
import { CORES_ETIQUETA, FASES, type DadosCrm, type Etiqueta, type Fase } from './crm-tipos';

export const MAX_NOTA = 2000;
export const MAX_ETIQUETA = 30;

export function adicionarNota(dados: DadosCrm, chave: string, nome: string, texto: string, agora: number, id = novoId()): string | null {
  const t = texto.trim();
  if (t === '') return 'Escreva a nota antes de salvar.';
  if (t.length > MAX_NOTA) return `A nota passa de ${MAX_NOTA} caracteres.`;
  const c = garantirContato(dados, chave, nome, agora);
  c.notas.unshift({ id, texto: t, criadaEm: agora });
  c.atualizadoEm = agora;
  return null;
}

export function editarNota(dados: DadosCrm, chave: string, notaId: string, texto: string, agora: number): string | null {
  const t = texto.trim();
  if (t === '') return 'A nota não pode ficar vazia (use Excluir).';
  if (t.length > MAX_NOTA) return `A nota passa de ${MAX_NOTA} caracteres.`;
  const c = dados.contatos[chave];
  const n = c?.notas.find((x) => x.id === notaId);
  if (!c || !n) return 'Nota não encontrada.';
  n.texto = t;
  n.editadaEm = agora;
  c.atualizadoEm = agora;
  return null;
}

export function excluirNota(dados: DadosCrm, chave: string, notaId: string, agora: number): void {
  const c = dados.contatos[chave];
  if (!c) return;
  c.notas = c.notas.filter((n) => n.id !== notaId);
  c.atualizadoEm = agora;
}

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

/** Liga/desliga a etiqueta no contato (cria o contato se preciso). Devolve true se ficou ligada. */
export function alternarEtiqueta(dados: DadosCrm, chave: string, nome: string, etiquetaId: string, agora: number): boolean {
  const c = garantirContato(dados, chave, nome, agora);
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

/** Define a fase do funil (null tira a fase). */
export function definirFase(dados: DadosCrm, chave: string, nome: string, fase: Fase | null, agora: number): void {
  const c = garantirContato(dados, chave, nome, agora);
  if (fase) c.fase = fase;
  else delete c.fase;
  c.atualizadoEm = agora;
}

export function dispensarConversa(dados: DadosCrm, chave: string, agora: number): boolean {
  const conversa = dados.conversas[chave];
  if (!conversa) return false;
  const c = garantirContato(dados, chave, conversa.nome, agora);
  c.dispensadaAss = conversa.ass;
  c.dispensadaEm = agora;
  c.atualizadoEm = agora;
  return true;
}

export function reativarConversa(dados: DadosCrm, chave: string, agora: number): void {
  const c = dados.contatos[chave];
  if (!c) return;
  delete c.dispensadaAss;
  delete c.dispensadaEm;
  c.atualizadoEm = agora;
}

/** Itens do filtro: as fases primeiro ("fase:<id>") e depois as etiquetas, com o texto de busca aplicado. */
export function opcoesDeFiltro(dados: DadosCrm, busca: string): Array<{ id: string; rotulo: string; cor: string; tipo: 'fase' | 'etiqueta' }> {
  const q = normalizarTexto(busca);
  const fases = FASES.map((f) => ({ id: `fase:${f.id}`, rotulo: f.rotulo, cor: f.cor, tipo: 'fase' as const }));
  const etiquetas = dados.etiquetas.map((e) => ({ id: e.id, rotulo: e.nome, cor: e.cor, tipo: 'etiqueta' as const }));
  return [...fases, ...etiquetas].filter((o) => q === '' || normalizarTexto(o.rotulo).includes(q));
}
