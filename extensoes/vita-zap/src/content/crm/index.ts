// Controlador do CRM no WhatsApp Web: lê a lista de conversas (só DOM), guarda o estado, desenha
// a barra de abas e filtra a lista. Se algum seletor falhar, degrada em silêncio (um console.warn).
//
// Nada aqui envia mensagem: botões nossos só filtram, anotam e colam rascunho.

import { chaveDaConversa, classificar, contar, diagnosticoDaLeitura, idadeDaUltima, passaNoFiltro, atualizarConversa, type FiltroLista } from '../../shared/crm-regras';
import { contarVencidos } from '../../shared/crm-lembretes';
import { acharNoIndice, criarIndice, lembretesDoContato } from '../../shared/crm-contatos';
import { instanteDaUltima } from '../../shared/crm-clientes';
import { repositorioPadrao } from '../../shared/repositorio-local';
import type { ItemVisto, RepositorioContatos } from '../../shared/repositorio';
import type { AbaId, Conversa, RefContato } from '../../shared/crm-tipos';
import { textoDoCampo } from '../dom';
import { lerLinhaCrm } from '../extrair';
import { linhasDaLista } from '../lista';
import { nomeDaConversaAberta } from '../execucao';
import { refDaConversaAberta } from './conversa-aberta';
import { esperarAte } from '../dom';
import { encontrar, encontrarTodos } from '../selectors';
import { consumirAcaoPendente, abrirConversaComRascunho } from './acao-pendente';
import { Barra } from './barra';
import { Cabecalho } from './cabecalho';
import { Estado } from './estado';
import { aplicarFiltroNaLista } from './filtro-lista';
import { BotaoRespostas } from './painel-respostas';
import { consultaDeAtalho } from '../../shared/crm-modelos';
import { abrirFiltroEtiquetas, abrirPainelCliente } from './painel-cliente';
import { abrirCentral, abrirPainelNovoLembrete, type ContextoLembretes } from './painel-lembrete';
import { fecharPopover, popoverAbertoEm } from './popover';
import { anotarLinha, removerSelo } from './linha-extra';
import { rolarELer } from './rolagem';
import { avisarUmaVez } from './ui';

export interface OpcoesCrm {
  agora?: () => Date;
  /** Espera (ms) entre a última mudança no DOM e a releitura da lista. */
  debounceMs?: number;
  /** Intervalo da releitura periódica (tempos decorridos, lembretes vencidos). 0 desliga. */
  periodicoMs?: number;
  /** Onde ficam os dados (padrão: chrome.storage.local via RepositorioLocal). */
  repositorio?: RepositorioContatos;
}

export interface ControladorCrm {
  estado: Estado;
  /** Relê a lista, grava o estado e redesenha. Seguro: nunca lança. */
  ciclo: () => void;
  parar: () => void;
}

const MAX_ESPERA_MS = 1000;

/** A busca do WhatsApp está com texto: a lista mostra resultados de busca, não as conversas. */
function buscaAtiva(): boolean {
  const caixa = encontrar(document, 'caixaBusca');
  return caixa != null && textoDoCampo(caixa).trim() !== '';
}

/** A visão "Arquivadas" da coluna esquerda está aberta (o título dela aparece no cabeçalho). */
function emArquivadas(): boolean {
  for (const raiz of encontrarTodos(document, 'cabecalhoColunaEsquerda')) {
    for (const f of raiz.querySelectorAll<HTMLElement>('*')) {
      if (f.children.length > 0) continue;
      if (/^(arquivadas|archived)$/i.test((f.textContent ?? '').replace(/\s+/g, ' ').trim())) return true;
    }
  }
  return false;
}

export async function iniciarCrm(op: OpcoesCrm = {}): Promise<ControladorCrm> {
  const agoraFn = op.agora ?? (() => new Date());
  const repo = op.repositorio ?? repositorioPadrao();
  const estado = new Estado(repo);
  await estado.iniciar(() => void consumirAcaoPendente(repo));
  const barra = new Barra();
  const cabecalho = new Cabecalho();
  const botaoRespostas = new BotaoRespostas({ estado, nomeDaConversa: nomeDaConversaAberta, caixa: () => encontrar(document, 'caixaMensagem') });

  let lendoLista = false;
  let pararLeitura = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let primeiroPedido = 0;
  let encerrado = false;
  const inicio = Date.now();

  const ctxLembretes: ContextoLembretes = { estado, agora: agoraFn, abrirConversa: ({ nome, rascunho }) => void abrirConversaComRascunho(nome, rascunho) };

  /** Mantém os botões do cabeçalho da conversa aberta (e fecha o painel se a conversa mudou). */
  function atualizarCabecalho(agora: Date, indice: ReturnType<typeof criarIndice>): void {
    const ref = refDaConversaAberta();
    const header = encontrar(document, 'cabecalhoConversa');
    if (!header || !ref) {
      cabecalho.remover();
      return;
    }
    const contato = acharNoIndice(indice, ref);
    // Qual conversa está aberta (para fechar o painel ao trocar de conversa): a chave da lista, que
    // não muda quando o contato passa a existir (ao salvar a primeira nota, por exemplo).
    const identidade = chaveDaConversa(ref.nome);
    if (cabecalho.chaveAtual && cabecalho.chaveAtual !== identidade) fecharPopover();
    // Telefone lido do HTML que o contato ainda não tinha: guarda (e junta duplicados pelo telefone).
    if (contato && ref.telefone && !contato.telefone) void estado.fazer((r) => r.registrarVistos([{ ref }]));
    const pendentes = contato ? lembretesDoContato(estado.dados, contato.id) : [];
    cabecalho.atualizar(
      header,
      { nome: ref.nome, chave: identidade, lembretes: pendentes.length, anotacoes: contato?.notas.length ?? 0, vencido: pendentes.some((l) => l.venceEm <= agora.getTime()) },
      {
        abrirLembrete: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirPainelNovoLembrete(ancora, ctxLembretes, ref)),
        abrirCliente: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirPainelCliente(ancora, { estado, agora: agoraFn }, ref)),
      },
    );
  }

  const filtroAtual = (): FiltroLista => {
    const c = estado.dados.config;
    return { aba: c.aba, diasSemResposta: c.diasSemResposta, etiquetas: c.filtroEtiquetas };
  };

  function mudarConfig(parcial: Partial<{ aba: AbaId; diasSemResposta: number | null; filtroEtiquetas: string[] }>): void {
    estado.dados.config = { ...estado.dados.config, ...parcial };
    void estado.repo.salvarConfig(estado.dados.config).catch((e: unknown) => avisarUmaVez('config', 'Não consegui gravar o filtro.', e));
    ciclo();
  }

  function dispensar(conversa: Conversa): void {
    const ref: RefContato = { nome: conversa.nome, telefone: conversa.telefone };
    void estado.fazer((r) => r.dispensar(ref, conversa.ass)).then(() => ciclo());
  }

  /** Atualiza as conversas guardadas com o que a lista mostra agora. */
  function lerEstado(elementos: HTMLElement[], arquivadas: boolean): void {
    const agora = agoraFn();
    let mudou = false;
    const indice = criarIndice(estado.dados);
    const vistos: ItemVisto[] = [];
    for (const el of elementos) {
      const leitura = lerLinhaCrm(el);
      if (!leitura || leitura.digitando) continue;
      const anterior = estado.dados.conversas[leitura.chave];
      const nova = atualizarConversa(anterior, leitura, agora, arquivadas);
      if (anterior && JSON.stringify({ ...anterior, vistaEm: 0 }) === JSON.stringify({ ...nova, vistaEm: 0 }) && agora.getTime() - anterior.vistaEm < 6 * 3_600_000) continue;
      estado.dados.conversas[leitura.chave] = nova;
      mudou = true;
      // Contato que o usuário já anotou: guarda o telefone aprendido e o instante da última mensagem.
      const ref = { nome: nova.nome, telefone: nova.telefone };
      const contato = acharNoIndice(indice, ref);
      const instante = instanteDaUltima(nova);
      if (contato && ((nova.telefone && !contato.telefone) || instante > (contato.ultimoContatoEm ?? 0))) vistos.push({ ref, ultimoContatoEm: instante });
    }
    if (mudou) estado.conversasMudaram();
    if (vistos.length > 0) void estado.fazer((r) => r.registrarVistos(vistos)).catch((e: unknown) => avisarUmaVez('vistos', 'Não consegui gravar o último contato.', e));
  }

  function ciclo(): void {
    if (encerrado) return;
    try {
      const lista = encontrar(document, 'painelLateral');
      if (!lista) {
        // O WhatsApp demora a montar a tela: só vira aviso se continuar sem lista depois de 30 s.
        if (Date.now() - inicio > 30_000) avisarUmaVez('lista', 'Lista de conversas não encontrada (seletor painelLateral); o CRM fica em silêncio até ela aparecer.');
        barra.remover();
        return;
      }
      barra.garantirNoLugar(lista);
      const agora = agoraFn();
      const busca = buscaAtiva();
      const arquivadas = emArquivadas();
      const elementos = linhasDaLista();
      if (!busca) lerEstado(elementos, arquivadas);

      if (elementos.length > 0 && !elementos.some((el) => encontrar(el, 'tituloLinha'))) {
        avisarUmaVez('titulo', 'Não achei o nome das conversas nas linhas (seletor tituloLinha); contadores e filtros ficam parados.');
      }

      const dados = estado.dados;
      const indice = criarIndice(dados);
      const contatoDe = (c: Conversa) => acharNoIndice(indice, { nome: c.nome, telefone: c.telefone });
      const conversas = Object.values(dados.conversas);
      const filtro = filtroAtual();
      const filtroLigado = !busca && !arquivadas && !lendoLista && (filtro.aba !== 'todas' || filtro.etiquetas.length > 0);

      const leituras = elementos.map((el) => {
        const l = lerLinhaCrm(el);
        return { el, conversa: l ? dados.conversas[l.chave] : undefined };
      });
      aplicarFiltroNaLista(
        leituras.map(({ el, conversa }) => ({ el, mostrar: !filtroLigado || !conversa || passaNoFiltro(conversa, contatoDe(conversa), filtro, agora) })),
        filtroLigado,
      );
      for (const { el, conversa } of leituras) {
        if (!conversa || !filtroLigado || (filtro.aba !== 'precisa' && filtro.aba !== 'aguardando')) {
          removerSelo(el);
          continue;
        }
        const k = classificar(conversa, contatoDe(conversa));
        anotarLinha(
          el,
          { idade: idadeDaUltima(conversa, agora).texto, aoDispensar: filtro.aba === 'precisa' && k.precisa ? () => dispensar(conversa) : undefined },
          `${conversa.chave}|${conversa.ass}`,
        );
      }

      atualizarCabecalho(agora, indice);
      botaoRespostas.posicionar(encontrar(document, 'caixaMensagem'));

      barra.render(
        {
          aba: filtro.aba,
          contagens: contar(conversas, contatoDe),
          dias: filtro.diasSemResposta,
          etiquetasMarcadas: filtro.etiquetas.length,
          vencidos: contarVencidos(dados.lembretes, agora),
          emArquivadas: arquivadas,
          lendoLista,
          avisos: diagnosticoDaLeitura(conversas.filter((c: Conversa) => !c.arquivada)),
        },
        {
          escolherAba: (id) => mudarConfig({ aba: id }),
          escolherDias: (dias) => mudarConfig({ diasSemResposta: dias }),
          abrirEtiquetas: (ancora) =>
            popoverAbertoEm(ancora)
              ? fecharPopover()
              : abrirFiltroEtiquetas(ancora, { estado, marcadas: () => estado.dados.config.filtroEtiquetas, aoMudar: (ids) => mudarConfig({ filtroEtiquetas: ids }) }),
          abrirLembretes: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirCentral(ancora, ctxLembretes)),
          lerLista: () => void lerListaToda(),
        },
      );
    } catch (e) {
      avisarUmaVez('ciclo', 'Falha ao atualizar o CRM; seguindo em silêncio.', e);
    } finally {
      observador.takeRecords(); // descarta as mudanças de DOM que nós mesmos acabamos de fazer
    }
  }

  async function lerListaToda(): Promise<void> {
    if (lendoLista) {
      pararLeitura = true;
      return;
    }
    lendoLista = true;
    pararLeitura = false;
    ciclo();
    try {
      await rolarELer(() => ciclo(), () => pararLeitura || encerrado);
    } catch (e) {
      avisarUmaVez('rolagem', 'Falha ao rolar a lista de conversas.', e);
    } finally {
      lendoLista = false;
      ciclo();
    }
  }

  const observador = new MutationObserver(agendar);
  function agendar(): void {
    if (encerrado) return;
    const agora = Date.now();
    if (primeiroPedido === 0) primeiroPedido = agora;
    if (timer) clearTimeout(timer);
    const espera = Math.min(op.debounceMs ?? 250, Math.max(0, MAX_ESPERA_MS - (agora - primeiroPedido)));
    timer = setTimeout(() => {
      timer = null;
      primeiroPedido = 0;
      ciclo();
    }, espera);
  }

  // Digitar "/atalho" na caixa de mensagem abre o menu de respostas rápidas (só escuta; não escreve nada).
  const aoDigitar = (e: Event): void => {
    try {
      const caixa = encontrar(document, 'caixaMensagem');
      if (!caixa || !(e.target instanceof Node) || !caixa.contains(e.target)) return;
      botaoRespostas.aoDigitar(consultaDeAtalho(textoDoCampo(caixa)));
    } catch (erro) {
      avisarUmaVez('atalho', 'Falha ao ler o atalho digitado.', erro);
    }
  };
  document.addEventListener('input', aoDigitar, true);
  window.addEventListener('resize', ciclo);

  observador.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
  const removerOuvinte = estado.ouvir(() => agendar());
  const periodico = op.periodicoMs === 0 ? null : setInterval(ciclo, op.periodicoMs ?? 30_000);
  ciclo();
  // Pedido pendente (clique na notificação com o WhatsApp Web ainda carregando): espera a lista e executa.
  void esperarAte(() => encontrar(document, 'painelLateral'), 60_000, 500).then((lista) => (lista && !encerrado ? consumirAcaoPendente(repo) : undefined));

  return {
    estado,
    ciclo,
    parar: () => {
      encerrado = true;
      observador.disconnect();
      removerOuvinte();
      if (timer) clearTimeout(timer);
      if (periodico) clearInterval(periodico);
      barra.remover();
      cabecalho.remover();
      botaoRespostas.remover();
      document.removeEventListener('input', aoDigitar, true);
      window.removeEventListener('resize', ciclo);
      fecharPopover();
      estado.encerrar();
    },
  };
}
