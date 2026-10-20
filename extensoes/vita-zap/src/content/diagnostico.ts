// Diagnóstico da página do WhatsApp Web — SOMENTE LEITURA.
//
// Só consulta o DOM (querySelector). Não importa dom.ts/lista.ts/execucao.ts de propósito:
// aqui não pode existir nada que escreva, foque, clique ou dispare evento
// (tests/envio-so-no-automatico-autorizado.test.ts confere). Não devolve nomes nem textos de mensagem.

import type { CaixaBuscaDiagnosticada, DiagnosticoPagina, LinhasMensagemDiagnosticadas, SeletorDiagnosticado } from '../shared/mensagens';
import { autorDaMensagem, classificarConversa, lerMensagens, lerSinaisDaConversa } from './chat';
import { encontrar, encontrarTodos, SELETORES, type ChaveSeletor } from './selectors';

/** Troca os dígitos por * em cada bloco numérico, mantendo os 4 últimos (prefixo true_/false_, @c.us etc. ficam). */
export function mascararDataId(id: string): string {
  return id.replace(/\d+/g, (bloco) => (bloco.length <= 4 ? bloco : '*'.repeat(bloco.length - 4) + bloco.slice(-4)));
}

const EXTRAS_MENSAGEM = ['#main [role="row"]', '#main [role="application"]', '#main .copyable-text[data-pre-plain-text]', '#main [data-testid]', '#main [data-virtualized]'];

/** Nomes de atributos das linhas de mensagem (e dos .copyable-text dentro) + seletores extras presentes. */
export function estruturaDasMensagens(raiz: ParentNode): string[] {
  const nomes = new Set<string>();
  const linhas = [...raiz.querySelectorAll('#main [data-id]')].slice(0, 8);
  for (const el of linhas) {
    for (const a of el.getAttributeNames()) nomes.add(`attr:${a}`);
    for (const filho of el.querySelectorAll('.copyable-text')) for (const a of filho.getAttributeNames()) nomes.add(`copyable-text attr:${a}`);
  }
  const saida = [...nomes].sort();
  for (const sel of EXTRAS_MENSAGEM) {
    const n = raiz.querySelectorAll(sel).length;
    if (n > 0) saida.push(`seletor:${sel} (${n})`);
  }
  return saida;
}

/** Como a conversa aberta foi classificada e quais sinais pesaram (sem nomes nem textos). */
export function diagnosticarClassificacao(raiz: ParentNode): DiagnosticoPagina['classificacao'] {
  const ids = lerMensagens().map((m) => m.id);
  const sinais = lerSinaisDaConversa();
  const recebidas = sinais.mensagens.filter((m) => m.recebida);
  // Sem in/out no DOM atual, os autores valem para todas as linhas (suas e do contato).
  const autores = sinais.mensagens.flatMap((m) => (m.autor ? [m.autor.trim().toLowerCase()] : []));
  const titulo = sinais.titulo?.trim().toLowerCase() ?? '';
  return {
    tipo: classificarConversa(ids, sinais),
    iconeGrupo: sinais.iconeGrupoNoCabecalho,
    recebidas: recebidas.length,
    enviadas: sinais.mensagens.filter((m) => m.sua).length,
    recebidasComAutor: autores.length,
    autoresDistintos: new Set(autores).size,
    autorIgualAoTitulo: autores.length > 0 && titulo !== '' ? autores.some((a) => a === titulo) : null,
    elementoAutor: sinais.mensagens.some((m) => m.temElementoAutor),
  };
}

/** Sinais de que a linha da mensagem foi renderizada por completo (a conversa é virtualizada). */
const RENDERIZADA = '.selectable-text, .copyable-text, [data-testid="msg-container"], [data-testid="msg-meta"]';

/** Quantos elementos que casam com alguma alternativa existem DENTRO das linhas de mensagem. */
function contarDentroDasLinhas(alternativas: readonly string[]): number {
  let total = 0;
  for (const { el } of lerMensagens()) {
    for (const alt of alternativas) {
      const n = el.querySelectorAll(alt).length;
      if (n > 0) {
        total += n;
        break;
      }
    }
  }
  return total;
}

/** Linhas de mensagem: quantas, quantas renderizadas, autores distintos (3 letras) e elementos de autor DENTRO delas. */
export function diagnosticarLinhasMensagem(): LinhasMensagemDiagnosticadas {
  const linhas = lerMensagens();
  const autores = new Set<string>();
  let renderizadas = 0;
  for (const { el } of linhas) {
    if (el.querySelector(RENDERIZADA) !== null) renderizadas += 1;
    const autor = autorDaMensagem(el);
    if (autor) autores.add(autor.trim().toLowerCase().slice(0, 3));
  }
  return { convMsg: linhas.length, renderizadas, autores: [...autores].sort(), elementosAutor: contarDentroDasLinhas(SELETORES.autorMensagem) };
}

/** Atributos (nunca o texto) da caixa de busca da lista e se ela tem texto. */
export function diagnosticarCaixaBusca(raiz: ParentNode): CaixaBuscaDiagnosticada | null {
  const el = encontrar(raiz, 'caixaBusca');
  if (!el) return null;
  const texto = el instanceof HTMLInputElement ? el.value : (el.textContent ?? '');
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    dataTab: el.getAttribute('data-tab'),
    temTexto: texto.replace(/[\s​-‏⁠﻿]/g, '').length > 0,
  };
}

/** Para cada seletor: a primeira alternativa que casa (ou null) e quantos elementos ela acha. */
export function diagnosticarSeletores(raiz: ParentNode): SeletorDiagnosticado[] {
  const chaves = Object.keys(SELETORES) as ChaveSeletor[];
  return chaves.map((chave) => {
    for (const alternativa of SELETORES[chave]) {
      let n = 0;
      try {
        // Autor só vale DENTRO de uma linha de mensagem (o mesmo nome no cabeçalho não conta).
        n = chave === 'autorMensagem' ? contarDentroDasLinhas([alternativa]) : raiz.querySelectorAll(alternativa).length;
      } catch {
        n = 0;
      }
      if (n > 0) return { chave, casou: alternativa, quantidade: n };
    }
    return { chave, casou: null, quantidade: 0 };
  });
}

export function diagnosticarPagina(raiz: Document = document): DiagnosticoPagina {
  const coluna = encontrar(raiz, 'colunaEsquerda') ?? encontrar(raiz, 'painelLateral');
  return {
    url: `${raiz.location?.origin ?? ''}${raiz.location?.pathname ?? ''}`,
    idioma: raiz.documentElement?.lang?.trim() || '(vazio)',
    seletores: diagnosticarSeletores(raiz),
    linhasNaLista: coluna ? encontrarTodos(coluna, 'linhaConversa').length : 0,
    conversaAberta: encontrar(raiz, 'painelConversa') !== null,
    tituloCabecalho: encontrar(raiz, 'tituloCabecalho') !== null,
    caixaMensagem: encontrar(raiz, 'caixaMensagem') !== null,
    dataIds: {
      total: raiz.querySelectorAll('#main [data-id]').length,
      amostras: [...raiz.querySelectorAll('#main [data-id]')].slice(0, 8).map((el) => mascararDataId(el.getAttribute('data-id') ?? '')),
    },
    estruturaMensagem: estruturaDasMensagens(raiz),
    caixaBusca: diagnosticarCaixaBusca(raiz),
    linhasMensagem: diagnosticarLinhasMensagem(),
    classificacao: diagnosticarClassificacao(raiz),
  };
}
