// Varredura da lista de conversas — SÓ LEITURA. Não abre conversa, não escreve mensagem.
// Rola a lista com pausas (ritmo calmo) e devolve as linhas lidas; a deduplicação e a
// interpretação das datas acontecem no painel (shared/contatos.ts).

import type { LinhaBruta } from '../shared/contatos';
import { aleatorioEntre, ancestralRolavel, esperar } from './dom';
import { lerLinhasVisiveis } from './extrair';
import { buscar, ErroSeletor, exigir, linhasDaLista } from './lista';
import { encontrar } from './selectors';

const MAX_PASSOS = 400; // ~ alguns milhares de conversas
const MAX_LINHAS = 5000;

export async function varrerLista(
  termo: string,
  aoProgredir: (lidas: number, unicas: number) => void,
  limparPeloBotao: (() => boolean) | null = null,
): Promise<{ linhas: LinhaBruta[]; avisos: string[] }> {
  exigir(encontrar(document, 'painelLateral'), 'lista de conversas');
  await buscar(termo, limparPeloBotao);

  const avisos: string[] = [];
  const todas: LinhaBruta[] = [];
  const nomes = new Set<string>();

  let linhas = linhasDaLista();
  if (linhas.length === 0) {
    // Lista vazia: ou a busca não tem resultado, ou o seletor de linha quebrou. Não dá para
    // distinguir com segurança → para com erro (falha fechada).
    throw new ErroSeletor('linhas da lista de conversas (se a busca realmente não tem resultado, ignore este aviso)');
  }

  if (!linhas.some((el) => encontrar(el, 'tituloLinha'))) {
    // Há linhas, mas nenhuma com nome legível: o seletor do nome quebrou.
    throw new ErroSeletor('nome das conversas nas linhas da lista');
  }

  const rolavel = ancestralRolavel(linhas[0]);
  if (rolavel) rolavel.scrollTop = 0;
  await esperar(600);

  for (let passo = 0; passo < MAX_PASSOS; passo += 1) {
    linhas = linhasDaLista();
    const { linhas: lidas, achouSecaoSemConversa } = lerLinhasVisiveis(linhas);
    for (const l of lidas) {
      todas.push(l);
      nomes.add(l.nome);
    }
    aoProgredir(todas.length, nomes.size);
    if (achouSecaoSemConversa) break; // dali para baixo são contatos sem conversa / mensagens
    if (!rolavel || todas.length >= MAX_LINHAS) break;
    const antes = rolavel.scrollTop;
    rolavel.scrollTop = antes + Math.max(200, Math.floor(rolavel.clientHeight * 0.7));
    await esperar(aleatorioEntre(700, 1400));
    if (Math.abs(rolavel.scrollTop - antes) < 2) break; // fim da lista
  }
  if (todas.length > 0 && todas.every((l) => l.rotuloData == null)) {
    avisos.push('Nenhuma data de última mensagem foi reconhecida — todos ficarão fora da campanha. Confira o idioma do WhatsApp (português) e os seletores.');
  }
  if (todas.length >= MAX_LINHAS) avisos.push(`Varredura limitada a ${MAX_LINHAS} linhas.`);
  if (rolavel) rolavel.scrollTop = 0;
  return { linhas: todas, avisos };
}
