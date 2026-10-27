// Linhas lidas da lista de conversas → contatos varridos (deduplicados e com data interpretada).

import { interpretarRotuloData, type DataIso, type ResultadoData } from './datas';
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
  /**
   * A prévia da última mensagem da linha é MINHA (ícone de entrega/leitura ou "Você:"): true; do cliente: false;
   * não deu para saber: null/ausente. Só `true` prova que o atendente já falou com o contato.
   */
  ultimaDeMim?: boolean | null;
  /**
   * A prévia da linha começa com "Fulano:" (assim o WhatsApp mostra a última mensagem de um GRUPO, inclusive o que tem
   * foto própria e por isso não tem o ícone padrão). Só indício: "Pedido: 10 sacos" num individual também começa assim.
   * Nunca entra sozinho na campanha (vai para "revisar"); quem decide, ao abrir, é classificarConversa.
   */
  possivelGrupo?: boolean;
  /**
   * A linha veio da seção "Mensagens" da busca (um ACHADO dentro de uma mensagem, não a conversa): a data e o ícone dela
   * são os da mensagem achada, não os da última mensagem do chat. Não vale como data, nem como "ultima de mim", nem
   * conta como outra conversa de mesmo nome.
   */
  deMensagem?: boolean;
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
  /** Ver LinhaBruta.ultimaDeMim. Ausente em contatos varridos antes da 0.7.21. */
  ultimaDeMim?: boolean | null;
  /** Ver LinhaBruta.possivelGrupo. Ausente em contatos varridos antes da 0.7.29. */
  possivelGrupo?: boolean;
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
  const achados = new Map<string, LinhaBruta>();
  for (const linha of linhas) {
    const nome = linha.nome.trim();
    if (nome === '') continue;
    const chave = chaveContato(nome);
    if (linha.deMensagem) {
      // Achado dentro de mensagem: só vale se o chat não apareceu como conversa; sem "ultima de mim" e sem data de verdade.
      if (!achados.has(chave)) achados.set(chave, { ...linha, nome, ultimaDeMim: null });
      continue;
    }
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, { linha: { ...linha, nome }, posicoes: new Set(linha.posicao == null ? [] : [linha.posicao]) });
      continue;
    }
    if (linha.posicao != null) atual.posicoes.add(linha.posicao);
    // Mantém o primeiro registro, mas não perde informação de grupo/data.
    if (!atual.linha.rotuloData && linha.rotuloData) atual.linha.rotuloData = linha.rotuloData;
    if (linha.pareceGrupo) atual.linha.pareceGrupo = true;
    if (linha.possivelGrupo) atual.linha.possivelGrupo = true;
    if (linha.ultimaDeMim === true) atual.linha.ultimaDeMim = true;
    else if (atual.linha.ultimaDeMim == null && linha.ultimaDeMim != null) atual.linha.ultimaDeMim = linha.ultimaDeMim;
  }
  const saida = [...grupos.values()].map(({ linha, posicoes }) => ({ ...linha, duplicado: posicoes.size > 1 }));
  for (const [chave, linha] of achados) if (!grupos.has(chave)) saida.push({ ...linha, duplicado: false });
  return saida;
}

export function linhasParaContatos(linhas: LinhaBruta[], agora: Date): ContatoVarrido[] {
  const varridoEm = agora.toISOString();
  return deduplicarLinhas(linhas).map((l) => {
    // Achado dentro de mensagem: a data da linha é a da mensagem achada, não a da última mensagem do chat.
    const data: ResultadoData = l.deMensagem
      ? { tipo: 'revisar', motivo: 'achado dentro de uma mensagem: a data não é a da última mensagem do chat' }
      : interpretarRotuloData(l.rotuloData, agora);
    return {
      chave: chaveContato(l.nome),
      nome: l.nome,
      rotuloData: l.rotuloData,
      ultimaConversa: data.tipo === 'ok' ? data.data : null,
      revisarData: data.tipo === 'revisar' ? data.motivo : null,
      soNumero: pareceSoNumero(l.nome),
      pareceGrupo: l.pareceGrupo,
      ...(l.possivelGrupo ? { possivelGrupo: true } : {}),
      // Linha sem rótulo de data = contato da agenda sem conversa (seção "Contatos" da busca).
      temConversa: l.rotuloData != null && l.rotuloData.trim() !== '',
      ...(l.ultimaDeMim !== undefined ? { ultimaDeMim: l.ultimaDeMim } : {}),
      duplicado: l.duplicado,
      varridoEm,
    };
  });
}
