// Abre a conversa de um TELEFONE pela busca do WhatsApp Web, sem recarregar a página (o endereço
// /send?phone= recarrega tudo). Só lê a lista e abre a linha achada; não escreve nem envia nada.
//
// Roteiro: digita o telefone na busca (vários formatos), espera os resultados assentarem, abre quando há UM
// contato individual (ou um único cujo nome bate com a dica), confere o cabeçalho e limpa a busca.

import { escolherResultado, formatoCurto, formatosDeBusca } from '../shared/abrir-por-telefone';
import type { RespostaConteudo } from '../shared/mensagens';
import { abrirLinhaDaLista } from './abrir-conversa';
import { memorizarTelefone } from './crm/telefone-conhecido';
import { esperarAte } from './dom';
import { classificarConversa, nomeDaConversaAberta } from './execucao';
import { lerResultadosDaBusca } from './extrair';
import { buscar, buscarEstabilizando, exigir, linhasDaLista } from './lista';
import { encontrar, encontrarTodos } from './selectors';

const assinaturaDaBusca = (): string =>
  lerResultadosDaBusca(linhasDaLista())
    .map((c) => c.linha.nome)
    .join('|');

function falha(codigo: Extract<RespostaConteudo, { ok: false }>['codigo'], erro: string): RespostaConteudo {
  return { ok: false, codigo, erro };
}

export async function abrirConversaPorTelefoneSemRecarregar(telefone: string, nomeDica?: string): Promise<RespostaConteudo> {
  const formatos = formatosDeBusca(telefone);
  if (formatos.length === 0) return falha('nao_encontrado', 'Telefone inválido para buscar a conversa.');
  exigir(encontrar(document, 'painelLateral'), 'lista de conversas');
  exigir(encontrar(document, 'caixaBusca'), 'caixa de busca');

  let viuAmbiguo = false;
  try {
    for (const formato of formatos) {
      await buscarEstabilizando(formato, assinaturaDaBusca);
      const candidatos = lerResultadosDaBusca(linhasDaLista());
      // Entre linhas do mesmo nome, prefere a que tem data (é a conversa, não só o contato da agenda).
      candidatos.sort((a, b) => Number(b.linha.rotuloData != null) - Number(a.linha.rotuloData != null));
      const escolha = escolherResultado(
        candidatos.map((c) => ({ nome: c.linha.nome })),
        nomeDica,
        formatoCurto(formato),
      );
      if (escolha.tipo === 'ambiguo') viuAmbiguo = true;
      if (escolha.tipo !== 'um') continue;

      const alvo = candidatos[escolha.indice];
      abrirLinhaDaLista(alvo.el);
      const abriu = await esperarAte(() => nomeDaConversaAberta() === alvo.linha.nome, 6000);
      if (!abriu) {
        if (!encontrar(document, 'painelConversa')) return falha('seletor', 'Painel da conversa não encontrado (seletor #main).');
        return falha('cabecalho', `A conversa aberta não é "${alvo.linha.nome}".`);
      }
      const ids = encontrarTodos(document, 'mensagem').map((el) => el.getAttribute('data-id') ?? '').filter(Boolean);
      if (classificarConversa(ids) === 'grupo') return falha('grupo', `"${alvo.linha.nome}" é grupo ou lista de transmissão.`);
      memorizarTelefone(alvo.linha.nome, telefone);
      return { ok: true, nome: alvo.linha.nome };
    }
  } finally {
    await buscar(''); // limpa a busca que usamos
  }
  return viuAmbiguo
    ? falha('ambiguo', 'A busca pelo telefone achou mais de um contato.')
    : falha('nao_encontrado', 'A busca pelo telefone não achou a conversa.');
}
