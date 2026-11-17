// Mensagem de cobrança escolhida PELO DONO (v0.7.55): regras puras, sem rede, sem DOM.
//
// Decisão do dono (17/11/2026): "eu que tenho que definir o estilo de mensagem". Os modelos genéricos deixaram de ser
// usados para envio. Há dois modos:
//  - 'meus_textos' (padrão): o dono escreve de 1 a 10 variações para a 1ª cobrança e para a 2ª; o app sorteia uma por
//    contato, sem repetir a mesma em sequência. Sem IA.
//  - 'ia_estilo': a IA escreve no estilo do dono (instruções + os textos dele como exemplos); se a IA falhar ou o texto
//    for recusado, sai um dos textos do dono (nunca um modelo genérico).
// Sem pelo menos 1 texto da 1ª cobrança, a cobrança automática não liga.
//
// A validação aqui ESPELHA a do servidor (server/lib/zapIa.ts: cobrancaValida / textoSugeridoSeguro): mesma lista de
// termos proibidos, sem link, sem "R$"/"%", no máximo 280 caracteres depois de trocar o nome.

import { contemLink } from './texto';

/** O dono escreve {nome}; internamente vira {primeiroNome} (o marcador que as campanhas já entendem). */
export const MARCADOR_NOME = '{nome}';
export const MAX_TEXTOS = 10;
export const MAX_ESTILO = 500;
/** Igual ao servidor (MAX_COBRANCA): vale para o texto final, com o nome já no lugar. */
export const MAX_COBRANCA = 280;
export const MIN_COBRANCA = 10;
/** Nome fictício da prévia e da validação do editor. */
export const NOME_EXEMPLO = 'Maria';

export type ModoCobranca = 'meus_textos' | 'ia_estilo';

// Cópia da lista do servidor (conformidade sanitária, ESTADO-DO-PROJETO.md seção 4). Se mudar lá, mude aqui:
// tests/followup-estilo.test.ts compara as duas listas.
export const TERMOS_PROIBIDOS: readonly string[] = [
  'natural', 'puro', 'pureza', 'aditivo', 'mineral', 'minerais', 'eletrólit', 'hidrata', 'saúde', 'saudável',
  'benefício', 'iodo', 'energia', 'terapêutic', 'medicinal', 'cura', 'previne', 'prevenção',
];

const RE_MARCADOR = /\{\s*nome\s*\}/gi;
const RE_QUALQUER_CHAVE = /[{}]/;

/** {nome} → o nome informado. */
export function montarTextoCobranca(texto: string, nome: string): string {
  return texto.replace(RE_MARCADOR, nome).replace(/\s+/g, ' ').trim();
}

/** {nome} → {primeiroNome} (formato do item de campanha). Sem nome, tira o marcador de forma legível. */
export function textoParaModelo(texto: string): string {
  return texto.replace(RE_MARCADOR, '{primeiroNome}').replace(/\s+/g, ' ').trim();
}

/** Por que este texto não pode ser usado? Lista vazia = pode. `nome` só serve para medir o tamanho final. */
export function validarTextoCobranca(texto: string, nome: string = NOME_EXEMPLO): string[] {
  const erros: string[] = [];
  const t = texto.trim();
  if (t === '') return ['texto vazio'];
  if (!new RegExp(RE_MARCADOR.source, 'i').test(t)) erros.push(`precisa conter ${MARCADOR_NOME} (o primeiro nome do cliente)`);
  const semMarcador = t.replace(RE_MARCADOR, '');
  if (RE_QUALQUER_CHAVE.test(semMarcador)) erros.push(`só o marcador ${MARCADOR_NOME} é permitido (sem outras chaves)`);
  if (/[[\]<>]/.test(semMarcador)) erros.push('sem colchetes nem sinais < >');
  const final = montarTextoCobranca(t, nome);
  if (final.length > MAX_COBRANCA) erros.push(`longo demais (${final.length}/${MAX_COBRANCA} caracteres, já com o nome)`);
  if (final.length < MIN_COBRANCA) erros.push(`curto demais (mínimo ${MIN_COBRANCA} caracteres)`);
  if (contemLink(final)) erros.push('sem link (nem "site.com")');
  if (/r\$|%/i.test(final)) erros.push('sem preço nem porcentagem ("R$", "%")');
  const baixo = final.toLowerCase();
  const achado = TERMOS_PROIBIDOS.find((x) => baixo.includes(x));
  if (achado) erros.push(`termo não permitido (conformidade sanitária): "${achado}"`);
  if (/\bsair\b/i.test(final) && /respond/i.test(final)) erros.push('sem "responda SAIR"');
  return erros;
}

export const textoCobrancaValido = (texto: string, nome: string = NOME_EXEMPLO): boolean => validarTextoCobranca(texto, nome).length === 0;

/** Lista do editor → lista guardada: sem vazios, sem inválidos, sem repetidos (ignora maiúsculas), no máximo MAX_TEXTOS. */
export function normalizarTextos(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of lista) {
    if (typeof bruto !== 'string') continue;
    const t = bruto.replace(/\s+/g, ' ').trim();
    const k = t.toLowerCase();
    if (t === '' || vistos.has(k) || !textoCobrancaValido(t)) continue;
    vistos.add(k);
    saida.push(t);
    if (saida.length >= MAX_TEXTOS) break;
  }
  return saida;
}

export function normalizarEstilo(estilo: unknown): string {
  return typeof estilo === 'string' ? estilo.replace(/\s+/g, ' ').trim().slice(0, MAX_ESTILO) : '';
}

/**
 * Sorteia um texto. Com 2 ou mais, nunca devolve `anterior` (a mesma variação em sequência).
 * `excluir`: textos que este contato já recebeu (a 2ª cobrança não repete a 1ª). Devolve null se não sobra nenhum.
 */
export function sortearTexto(lista: ReadonlyArray<string>, aleatorio: () => number, anterior: string | null = null, excluir: ReadonlyArray<string> = []): string | null {
  const fora = new Set(excluir.map((x) => x.toLowerCase()));
  const livres = lista.filter((t) => !fora.has(t.toLowerCase()));
  if (livres.length === 0) return null;
  const semRepetir = livres.length > 1 && anterior != null ? livres.filter((t) => t !== anterior) : livres;
  const base = semRepetir.length > 0 ? semRepetir : livres;
  return base[Math.min(base.length - 1, Math.max(0, Math.floor(aleatorio() * base.length)))];
}

/** Pontos de partida para o editor (antes eram os modelos usados no envio; agora só viram sugestão se o dono quiser). */
export const SUGESTOES_1: readonly string[] = [
  'Oi, {nome}! Passando só para saber se você viu a minha mensagem. Se precisar de sal, é só me chamar. 😊',
  '{nome}, tudo bem? Fiquei sem retorno da minha última mensagem e quis lembrar. Qualquer coisa, estou por aqui!',
  'Olá, {nome}! Só reforçando a minha mensagem de alguns dias atrás. Se fizer sentido para você, me avisa por aqui.',
  'Oi, {nome}! Conseguiu ver a minha mensagem? Fico à disposição.',
];
export const SUGESTOES_2: readonly string[] = [
  '{nome}, última lembrança por aqui: se precisar de sal, é só me chamar. Fico à disposição!',
  'Oi, {nome}! Não quero te incomodar, só deixo meu contato aberto caso precise. Um abraço!',
  'Olá, {nome}! Sigo à disposição se precisar de sal. Qualquer coisa é só chamar.',
];

/** O que o dono configurou para a mensagem (parte da ConfigFollowup). */
export interface TextosDoDono {
  modo: ModoCobranca;
  textos1: string[];
  textos2: string[];
  estilo: string;
}

/**
 * Assinatura da configuração de texto: muda quando o modo, os textos ou o estilo mudam. Cada item da fila guarda a
 * assinatura com que o texto dele foi preparado; assinatura diferente = texto velho, refeito antes do envio.
 */
export function assinaturaTextos(c: TextosDoDono): string {
  const bruto = JSON.stringify([c.modo, c.textos1, c.textos2, c.modo === 'ia_estilo' ? c.estilo : '']);
  let h = 5381;
  for (let i = 0; i < bruto.length; i += 1) h = ((h * 33) ^ (bruto.codePointAt(i) ?? 0)) >>> 0;
  return `${c.modo}:${c.textos1.length}.${c.textos2.length}:${h.toString(36)}`;
}

export const MSG_ESCREVA_ANTES = 'Escreva sua mensagem de cobrança antes de ligar';

/** Pode ligar a cobrança automática? Só com pelo menos 1 texto salvo para a 1ª cobrança. */
export function podeLigar(c: Pick<TextosDoDono, 'textos1'>): { ok: true } | { ok: false; motivo: string } {
  return c.textos1.length > 0 ? { ok: true } : { ok: false, motivo: MSG_ESCREVA_ANTES };
}

/** Os textos do dono que servem à tentativa (a 2ª sem textos próprios usa os da 1ª, sem repetir o que o contato já recebeu). */
export function textosDaTentativa(c: TextosDoDono, tentativa: number): string[] {
  if (tentativa >= 2 && c.textos2.length > 0) return c.textos2;
  return c.textos1;
}

export type OrigemTexto = 'meus_textos' | 'ia_estilo';

export const ROTULO_ORIGEM: Record<OrigemTexto, string> = { meus_textos: 'seu texto', ia_estilo: 'IA no seu estilo' };

/** Rótulo da origem guardada. Valores antigos (0.7.54: 'ia' / 'modelo') são textos genéricos que não saem mais. */
export function rotuloOrigem(o: string | null | undefined): string {
  if (o === 'meus_textos' || o === 'ia_estilo') return ROTULO_ORIGEM[o];
  return 'texto antigo (será refeito)';
}

// ── Rascunho do editor ──────────────────────────────────────────────────────

/** O que está na tela do editor (ainda não salvo). Linhas vazias são ignoradas ao salvar. */
export type RascunhoMensagem = TextosDoDono;

export interface ErrosDoRascunho {
  /** Erros de cada linha de textos1/textos2 (mesmo índice). */
  textos1: string[][];
  textos2: string[][];
  estilo: string | null;
  /** Nenhum erro e pode salvar. */
  ok: boolean;
}

const preenchido = (t: string) => t.trim() !== '';

export function errosDoRascunho(r: RascunhoMensagem): ErrosDoRascunho {
  const linha = (lista: string[]) => lista.map((t) => (preenchido(t) ? validarTextoCobranca(t) : []));
  const t1 = linha(r.textos1);
  const t2 = linha(r.textos2);
  const dup = (lista: string[], erros: string[][]) => {
    const vistos = new Set<string>();
    lista.forEach((t, i) => {
      const k = t.replace(/\s+/g, ' ').trim().toLowerCase();
      if (k === '') return;
      if (vistos.has(k)) erros[i] = [...erros[i], 'repetido (já existe outra variação igual)'];
      vistos.add(k);
    });
  };
  dup(r.textos1, t1);
  dup(r.textos2, t2);
  const estilo = r.estilo.trim().length > MAX_ESTILO ? `no máximo ${MAX_ESTILO} caracteres` : null;
  const ok = estilo === null && [...t1, ...t2].every((e) => e.length === 0);
  return { textos1: t1, textos2: t2, estilo, ok };
}

export function rascunhoDeConfig(c: TextosDoDono): RascunhoMensagem {
  return { modo: c.modo, textos1: c.textos1.length > 0 ? [...c.textos1] : [''], textos2: [...c.textos2], estilo: c.estilo };
}

/** O rascunho é diferente do que está salvo? */
export function rascunhoMudou(r: RascunhoMensagem, salvo: TextosDoDono): boolean {
  return assinaturaTextos({ ...r, textos1: normalizarTextos(r.textos1), textos2: normalizarTextos(r.textos2), estilo: normalizarEstilo(r.estilo) }) !== assinaturaTextos(salvo);
}

/** Prévia: como cada texto fica para um nome fictício. */
export function previaDosTextos(lista: ReadonlyArray<string>, nome: string = NOME_EXEMPLO): string[] {
  return lista.filter(preenchido).map((t) => montarTextoCobranca(t, nome));
}
