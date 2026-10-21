// Rola a lista de conversas devagar (SÓ LEITURA: não abre conversa nem escreve nada) para que a
// leitura do estado alcance as linhas que a virtualização ainda não tinha renderizado.

import { aleatorioEntre, ancestralRolavel, esperar } from '../dom';
import { linhasDaLista } from '../lista';

const MAX_PASSOS = 300;

export async function rolarELer(aoPasso: () => void, deveParar: () => boolean): Promise<void> {
  const linhas = linhasDaLista();
  const rolavel = ancestralRolavel(linhas[0] ?? null);
  if (!rolavel) {
    aoPasso();
    return;
  }
  rolavel.scrollTop = 0;
  await esperar(500);
  for (let passo = 0; passo < MAX_PASSOS; passo += 1) {
    aoPasso();
    if (deveParar()) break;
    const antes = rolavel.scrollTop;
    rolavel.scrollTop = antes + Math.max(200, Math.floor(rolavel.clientHeight * 0.7));
    await esperar(aleatorioEntre(500, 900));
    if (Math.abs(rolavel.scrollTop - antes) < 2) break; // fim da lista
  }
  aoPasso();
  rolavel.scrollTop = 0;
}
