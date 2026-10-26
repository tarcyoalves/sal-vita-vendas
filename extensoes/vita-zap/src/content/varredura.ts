let interromper = false;

export function pararVarredura(): void {
  interromper = true;
}

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

export async function varrerLista(termo: string, aoProgredir: (lidas: number, unicas: number) => void): Promise<{ linhas: LinhaBruta[]; avisos: string[] }> {
  interromper = false;
  exigir(encontrar(document, 'painelLateral'), 'lista de conversas');
  await buscar(termo);

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

  let tentativasSemMover = 0;
  for (let passo = 0; passo < MAX_PASSOS; passo += 1) {
    linhas = linhasDaLista();
    // cortarEmSecaoSemConversa = false: continua lendo todos os contatos e mensagens da lista!
    const { linhas: lidas } = lerLinhasVisiveis(linhas, false);
    for (const l of lidas) {
      todas.push(l);
      nomes.add(l.nome);
    }
    aoProgredir(todas.length, nomes.size);
    if (interromper) {
      avisos.push('Varredura pausada pelo usuário.');
      break;
    }
    if (!rolavel || todas.length >= MAX_LINHAS) break;

    const antes = rolavel.scrollTop;
    rolavel.scrollTop = antes + Math.max(300, Math.floor(rolavel.clientHeight * 0.8));
    await esperar(aleatorioEntre(700, 1200));

    if (Math.abs(rolavel.scrollTop - antes) < 2) {
      tentativasSemMover += 1;
      // Dá tempo de o WhatsApp Web carregar o próximo lote assíncrono
      await esperar(1000);
      rolavel.scrollTop = rolavel.scrollHeight;
      if (tentativasSemMover >= 3) {
        break; // fim real da lista
      }
    } else {
      tentativasSemMover = 0;
    }
  }
  if (todas.length > 0 && todas.every((l) => l.rotuloData == null)) {
    avisos.push('Nenhuma data de última mensagem foi reconhecida — todos ficarão fora da campanha. Confira o idioma do WhatsApp (português) e os seletores.');
  }
  if (todas.length >= MAX_LINHAS) avisos.push(`Varredura limitada a ${MAX_LINHAS} linhas.`);
  if (rolavel) rolavel.scrollTop = 0;
  return { linhas: todas, avisos };
}
