// Linhas lidas da lista de conversas → contatos varridos (deduplicados e com data interpretada).

import { interpretarRotuloData, type DataIso } from './datas';
import { chaveContato, pareceSoNumero } from './nomes';

/** O que o content script consegue ler de uma linha da lista de conversas. */
export interface LinhaBruta {
  nome: string;
  rotuloData: string | null;
  /**
   * Posição da linha na lista virtualizada (deslocamento vertical em px), ou null se não deu
   * para ler. A mesma conversa sempre ocupa a mesma posição durante a varredura; o mesmo nome
   * em duas posições diferentes = dois chats com o mesmo nome.
   */
  posicao: number | null;
  /** Ícone de grupo/lista de transmissão na linha. */
  pareceGrupo: boolean;
}

export interface ContatoVarrido {
  chave: string;
  nome: string;
  rotuloData: string | null;
  ultimaConversa: DataIso | null;
  /** Motivo quando a data não pôde ser lida com certeza. */
  revisarData: string | null;
  soNumero: boolean;
  pareceGrupo: boolean;
  temConversa: boolean;
  /** Mais de um chat com o mesmo nome. */
  duplicado: boolean;
  varridoEm: string; // ISO data-hora
}

/**
 * Junta as linhas repetidas pela rolagem (a lista é virtualizada: a mesma linha aparece em
 * várias leituras). Mesmo nome em posições diferentes → `duplicado`.
 */
export function deduplicarLinhas(linhas: LinhaBruta[]): Array<LinhaBruta & { duplicado: boolean }> {
  const grupos = new Map<string, { linha: LinhaBruta; posicoes: Set<number> }>();
  for (const linha of linhas) {
    const nome = linha.nome.trim();
    if (nome === '') continue;
    const chave = chaveContato(nome);
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, { linha: { ...linha, nome }, posicoes: new Set(linha.posicao == null ? [] : [linha.posicao]) });
      continue;
    }
    if (linha.posicao != null) atual.posicoes.add(linha.posicao);
    // Mantém o primeiro registro, mas não perde informação de grupo/data.
    if (!atual.linha.rotuloData && linha.rotuloData) atual.linha.rotuloData = linha.rotuloData;
    if (linha.pareceGrupo) atual.linha.pareceGrupo = true;
  }
  return [...grupos.values()].map(({ linha, posicoes }) => ({ ...linha, duplicado: posicoes.size > 1 }));
}

export function linhasParaContatos(linhas: LinhaBruta[], agora: Date): ContatoVarrido[] {
  const varridoEm = agora.toISOString();
  return deduplicarLinhas(linhas).map((l) => {
    const data = interpretarRotuloData(l.rotuloData, agora);
    return {
      chave: chaveContato(l.nome),
      nome: l.nome,
      rotuloData: l.rotuloData,
      ultimaConversa: data.tipo === 'ok' ? data.data : null,
      revisarData: data.tipo === 'revisar' ? data.motivo : null,
      soNumero: pareceSoNumero(l.nome),
      pareceGrupo: l.pareceGrupo,
      // Linha sem rótulo de data = contato da agenda sem conversa (seção "Contatos" da busca).
      temConversa: l.rotuloData != null && l.rotuloData.trim() !== '',
      duplicado: l.duplicado,
      varridoEm,
    };
  });
}
