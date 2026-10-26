// Controlador do CRM no WhatsApp Web: lê a lista de conversas (só DOM), guarda o estado, desenha
// a barra de abas e filtra a lista. Se algum seletor falhar, degrada em silêncio (um console.warn).
//
// Nada aqui envia mensagem: botões nossos só filtram, anotam e colam rascunho.

import { chaveDaConversa, classificar, diagnosticoDaLeitura, idadeDaUltima, passaNoFiltro, atualizarConversa, ehContatoCliente, type FiltroLista } from '../../shared/crm-regras';
import { contarVencidos } from '../../shared/crm-lembretes';
import { acharNoIndice, criarIndice, lembretesDoContato } from '../../shared/crm-contatos';
import { instanteDaUltima } from '../../shared/crm-clientes';
import { repositorioPadrao } from '../../shared/repositorio-local';
import type { ItemVisto, RepositorioContatos } from '../../shared/repositorio';
import type { ConfigCrm, Conversa, PedidoPainel, RefContato } from '../../shared/crm-tipos';
import { resumoAcompanhando } from '../../shared/crm-acompanhar';
import { abaEfetiva, abasVisiveis, contarAbas, filtroDaConfig, filtroLigado as haFiltro, idDaPersonalizada, temNovidade, todasAsAbas } from '../../shared/crm-abas';
import { novoId } from '../../shared/crm-store';
import { normalizarTexto } from '../../shared/nomes';
import { textoDoCampo } from '../dom';
import { lerLinhaCrm } from '../extrair';
import { linhasDaLista } from '../lista';
import { nomeDaConversaAberta } from '../execucao';
import { refDaConversaAberta } from './conversa-aberta';
import { esperarAte } from '../dom';
import { encontrar, encontrarTodos } from '../selectors';
import { abrirConversaComRascunho, abrirConversaPorTelefoneNaPagina, consumirAcaoPendente } from './acao-pendente';
import { ligarTelefones } from './telefone-conhecido';
import { lerTelefoneDosDadosDoContato } from './dados-do-contato';
import { FaixaLead, type AcoesFaixa } from './faixa-lead';
import { abrirConverter, abrirCriarLead, alternarAcompanhar, abrirEtiquetas, abrirReagendar, abrirRegistrarContato, abrirVincular, type ContextoLead } from './painel-lead';
import { ehLeadsCRM, type Acompanhamento, type EstadoLead, type LeadsCRM, type MotivoAcompanhando } from '../../shared/leads';
import { Barra } from './barra';
import { BarraSuperior, iniciaisDe, type ContaTopo } from './barra-superior';
import { abrirAjuda, abrirAjustesFiltro, abrirMenuConta, abrirNovaAba, type ContextoAbas } from './painel-abas';
import { Cabecalho } from './cabecalho';
import { Estado } from './estado';
import { aplicarFiltroNaLista } from './filtro-lista';
import { abrirMenuRespostas, BotaoRespostas } from './painel-respostas';
import { consultaDeAtalho } from '../../shared/crm-modelos';
import { abrirFiltroEtiquetas, abrirPainelCliente } from './painel-cliente';
import { abrirCentral, abrirPainelNovoLembrete, type ContextoLembretes } from './painel-lembrete';
import { fecharPopover, mostrarAviso, popoverAbertoEm } from './popover';
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
  // Extensão atualizada (↻) com a aba aberta: o Chrome injeta um script novo, mas o antigo continua vivo e
  // desenhando a barra dele (aparecia duplicada). O novo apaga o que sobrou; o antigo se desliga sozinho no ciclo.
  for (const velho of document.querySelectorAll('[data-vita-zap]')) velho.remove();
  let pararTudo: (() => void) | null = null;
  const repo = op.repositorio ?? repositorioPadrao();
  const estado = new Estado(repo);
  await estado.iniciar(() => void consumirAcaoPendente(repo));
  ligarTelefones(estado);
  const barra = new Barra();
  const topo = new BarraSuperior();
  const cabecalho = new Cabecalho();
  // Lead do CRM Lembretes (só existe com login; sem login a faixa não aparece e tudo segue local).
  const leads: LeadsCRM | null = ehLeadsCRM(repo) ? repo : null;
  const faixa = new FaixaLead();
  // `em` = quando a conversa pediu o lead ao service worker (quem decide se vai ao CRM é o ServicoCrm: cache de 30 min por contato).
  const leadCache: { chave: string; estado: EstadoLead | null; em: number } = { chave: '', estado: null, em: 0 };
  const ctxRespostas = { estado, nomeDaConversa: nomeDaConversaAberta, caixa: () => encontrar(document, 'caixaMensagem') };
  const botaoRespostas = new BotaoRespostas(ctxRespostas, (ancora) => abrirLembreteDaCaixa(ancora));
  // Estado da barra superior: conta do CRM (leitura local no service worker, sem rede), última contagem por aba, base do ponto verde.
  let contaTopo: ContaTopo = { tipo: 'oculta' };
  let contaEm = 0;
  // Lista "Acompanhar" (etiqueta do CRM): só o que o service worker já guardou; ir ao CRM só ao clicar na aba (máx. 1 a cada 15 min).
  let acomp: Acompanhamento | null = null;
  let chavesAcomp: ReadonlySet<string> = new Set();
  let acompOcupado = false;
  let contagensAtuais: Record<string, number> = {};
  const baseNovidade = new Map<string, number>();

  let lendoLista = false;
  let pararLeitura = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let primeiroPedido = 0;
  let encerrado = false;
  const inicio = Date.now();

  const ctxLembretes: ContextoLembretes = { estado, agora: agoraFn, abrirConversa: ({ nome, telefone, rascunho, remoto }) => {
      // Lembrete do CRM: pelo telefone (o nome do lead nem sempre é o salvo no WhatsApp). Os locais seguem por nome.
      if (remoto && telefone) {
        void abrirConversaPorTelefoneNaPagina(telefone, nome);
        return;
      }
      void abrirConversaComRascunho(nome, rascunho, telefone);
    },
  };

  /** `cache` = leitura local no service worker (sem rede). `aba` = clique na aba Acompanhar (o serviço limita a 1 consulta por 15 min). */
  function lerAcompanhando(motivo: MotivoAcompanhando): void {
    if (!leads || encerrado) return;
    leads.acompanhando(motivo).then(
      (r) => {
        acomp = r.ok ? r : null;
        chavesAcomp = new Set(r.ok ? r.chaves : []);
        if (!encerrado) ciclo();
      },
      () => undefined,
    );
  }

  function buscarLead(ref: RefContato, chave: string): void {
    if (!leads) return;
    leadCache.em = Date.now();
    leads
      .leadDoContato(ref)
      .then(
        (e) => {
          if (leadCache.chave === chave) leadCache.estado = e;
        },
        (e: unknown) => {
          if (leadCache.chave === chave) leadCache.estado = { tipo: 'erro', erro: { tipo: 'rede', mensagem: e instanceof Error && e.message ? e.message : 'A extensão não respondeu.' } };
          avisarUmaVez('lead', 'Não consegui consultar o lead no CRM.', e);
        },
      )
      .finally(() => {
        if (!encerrado) ciclo();
      });
  }

  /**
   * Faixa do lead do CRM: pede o lead UMA vez ao abrir a conversa (o ciclo de 30 s e o MutationObserver só
   * redesenham com o que já está em memória, nunca fazem rede). Sem login, confere de novo a cada 20 s (sem rede)
   * para a faixa aparecer logo depois do login.
   */
  function atualizarFaixa(header: HTMLElement | null, ref: RefContato | null, agora: Date): void {
    if (!leads) return;
    // Só contatos com "CLIENTE" no nome (padrão do dono) ganham faixa e consulta ao CRM: contato pessoal
    // não polui a tela nem acorda o banco.
    if (!header || !ref || !ehContatoCliente(ref.nome)) {
      faixa.remover();
      return;
    }
    const chave = `${chaveDaConversa(ref.nome)}|${ref.telefone ?? ''}`;
    if (leadCache.chave !== chave) {
      Object.assign(leadCache, { chave, estado: null, em: 0 });
      buscarLead(ref, chave);
    } else if (leadCache.estado?.tipo === 'sem-login' && Date.now() - leadCache.em > 20_000) {
      buscarLead(ref, chave);
    }
    const sobre = (abrir: (a: HTMLElement) => void) => (a: HTMLElement) => (popoverAbertoEm(a) ? fecharPopover() : abrir(a));
    const ctxLead: ContextoLead = {
      leads,
      agora: agoraFn,
      lerTelefoneDosDados: lerTelefoneDosDadosDoContato,
      aplicar: (lead, pendente) => {
        const atual = leadCache.estado?.tipo === 'lead' ? leadCache.estado.pendentes : 0;
        leadCache.estado = { tipo: 'lead', lead, desatualizado: false, pendentes: pendente ? atual + 1 : 0 };
        lerAcompanhando('cache'); // a ação pode ter posto/tirado o lead da lista (leitura local, sem rede)
        ciclo();
      },
      // A ação do usuário já devolveu o lead atualizado (aplicar): não há nova consulta.
      recarregar: () => ciclo(),
    };
    const lead = leadCache.estado?.tipo === 'lead' ? leadCache.estado.lead : null;
    const acoes: AcoesFaixa = {
      registrarContato: sobre((a) => abrirRegistrarContato(a, ctxLead, ref)),
      reagendar: sobre((a) => lead && abrirReagendar(a, ctxLead, ref, lead)),
      etiquetas: sobre((a) => lead && abrirEtiquetas(a, ctxLead, ref, lead)),
      converter: sobre((a) => abrirConverter(a, ctxLead, ref)),
      acompanhar: () => {
        if (!lead || acompOcupado) return;
        acompOcupado = true;
        void alternarAcompanhar(ctxLead, ref, lead).finally(() => {
          acompOcupado = false;
        });
      },
      vincular: sobre((a) => abrirVincular(a, ctxLead, ref)),
      criar: sobre((a) => abrirCriarLead(a, ctxLead, ref)),
      escolher: sobre((a) => abrirVincular(a, ctxLead, ref, leadCache.estado?.tipo === 'varios' ? leadCache.estado.candidatos : [])),
    };
    faixa.atualizar(header, leadCache.estado, agora, acoes);
  }

  /** Mantém os botões do cabeçalho da conversa aberta (e fecha o painel se a conversa mudou). */
  function atualizarCabecalho(agora: Date, indice: ReturnType<typeof criarIndice>): void {
    const ref = refDaConversaAberta();
    const header = encontrar(document, 'cabecalhoConversa');
    if (!header || !ref) {
      cabecalho.remover();
      atualizarFaixa(null, null, agora);
      return;
    }
    atualizarFaixa(header, ref, agora);
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

  const barraSuperiorLigada = (): boolean => estado.dados.config.barraSuperior !== false;
  const logadoNoCrm = (): boolean => contaTopo.tipo === 'logado';
  const filtroAtual = (): FiltroLista => filtroDaConfig(estado.dados.config, !barraSuperiorLigada(), logadoNoCrm() ? chavesAcomp : null);

  function mudarConfig(parcial: Partial<ConfigCrm>): void {
    estado.dados.config = { ...estado.dados.config, ...parcial };
    void estado.repo.salvarConfig(estado.dados.config).catch((e: unknown) => avisarUmaVez('config', 'Não consegui gravar o filtro.', e));
    ciclo();
  }

  /** Lê a conta do CRM (cache local no service worker: não há rede). No máximo uma vez a cada 5 s. */
  function lerConta(forcar = false): void {
    if (!leads || encerrado) return;
    if (!forcar && Date.now() - contaEm < 5000) return;
    contaEm = Date.now();
    leads.conta().then(
      (c) => {
        contaTopo = c.usuario ? { tipo: 'logado', nome: c.usuario.name, email: c.usuario.email, iniciais: iniciaisDe(c.usuario.name, c.usuario.email) } : { tipo: 'sem-login' };
        if (c.usuario) lerAcompanhando('cache');
        else {
          acomp = null;
          chavesAcomp = new Set();
        }
        if (!encerrado) ciclo();
      },
      () => undefined,
    );
  }

  /** Abre o painel lateral na aba pedida: grava o pedido (o painel lê) e avisa o service worker, que abre o painel. */
  function abrirPainel(aba: PedidoPainel['aba']): void {
    mudarConfig({ pedidoPainel: { aba, ts: Date.now() } });
    try {
      void Promise.resolve(chrome.runtime.sendMessage({ vz: 'painel', aba })).catch(() => undefined);
    } catch {
      /* a extensão foi recarregada: o usuário abre o painel pelo ícone */
    }
  }

  /** Ícone de relógio da caixa de digitação: o mesmo popover de lembrete do cabeçalho da conversa. */
  function abrirLembreteDaCaixa(ancora: HTMLElement): void {
    if (popoverAbertoEm(ancora)) return fecharPopover();
    const ref = refDaConversaAberta();
    if (!ref) return mostrarAviso('Abra uma conversa para criar o lembrete.', 'erro');
    abrirPainelNovoLembrete(ancora, ctxLembretes, ref, true);
  }

  const alternarItem = (lista: string[], id: string): string[] => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const ctxAbas: ContextoAbas = {
    config: () => estado.dados.config,
    etiquetas: () => estado.dados.etiquetas,
    criarAba: (a) => {
      const nome = a.nome.trim();
      const c = estado.dados.config;
      const proprias = c.abasPersonalizadas ?? [];
      if (!nome) return 'Dê um nome à aba.';
      if (a.etiquetas.length + a.fases.length === 0) return 'Marque ao menos uma etiqueta ou fase.';
      if (proprias.length >= 30) return 'Limite de 30 abas personalizadas.';
      if (todasAsAbas(c).some((x) => normalizarTexto(x.rotulo) === normalizarTexto(nome))) return 'Já existe uma aba com esse nome.';
      const id = novoId();
      mudarConfig({ abasPersonalizadas: [...proprias, { id, nome, etiquetas: a.etiquetas, fases: a.fases }], aba: idDaPersonalizada(id) });
      return null;
    },
    excluirAba: (id) => {
      const c = estado.dados.config;
      const aba = idDaPersonalizada(id);
      mudarConfig({ abasPersonalizadas: (c.abasPersonalizadas ?? []).filter((x) => x.id !== id), aba: c.aba === aba ? 'todas' : c.aba, abasOcultas: (c.abasOcultas ?? []).filter((x) => x !== aba) });
    },
    escolherDias: (dias) => mudarConfig({ diasSemResposta: dias }),
    alternarGrupos: () => mudarConfig({ ocultarGrupos: estado.dados.config.ocultarGrupos !== true }),
    alternarAbaVisivel: (id) => {
      const c = estado.dados.config;
      const ocultas = alternarItem(c.abasOcultas ?? [], id);
      mudarConfig({ abasOcultas: ocultas, aba: ocultas.includes(c.aba) ? 'todas' : c.aba });
    },
  };

  /** Clique numa aba da barra superior: filtra e zera o ponto verde (guarda quantas conversas ela tinha agora). */
  function escolherAbaTopo(id: string): void {
    const n = contagensAtuais[id] ?? 0;
    baseNovidade.set(id, n);
    if (id === 'acompanhar') lerAcompanhando('aba');
    mudarConfig({ aba: id, abasVistas: { ...(estado.dados.config.abasVistas ?? {}), [id]: n } });
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
    if (scriptOrfao()) {
      pararTudo?.();
      return;
    }
    try {
      const lista = encontrar(document, 'painelLateral');
      if (!lista) {
        // O WhatsApp demora a montar a tela: só vira aviso se continuar sem lista depois de 30 s.
        if (Date.now() - inicio > 30_000) avisarUmaVez('lista', 'Lista de conversas não encontrada (seletor painelLateral); o CRM fica em silêncio até ela aparecer.');
        barra.remover();
        topo.remover();
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
      const filtroLigado = !busca && !arquivadas && !lendoLista && haFiltro(filtro);

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

      const cfg = dados.config;
      contagensAtuais = { ...contarAbas(conversas, contatoDe, cfg), acompanhar: acomp?.leads.length ?? 0 };
      const acompVencidos = acomp ? resumoAcompanhando(acomp.leads, agora).vencidos : 0;
      const vencidos = contarVencidos(dados.lembretes, agora);
      if (barraSuperiorLigada()) {
        topo.garantirNoLugar();
        const ativa = abaEfetiva(cfg, false, logadoNoCrm());
        topo.render(
          {
            abas: abasVisiveis(cfg, logadoNoCrm()).map((a) => {
              const n = contagensAtuais[a.id] ?? 0;
              const salva = cfg.abasVistas?.[a.id];
              const base = salva === undefined ? undefined : Math.min(baseNovidade.get(a.id) ?? salva, salva, n);
              if (base !== undefined) baseNovidade.set(a.id, base);
              return { ...a, n, ativa: a.id === ativa, novidade: temNovidade(n, base), ...(a.id === 'acompanhar' && acompVencidos > 0 ? { alerta: true } : {}) };
            }),
            vencidos,
            conta: contaTopo,
          },
          {
            escolherAba: escolherAbaTopo,
            novaAba: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirNovaAba(ancora, ctxAbas)),
            ajustes: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirAjustesFiltro(ancora, ctxAbas)),
            respostas: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : void abrirMenuRespostas(ancora, ctxRespostas, { acima: false })),
            lembretes: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirCentral(ancora, ctxLembretes)),
            clientes: () => abrirPainel('clientes'),
            ajuda: (ancora) => (popoverAbertoEm(ancora) ? fecharPopover() : abrirAjuda(ancora)),
            conta: (ancora) => {
              if (popoverAbertoEm(ancora)) return fecharPopover();
              if (contaTopo.tipo !== 'logado' || !leads) return abrirPainel('dados');
              abrirMenuConta(ancora, { nome: contaTopo.nome, email: contaTopo.email, abrirPainel: () => abrirPainel('dados'), sair: () => void leads.sair().then(() => lerConta(true), () => undefined) });
            },
          },
        );
      } else {
        topo.remover();
      }

      barra.render(
        {
          compacta: barraSuperiorLigada(),
          aba: abaEfetiva(cfg, !barraSuperiorLigada()),
          contagens: { todas: contagensAtuais.todas, naoLidas: contagensAtuais.naoLidas, precisa: contagensAtuais.precisa, aguardando: contagensAtuais.aguardando },
          dias: filtro.diasSemResposta,
          etiquetasMarcadas: filtro.etiquetas.length,
          vencidos,
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
  window.addEventListener('scroll', agendar, { capture: true, passive: true });
  // Voltou para a aba do WhatsApp (por exemplo depois de entrar no CRM pelo painel): confere a conta (leitura local, sem rede).
  const aoVoltar = (): void => {
    if (document.visibilityState !== 'hidden') lerConta();
  };
  window.addEventListener('focus', aoVoltar);
  document.addEventListener('visibilitychange', aoVoltar);

  observador.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
  const removerOuvinte = estado.ouvir(() => agendar()); // só redesenha: mudança em outra parte não gera consulta ao CRM
  const periodico = op.periodicoMs === 0 ? null : setInterval(ciclo, op.periodicoMs ?? 30_000);
  ciclo();
  lerConta(true);
  // A aba do WhatsApp Web carregou: busca os lembretes do CRM (no máximo 1 por hora; sem login não faz nada).
  if (leads) void leads.sincronizarLembretes('aba-whatsapp').catch(() => undefined);
  // Pedido pendente (clique na notificação com o WhatsApp Web ainda carregando): espera a lista e executa.
  void esperarAte(() => encontrar(document, 'painelLateral'), 60_000, 500).then((lista) => (lista && !encerrado ? consumirAcaoPendente(repo) : undefined));

  const controlador: ControladorCrm = {
    estado,
    ciclo,
    parar: () => {
      encerrado = true;
      ligarTelefones(null);
      observador.disconnect();
      removerOuvinte();
      if (timer) clearTimeout(timer);
      if (periodico) clearInterval(periodico);
      barra.remover();
      topo.remover();
      cabecalho.remover();
      faixa.remover();
      botaoRespostas.remover();
      document.removeEventListener('input', aoDigitar, true);
      window.removeEventListener('resize', ciclo);
      window.removeEventListener('scroll', agendar, true);
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoVoltar);
      fecharPopover();
      estado.encerrar();
    },
  };
  pararTudo = controlador.parar;
  return controlador;
}

/** Script de uma versão anterior da extensão (o Chrome tirou o `runtime.id` dele): deve se desligar. */
function scriptOrfao(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && 'id' in chrome.runtime && !chrome.runtime.id;
  } catch {
    return true;
  }
}
