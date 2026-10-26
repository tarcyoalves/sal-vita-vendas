// Telefone do contato da conversa aberta lido do painel "Dados do contato" do WhatsApp Web.
//
// Contato salvo mostra só o nome; o número fica nesse painel (à direita). Ler é só leitura de dados: para isso o
// código abre o painel (clique no nome do cabeçalho), lê o "+55 ..." e fecha o painel de novo (clique no X dele).
// Nada é escrito nem enviado. Os dois cliques ficam em abrir-conversa.ts (único arquivo que simula clique).

import { normalizarTelefone } from '../../shared/telefone';
import { abrirPainelDadosDoContato, fecharPainelDadosDoContato } from '../abrir-conversa';
import { esperarAte, limparMarcas } from '../dom';
import { nomeDaConversaAberta } from '../execucao';
import { encontrar, existeAlgum } from '../selectors';
import { ignorarCliquesForaPor } from './popover';
import { memorizarTelefone } from './telefone-conhecido';

/** "+55 84 99999-0000" (sempre com "+", como o WhatsApp mostra no painel). */
const PADRAO_TELEFONE = /^\+\d[\d\s().-]{9,}$/;

/** Títulos do painel de grupo/comunidade (que lista participantes). */
const PADRAO_PAINEL_DE_GRUPO = /dados d[oa] (grupo|comunidade)|group info|community info|participantes|participants/i;

/** Tempos (ms) da leitura. Exportado para os testes encurtarem. */
export const TEMPOS_DADOS = { abrir: 3500, ler: 2500 };

function telefoneNoPainel(painel: ParentNode): string | null {
  for (const f of painel.querySelectorAll<HTMLElement>('span, div')) {
    if (f.children.length > 0) continue;
    const t = limparMarcas(f.textContent ?? '');
    if (PADRAO_TELEFONE.test(t)) return normalizarTelefone(t);
  }
  return null;
}

/**
 * Painel à direita da conversa. Primeiro pelos seletores conhecidos; se o WhatsApp mudou o HTML, procura entre os
 * "irmãos" da coluna da conversa um bloco que mostre um número no formato +DDI ....
 */
export function painelDeDadosDoContato(): HTMLElement | null {
  const conhecido = encontrar(document, 'painelDadosContato');
  if (conhecido && telefoneNoPainel(conhecido)) return conhecido;
  const principal = encontrar(document, 'painelConversa');
  if (!principal) return conhecido;
  const lateral = encontrar(document, 'colunaEsquerda');
  let no: HTMLElement | null = principal;
  for (let nivel = 0; nivel < 6 && no?.parentElement && no !== document.body; nivel += 1) {
    for (const irmao of Array.from(no.parentElement.children)) {
      if (!(irmao instanceof HTMLElement) || irmao === no || irmao.contains(principal) || (lateral && irmao.contains(lateral))) continue;
      if (telefoneNoPainel(irmao)) return irmao;
    }
    no = no.parentElement;
  }
  return conhecido;
}

/** Telefone que o painel "Dados do contato" mostra agora (se estiver aberto), normalizado; senão null. */
export function telefoneDoPainelDeDados(): string | null {
  const painel = painelDeDadosDoContato();
  return painel ? telefoneNoPainel(painel) : null;
}

/**
 * Abre "Dados do contato" da conversa aberta, lê o número, fecha o painel e devolve o telefone (ou null).
 * Se o painel já estava aberto, só lê e deixa como está. Em grupo não faz nada.
 */
export async function lerTelefoneDosDadosDoContato(): Promise<string | null> {
  const nome = nomeDaConversaAberta();
  const cabecalho = encontrar(document, 'cabecalhoConversa');
  if (!nome || !cabecalho || existeAlgum(cabecalho, 'iconeGrupo')) return null;

  const jaAberto = telefoneDoPainelDeDados();
  if (jaAberto) {
    memorizarTelefone(nome, jaAberto);
    return jaAberto;
  }

  const titulo = encontrar(document, 'tituloCabecalho');
  if (!titulo) return null;
  ignorarCliquesForaPor(TEMPOS_DADOS.abrir + TEMPOS_DADOS.ler + 2000); // o clique sintético não pode fechar o popover aberto
  abrirPainelDadosDoContato(titulo);
  let telefone: string | null = null;
  let pareceGrupo = false;
  try {
    telefone = await esperarAte(() => telefoneDoPainelDeDados(), TEMPOS_DADOS.abrir + TEMPOS_DADOS.ler);
    // Painel de grupo lista participantes com telefone: esse número NÃO é da conversa.
    pareceGrupo = PADRAO_PAINEL_DE_GRUPO.test(painelDeDadosDoContato()?.textContent ?? '');
  } finally {
    const painel = painelDeDadosDoContato();
    const fechar = painel ? encontrar(painel, 'botaoFecharPainel') : null;
    if (fechar) fecharPainelDadosDoContato(fechar);
  }
  if (telefone && nomeDaConversaAberta() === nome && !pareceGrupo) {
    memorizarTelefone(nome, telefone);
    return telefone;
  }
  return null;
}
