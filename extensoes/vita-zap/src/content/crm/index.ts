// Controlador do CRM no WhatsApp Web: lê a lista de conversas (só DOM), guarda o estado, desenha
// a barra de abas e filtra a lista. Se algum seletor falhar, degrada em silêncio (um console.warn).
//
// Nada aqui envia mensagem: botões nossos só filtram, anotam e colam rascunho.

import { chaveDaConversa, classificar, contar, diagnosticoDaLeitura, idadeDaUltima, passaNoFiltro, atualizarConversa, type FiltroLista } from '../../shared/crm-regras';
import { contarVencidos } from '../../shared/crm-lembretes';
import { dispensarConversa, reativarConversa } from '../../shared/crm-contatos';
import type { AbaId, Conversa } from '../../shared/crm-tipos';
import { textoDoCampo } from '../dom';
import { lerLinhaCrm } from '../extrair';
import { linhasDaLista } from '../lista';
import { nomeDaConversaAberta } from '../execucao';
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
  const estado = new Estado();
  await estado.iniciar(() => void consumirAcaoPendente());
  const barra = new Barra();
  const cabecalho = new Cabecalho();
  const botaoRespostas = new BotaoRespostas({ estado, nomeDaConversa: nomeDaConversaAberta, caixa: () => encontrar(document, 'caixaMensagem') });

  let lendoLista = false;
  let pararLeitura = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let primeiroPedido = 0;
  let encerrado = false;
  const inicio = Date.now();

  const ctxLembretes: ContextoLembretes = { estado, agora: agoraFn, abrirConversa: (nome, rascunho) => void abrirConversaComRascunho(nome, rascunho) };

  /** Mantém os botões do cabeçalho da conversa aberta (e fecha o painel se a conversa mudou). */
  function atualizarCabecalho(agora: Date): void {
    const nome = nomeDaConversaAberta();
    const header = encontrar(document, 'cabecalhoConversa');
    if (!header || !nome) {
      cabecalho.remover();
      return;
    }
    const chave = chaveDaConversa(nome);
    if (cabecalho.chaveAtual && cabecalho.chaveAtual !== chave) fecharPopover();
    const dados = estado.dados;
    const pendentes = dados.lembretes.filter((l) => l.chave === chave && l.status !== 'concluido');
    cabecalho.atualizar(
      header,
      { nome, chave, lembretes: pendentes.length, anotacoes: dados.contatos[chave]?.notas.length ?? 0, vencido: pendentes.some((l) => l.venceEm <= agora.getTime()) },
      {
        abrirLembrete: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirPainelNovoLembrete(ancora, ctxLembretes, nome, chave)),
        abrirCliente: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirPainelCliente(ancora, { estado, agora: agoraFn, dispensar, reativar }, nome, chave)),
      },
    );
  }

  const filtroAtual = (): FiltroLista => {
    const c = estado.dados.config;
    return { aba: c.aba, diasSemResposta: c.diasSemResposta, etiquetas: c.filtroEtiquetas };
  };

  function mudarConfig(parcial: Partial<{ aba: AbaId; diasSemResposta: number | null; filtroEtiquetas: string[] }>): void {
    estado.dados.config = { ...estado.dados.config, ...parcial };
    estado.mudou('config');
    ciclo();
  }

  function dispensar(chave: string): void {
    if (dispensarConversa(estado.dados, chave, agoraFn().getTime())) estado.mudou('contatos');
    void estado.salvarAgora();
    ciclo();
  }

  function reativar(chave: string): void {
    reativarConversa(estado.dados, chave, agoraFn().getTime());
    estado.mudou('contatos');
    void estado.salvarAgora();
    ciclo();
  }

  /** Atualiza as conversas guardadas com o que a lista mostra agora. */
  function lerEstado(elementos: HTMLElement[], arquivadas: boolean): void {
    const agora = agoraFn();
    let mudou = false;
    for (const el of elementos) {
      const leitura = lerLinhaCrm(el);
      if (!leitura || leitura.digitando) continue;
      const anterior = estado.dados.conversas[leitura.chave];
      const nova = atualizarConversa(anterior, leitura, agora, arquivadas);
      if (anterior && JSON.stringify({ ...anterior, vistaEm: 0 }) === JSON.stringify({ ...nova, vistaEm: 0 }) && agora.getTime() - anterior.vistaEm < 6 * 3_600_000) continue;
      estado.dados.conversas[leitura.chave] = nova;
      mudou = true;
    }
    if (mudou) estado.mudouSilencioso('conversas');
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
      const conversas = Object.values(dados.conversas);
      const filtro = filtroAtual();
      const filtroLigado = !busca && !arquivadas && !lendoLista && (filtro.aba !== 'todas' || filtro.etiquetas.length > 0);

      const leituras = elementos.map((el) => {
        const l = lerLinhaCrm(el);
        return { el, conversa: l ? dados.conversas[l.chave] : undefined };
      });
      aplicarFiltroNaLista(
        leituras.map(({ el, conversa }) => ({ el, mostrar: !filtroLigado || !conversa || passaNoFiltro(conversa, dados.contatos[conversa.chave], filtro, agora) })),
        filtroLigado,
      );
      for (const { el, conversa } of leituras) {
        if (!conversa || !filtroLigado || (filtro.aba !== 'precisa' && filtro.aba !== 'aguardando')) {
          removerSelo(el);
          continue;
        }
        const contato = dados.contatos[conversa.chave];
        const k = classificar(conversa, contato);
        anotarLinha(
          el,
          { idade: idadeDaUltima(conversa, agora).texto, aoDispensar: filtro.aba === 'precisa' && k.precisa ? () => dispensar(conversa.chave) : undefined },
          `${conversa.chave}|${conversa.ass}`,
        );
      }

      atualizarCabecalho(agora);
      botaoRespostas.posicionar(encontrar(document, 'caixaMensagem'));

      barra.render(
        {
          aba: filtro.aba,
          contagens: contar(conversas, dados.contatos),
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
  void esperarAte(() => encontrar(document, 'painelLateral'), 60_000, 500).then((lista) => (lista && !encerrado ? consumirAcaoPendente() : undefined));

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
