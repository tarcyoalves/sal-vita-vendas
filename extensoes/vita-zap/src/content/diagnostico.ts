// Diagnóstico da página do WhatsApp Web — SOMENTE LEITURA.
//
// Só consulta o DOM (querySelector). Não importa dom.ts/lista.ts/execucao.ts de propósito:
// aqui não pode existir nada que escreva, foque, clique ou dispare evento
// (tests/sem-envio-automatico.test.ts confere). Não devolve nomes nem textos de mensagem.

import type { DiagnosticoPagina, SeletorDiagnosticado } from '../shared/mensagens';
import { classificarConversa, lerSinaisDaConversa } from './chat';
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
  const ids = [...raiz.querySelectorAll('#main [data-id]')].map((el) => el.getAttribute('data-id') ?? '').filter(Boolean);
  const sinais = lerSinaisDaConversa();
  const recebidas = sinais.mensagens.filter((m) => m.recebida);
  const autores = recebidas.flatMap((m) => (m.autor ? [m.autor.trim().toLowerCase()] : []));
  const titulo = sinais.titulo?.trim().toLowerCase() ?? '';
  return {
    tipo: classificarConversa(ids, sinais),
    iconeGrupo: sinais.iconeGrupoNoCabecalho,
    recebidas: recebidas.length,
    enviadas: sinais.mensagens.filter((m) => m.sua).length,
    recebidasComAutor: autores.length,
    autoresDistintos: new Set(autores).size,
    autorIgualAoTitulo: autores.length > 0 && titulo !== '' ? autores.every((a) => a === titulo) : null,
    elementoAutor: recebidas.some((m) => m.temElementoAutor),
  };
}

/** Para cada seletor: a primeira alternativa que casa (ou null) e quantos elementos ela acha. */
export function diagnosticarSeletores(raiz: ParentNode): SeletorDiagnosticado[] {
  const chaves = Object.keys(SELETORES) as ChaveSeletor[];
  return chaves.map((chave) => {
    for (const alternativa of SELETORES[chave]) {
      let n = 0;
      try {
        n = raiz.querySelectorAll(alternativa).length;
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
    classificacao: diagnosticarClassificacao(raiz),
  };
}
