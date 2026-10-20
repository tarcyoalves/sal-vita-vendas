// Condutor da campanha.
//
// MODO MANUAL (padrão, "uma tecla"): checa a política → abre o próximo contato e cola o texto →
// ESPERA o usuário apertar Enter → o content script avisa que a mensagem saiu → registra →
// espera o intervalo → "Próximo pronto" → o USUÁRIO clica em Abrir próximo (0.2: nada abre
// sozinho depois do intervalo, para não trocar a conversa debaixo de quem está digitando).
// Neste modo o executor nunca pede envio: o pedido `enviarAutomatico` só existe no caminho
// `iniciarContagem → concluirContagem`, que só roda com o modo automático ligado.
//
// MODO AUTOMÁTICO (0.3.0, opt-in na aba Dados; viola os Termos do WhatsApp): depois do intervalo
// abre o próximo sozinho (se o usuário não está digitando), cola, mostra uma contagem de 8 s
// com Cancelar, emite um token de uso único e pede o envio; confirma pelo detector em 20 s.
//
// 0.2: o item colado fica gravado no IndexedDB (`emAndamento`). Se o painel fechar ou
// recarregar, ao retomar o executor primeiro pergunta ao WhatsApp se já saiu mensagem nossa
// nova naquela conversa — e nunca cola de novo no mesmo contato.

import {
  type Campanha,
  type ItemCampanha,
  marcarItem,
  terminouComProblemas,
  proximoPendente,
  textoDoItem,
} from '../shared/campanha';
import { diasSemRepetir, ultimoEnvioPorChave } from '../shared/filtros';
import { diferencaDias, hojeNoFuso } from '../shared/datas';
import {
  type Banco,
  gravarEmAndamento,
  lerConfig,
  lerEmAndamento,
  lerAutomatico,
  lerMeuNome,
  limparEmAndamento,
  listarEnvios,
  listarNaoEnviar,
  marcarNaoEnviar,
  registrarEnvio,
  salvarAutomatico,
  salvarCampanha,
  salvarMeuNome,
} from '../shared/banco';
import { configAuto, emitirToken, sortearEspera } from '../shared/automatico';
import { AUTO } from '../shared/constantes';
import { type NovoEvento, resumirPagina, resumirResposta } from '../shared/diagnostico';
import type { EventoConteudo, PedidoConteudo, PendenciaEnvio, RespostaConteudo } from '../shared/mensagens';
import { contarEnviosHoje, podeAbrirProximo, sortearIntervaloSeg, ultimoEnvioParaIntervalo } from '../shared/politica';
import { normalizarParaComparar, validarModelo } from '../shared/texto';

export interface DependenciasExecutor {
  db: Banco;
  pedir: (pedido: PedidoConteudo, trazerParaFrente?: boolean) => Promise<RespostaConteudo>;
  agora: () => Date;
  aleatorio: () => number;
  /** Agenda `fn` para daqui a `ms`; devolve a função que cancela. */
  agendar: (fn: () => void, ms: number) => () => void;
  /** Registro de diagnóstico (opcional). Nunca recebe texto de mensagem. */
  diagnostico?: { registrar: (e: NovoEvento) => void };
}

export type FaseExecucao = 'parada' | 'abrindo' | 'aguardando_envio' | 'contagem' | 'confirmando' | 'intervalo' | 'proximo_pronto' | 'concluida';

/** Item que ficou colado/em andamento (de uma sessão anterior do painel) sem decisão. */
export interface ItemEmAndamento {
  chave: string;
  nome: string;
  texto: string;
}

export interface EstadoExecutor {
  campanha: Campanha;
  fase: FaseExecucao;
  mensagem: string | null;
  itemAtual: ItemCampanha | null;
  /** Quando o intervalo libera o próximo (epoch ms). */
  liberaEm: number | null;
  enviosHoje: number;
  tetoDiario: number;
  emAndamento: ItemEmAndamento | null;
  /** Erro geral (não de um contato) que pausou a campanha, com o código — para o alerta do painel. */
  erroGeral: { nome: string; codigo: string; mensagem: string } | null;
  /** Modo automático ligado (lido do banco a cada passo). */
  automatico: boolean;
  /** O automático foi desligado sozinho (freio/aviso do WhatsApp): texto do alerta. */
  alertaAutomatico: string | null;
}

export type AcaoManual = 'pulado' | 'nao_cliente' | 'problema' | 'nao_enviar';

/**
 * Quem pediu para avançar: o usuário (clique), o fluxo (envio detectado) ou o fim do intervalo
 * (`timer_auto`: só abre sozinho se o modo automático continua ligado).
 */
type Origem = 'usuario' | 'automatico' | 'timer_auto';

/** Erros do content script que indicam problema geral (não do contato): pausam sem marcar ninguém. */
const ERROS_GERAIS = new Set(['seletor', 'nao_pronto', 'ocupado', 'interno']);

/**
 * Erros de conferência que acontecem ANTES de colar o texto. Nada foi colado nem enviado, então
 * o contato é pulado para revisão e o erro NÃO conta nos "problemas seguidos" do freio. O freio
 * conta só falhas de depois de colar/enviar (botao_enviar_ausente, envio_nao_confirmado,
 * colar_falhou, texto_alterado, avisos do WhatsApp…).
 */
const ERROS_ANTES_DE_COLAR = new Set(['nao_confirmado', 'ambiguo', 'grupo', 'caixa_ocupada', 'usuario_digitando']);

export const MENSAGEM_PROXIMO_PRONTO = 'Próximo pronto — clique em Abrir próximo quando terminar o que está fazendo no WhatsApp.';

export class Executor {
  private estado: EstadoExecutor;
  private readonly ouvintes = new Set<(e: EstadoExecutor) => void>();
  private cancelarTimer: (() => void) | null = null;
  private ativo = false;
  private avancando = false;
  private seqToken = 0;

  constructor(private readonly deps: DependenciasExecutor, campanha: Campanha) {
    this.estado = {
      campanha,
      fase: campanha.status === 'concluida' ? 'concluida' : 'parada',
      mensagem: campanha.motivoPausa,
      itemAtual: null,
      liberaEm: null,
      enviosHoje: 0,
      tetoDiario: 0,
      emAndamento: null,
      erroGeral: null,
      automatico: false,
      alertaAutomatico: null,
    };
  }

  get atual(): EstadoExecutor {
    return this.estado;
  }

  assinar(fn: (e: EstadoExecutor) => void): () => void {
    this.ouvintes.add(fn);
    fn(this.estado);
    return () => this.ouvintes.delete(fn);
  }

  private publicar(parcial: Partial<EstadoExecutor>): void {
    this.estado = { ...this.estado, ...parcial };
    for (const fn of this.ouvintes) fn(this.estado);
  }

  private async gravar(c: Campanha): Promise<void> {
    await salvarCampanha(this.deps.db, c);
    this.publicar({ campanha: c });
  }

  /** Chama o content script e deixa o rastro no diagnóstico (só o tipo do pedido e o resumo da resposta). */
  private async pedirRegistrando(pedido: PedidoConteudo, trazerParaFrente = false, nome: string | null = null): Promise<RespostaConteudo> {
    const r = await this.deps.pedir(pedido, trazerParaFrente);
    this.deps.diagnostico?.registrar({ fase: this.estado.fase, pedido: pedido.tipo, resposta: resumirResposta(r), item: nome, pagina: null });
    return r;
  }

  /** Etapa do modo automático no diagnóstico (nunca o texto da mensagem). */
  private etapa(nome: string, item: string | null, resposta: { ok: boolean; codigo?: string; erro?: string } | null = null): void {
    this.deps.diagnostico?.registrar({ fase: this.estado.fase, pedido: `auto:${nome}`, resposta, item, pagina: null });
  }

  /** No momento do erro: pergunta ao content script (só leitura) quais seletores batem e registra. */
  private async registrarRetratoDaPagina(nome: string): Promise<void> {
    if (!this.deps.diagnostico) return;
    const r = await this.deps.pedir({ tipo: 'diagnosticar' }).catch((): RespostaConteudo => ({ ok: false, codigo: 'interno', erro: 'sem resposta' }));
    this.deps.diagnostico.registrar({
      fase: this.estado.fase,
      pedido: 'diagnosticar',
      resposta: resumirResposta(r),
      item: nome,
      pagina: r.ok && r.diagnostico ? resumirPagina(r.diagnostico) : null,
    });
  }

  private limparTimer(): void {
    this.cancelarTimer?.();
    this.cancelarTimer = null;
  }

  // ── Painel reaberto ────────────────────────────────────────────────────────

  /**
   * Chamado quando o painel abre (ou troca de campanha): carrega o item que ficou em andamento
   * e recolhe os envios que o content script percebeu com o painel fechado.
   */
  async preparar(): Promise<void> {
    const c = this.estado.campanha;
    const rec = await lerEmAndamento(this.deps.db, c.id);
    if (rec) {
      const item = c.itens.find((i) => i.chave === rec.chave);
      if (!item || item.status !== 'pendente') await limparEmAndamento(this.deps.db, c.id);
      else this.publicar({ emAndamento: { chave: rec.chave, nome: rec.nome, texto: rec.texto } });
    }
    const aviso = await this.sincronizarPendencias();
    if (aviso && !this.ativo) this.publicar({ mensagem: aviso });
    this.publicar({ automatico: (await lerAutomatico(this.deps.db)).ligado });
  }

  /**
   * Pergunta ao content script pelos envios percebidos sem ouvinte e os registra. Só credita
   * um envio ao item que combina com o registro "em andamento" (ou cujo texto é exatamente o
   * que seria colado). Devolve o aviso do WhatsApp visível, se houver.
   */
  private async sincronizarPendencias(): Promise<string | null> {
    const r = await this.deps.pedir({ tipo: 'consultarPendencias' });
    if (!r.ok) return null;
    const confirmar: string[] = [];
    for (const p of r.pendencias ?? []) {
      if (await this.creditarPendencia(p)) confirmar.push(p.id);
    }
    if (confirmar.length > 0) await this.deps.pedir({ tipo: 'confirmarPendencias', ids: confirmar });
    return r.avisoWhatsApp ?? null;
  }

  private async creditarPendencia(p: PendenciaEnvio): Promise<boolean> {
    const c = this.estado.campanha;
    const rec = await lerEmAndamento(this.deps.db, c.id);
    const item = c.itens.find((i) => {
      if (i.status !== 'pendente' || i.nome !== p.nome) return false;
      if (rec && rec.chave === i.chave) return true;
      return normalizarParaComparar(p.texto) === normalizarParaComparar(textoDoItem(i));
    });
    if (!item) return false;
    await this.registrarEnviado(item, { enviadoEm: p.detectadoEm, textoConfere: p.textoConfere, jid: p.jid, motivo: null });
    return true;
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────

  /** Inicia ou retoma. Retomar zera o freio: o usuário confirmou que conferiu o WhatsApp. */
  async iniciar(): Promise<void> {
    if (this.ativo || this.estado.campanha.status === 'concluida') return;
    this.ativo = true;
    await this.gravar({ ...this.estado.campanha, status: 'em_execucao', motivoPausa: null, problemasSeguidos: 0 });
    this.publicar({ mensagem: null, erroGeral: null, alertaAutomatico: null });
    const aviso = await this.sincronizarPendencias();
    if (aviso) {
      if ((await lerAutomatico(this.deps.db)).ligado) await this.freioAutomatico(aviso);
      else await this.pausar(aviso);
      return;
    }
    await this.avancar('usuario');
  }

  async pausar(motivo: string | null = 'pausada por você'): Promise<void> {
    const fase = this.estado.fase;
    const emFluxoAuto = fase === 'contagem' || fase === 'confirmando';
    const colado = fase === 'aguardando_envio' || emFluxoAuto ? this.estado.itemAtual : null;
    this.ativo = false;
    this.limparTimer();
    // Revoga já a permissão do content script: depois de pausar, nenhum envio pode ser acionado.
    if (emFluxoAuto) await this.deps.pedir({ tipo: 'modoAutomatico', ligado: false });
    // Pausa durante "abrindo": o content script desiste e limpa a caixa se já tiver colado.
    if (fase === 'abrindo') await this.deps.pedir({ tipo: 'cancelarAbertura' });
    if (colado && fase !== 'confirmando') await this.deps.pedir({ tipo: 'limparCaixa', texto: textoDoItem(colado) });
    await this.deps.pedir({ tipo: 'pararObservacao' });
    const c = this.estado.campanha;
    if (c.status !== 'concluida') await this.gravar({ ...c, status: 'pausada', motivoPausa: motivo });
    this.publicar({
      fase: c.status === 'concluida' ? 'concluida' : 'parada',
      mensagem: motivo,
      itemAtual: null,
      liberaEm: null,
      // O texto foi tirado da caixa, mas o registro fica: se o usuário apertou Enter no meio, a retomada percebe.
      emAndamento: colado ? { chave: colado.chave, nome: colado.nome, texto: textoDoItem(colado) } : this.estado.emAndamento,
    });
  }

  /** Botão "Abrir próximo": só o usuário abre o contato seguinte depois do intervalo. */
  async abrirProximo(): Promise<void> {
    if (!this.ativo || this.estado.fase !== 'proximo_pronto') return;
    await this.avancar('usuario');
  }

  /** Evento do content script. */
  async aoReceberEvento(ev: EventoConteudo): Promise<void> {
    if (ev.tipo === 'vitaZap:aviso') {
      if (this.ativo) {
        if ((await lerAutomatico(this.deps.db)).ligado) await this.freioAutomatico(ev.texto);
        else await this.pausar(ev.texto);
      }
      return;
    }
    if (ev.tipo === 'vitaZap:observacaoExpirou') {
      const item = this.estado.itemAtual;
      if (this.ativo && this.estado.fase === 'aguardando_envio' && item && item.nome === ev.nome) {
        this.publicar({
          mensagem:
            'A observação de 30 minutos acabou: eu não percebo mais se você enviar. Se você já enviou, clique em "Já enviei"; se não, clique em Pular.',
        });
      }
      return;
    }
    if (ev.tipo !== 'vitaZap:envioDetectado') return;
    const item = this.estado.itemAtual;
    const fase = this.estado.fase;
    // No automático o Enter do próprio usuário também vale: contagem e confirmação aceitam o envio percebido.
    if (!this.ativo || (fase !== 'aguardando_envio' && fase !== 'contagem' && fase !== 'confirmando') || !item || ev.nome !== item.nome) return;
    await this.registrarEnviado(item, {
      enviadoEm: this.deps.agora().toISOString(),
      textoConfere: ev.textoConfere,
      jid: ev.jid ?? null,
      motivo: null,
    });
    if (ev.id) await this.deps.pedir({ tipo: 'confirmarPendencias', ids: [ev.id] });
    if (fase !== 'aguardando_envio') this.etapa('envio_confirmado', item.nome, { ok: true });
    await this.avancar('automatico');
  }

  /**
   * Botão "Já enviei": o usuário garante que a mensagem saiu (o painel não percebeu, ou o
   * painel foi fechado). Registra o envio — conta no teto diário e no intervalo.
   */
  async jaEnviei(): Promise<void> {
    if (this.estado.fase === 'abrindo') return;
    const c = this.estado.campanha;
    const alvo = this.estado.itemAtual ?? (this.estado.emAndamento ? c.itens.find((i) => i.chave === this.estado.emAndamento?.chave) : undefined);
    if (!alvo || alvo.status !== 'pendente') return;
    await this.deps.pedir({ tipo: 'pararObservacao' });
    await this.registrarEnviado(alvo, {
      enviadoEm: this.deps.agora().toISOString(),
      textoConfere: false,
      jid: null,
      motivo: 'marcado por você: "Já enviei"',
    });
    if (this.ativo) await this.avancar('automatico');
    else this.publicar({ fase: this.estado.campanha.status === 'concluida' ? 'concluida' : 'parada' });
  }

  /** Botões Pular / Não é cliente / Problema / Não enviar mais. */
  async acao(tipo: AcaoManual, motivo: string | null = null): Promise<void> {
    const item = this.estado.itemAtual;
    if (!item || this.estado.fase !== 'aguardando_envio') return;
    await this.pedirRegistrando({ tipo: 'limparCaixa', texto: textoDoItem(item) }, false, item.nome);
    if (await this.marcar(item, tipo, motivo, tipo === 'problema' ? 'manual' : null)) await this.avancar('usuario');
  }

  // ── Registro ───────────────────────────────────────────────────────────────

  /** Registra o envio de `item` (idempotente), sorteia o intervalo e limpa o "em andamento". */
  private async registrarEnviado(
    item: ItemCampanha,
    dados: { enviadoEm: string; textoConfere: boolean; jid: string | null; motivo: string | null },
  ): Promise<void> {
    const c = this.estado.campanha;
    await registrarEnvio(this.deps.db, {
      campanhaId: c.id,
      chave: item.chave,
      nome: item.nome,
      enviadoEm: dados.enviadoEm,
      textoConfere: dados.textoConfere,
      jid: dados.jid,
    });
    const motivo = dados.motivo ?? (dados.textoConfere ? null : 'texto enviado foi editado');
    const marcada = marcarItem(c, item.chave, 'enviado', new Date(dados.enviadoEm), motivo);
    const cfg = await lerConfig(this.deps.db);
    const auto = await lerAutomatico(this.deps.db);
    let intervaloSeg = sortearIntervaloSeg(cfg, this.deps.aleatorio);
    if (auto.ligado) {
      // Automático: 90–180 s e, a cada 10 envios seguidos, pausa longa de 10–20 min.
      const espera = sortearEspera(auto.enviosSeguidos, this.deps.aleatorio);
      intervaloSeg = espera.segundos;
      await salvarAutomatico(this.deps.db, { ...auto, enviosSeguidos: espera.enviosSeguidos });
      if (espera.pausaLonga) this.etapa('pausa_longa', item.nome, { ok: true });
    }
    await limparEmAndamento(this.deps.db, c.id);
    await this.gravar({
      ...marcada,
      ultimoEnvioEm: dados.enviadoEm,
      intervaloAtualSeg: intervaloSeg,
    });
    this.publicar({ itemAtual: null, emAndamento: null });
  }

  /** Marca o item. Devolve false se o freio parou a campanha. */
  private async marcar(item: ItemCampanha, tipo: AcaoManual, motivo: string | null, codigo: string | null = null): Promise<boolean> {
    const agora = this.deps.agora();
    if (tipo === 'nao_cliente' || tipo === 'nao_enviar') {
      await marcarNaoEnviar(this.deps.db, {
        chave: item.chave,
        nome: item.nome,
        desde: agora.toISOString(),
        motivo: tipo === 'nao_cliente' ? 'não é cliente' : 'não enviar mais',
      });
    }
    const c = marcarItem(this.estado.campanha, item.chave, tipo, agora, motivo, codigo);
    await limparEmAndamento(this.deps.db, c.id);
    await this.gravar(c);
    this.publicar({ itemAtual: null, emAndamento: null });
    if (tipo === 'problema' && c.status !== 'pausada' && this.ativo && (await lerAutomatico(this.deps.db)).ligado && c.problemasSeguidos >= AUTO.problemasParaDesligar) {
      // Freio do automático: 2 problemas seguidos desligam o automático e voltam ao manual.
      await this.freioAutomatico(`${c.problemasSeguidos} problemas seguidos`);
      return false;
    }
    if (c.status === 'pausada') {
      // Freio acionado.
      this.ativo = false;
      this.limparTimer();
      await this.deps.pedir({ tipo: 'pararObservacao' });
      this.publicar({ fase: 'parada', mensagem: c.motivoPausa });
      return false;
    }
    return true;
  }

  // ── Avanço ─────────────────────────────────────────────────────────────────

  private async avancar(origem: Origem): Promise<void> {
    if (!this.ativo || this.avancando) return;
    this.avancando = true;
    try {
      await this.passo(origem);
    } finally {
      this.avancando = false;
    }
  }

  /** O intervalo acabou: avisa que o próximo está pronto, mas NÃO abre nada. */
  private liberarProximo(): void {
    if (!this.ativo || this.estado.fase !== 'intervalo') return;
    if (this.estado.automatico) {
      // Automático: abre o próximo sozinho. O passo relê o banco e, se o automático foi
      // desligado nesse meio-tempo, volta a esperar o clique em Abrir próximo.
      void this.avancar('timer_auto');
      return;
    }
    this.publicar({ fase: 'proximo_pronto', liberaEm: null, mensagem: MENSAGEM_PROXIMO_PRONTO });
  }

  private async passo(origem: Origem): Promise<void> {
    this.limparTimer();
    const { db } = this.deps;
    const agora = this.deps.agora();
    let c = this.estado.campanha;

    const [envios, cfgManual, naoEnviar, estadoAuto] = await Promise.all([listarEnvios(db), lerConfig(db), listarNaoEnviar(db), lerAutomatico(db)]);
    const auto = estadoAuto.ligado;
    // No automático o teto é no máximo 30 e o intervalo mínimo 90 s, qualquer que seja a política manual.
    const cfg = auto ? configAuto(cfgManual) : cfgManual;
    const enviosHoje = contarEnviosHoje(envios, agora);
    this.publicar({ enviosHoje, tetoDiario: cfg.tetoDiario, automatico: auto });

    // Próximo contato, revalidado agora (pode ter mudado desde a aprovação).
    const bloqueados = new Set(naoEnviar.map((n) => n.chave));
    const ultimo = ultimoEnvioPorChave(envios);
    const idsEnviados = new Set(envios.map((e) => e.id));
    let item = proximoPendente(c);
    while (item) {
      const ultimoEnvio = ultimo.get(item.chave);
      let motivo: string | null = null;
      let status: 'pulado' | 'nao_enviar' | 'enviado' | null = null;
      if (idsEnviados.has(`${c.id}:${item.chave}`)) {
        status = 'enviado';
        motivo = 'já registrado nesta campanha';
      } else if (bloqueados.has(item.chave)) {
        status = 'nao_enviar';
        motivo = 'marcado "Não enviar mais"';
      } else if (ultimoEnvio && diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(ultimoEnvio))) < diasSemRepetir(c.filtros)) {
        status = 'pulado';
        motivo = 'recebeu outra campanha recentemente';
      }
      if (!status) break;
      c = marcarItem(c, item.chave, status, agora, motivo);
      item = proximoPendente(c);
    }
    if (c !== this.estado.campanha) await this.gravar(c);

    if (!item) {
      this.ativo = false;
      await this.deps.pedir({ tipo: 'pararObservacao' });
      await limparEmAndamento(db, c.id);
      await this.gravar({ ...c, status: 'concluida', motivoPausa: null });
      const comProblemas = terminouComProblemas({ ...c, status: 'concluida' });
      this.publicar({
        fase: 'concluida',
        itemAtual: null,
        liberaEm: null,
        emAndamento: null,
        mensagem: comProblemas ? 'Campanha concluída com problemas: nenhuma mensagem foi enviada. Veja os motivos abaixo.' : 'Campanha concluída.',
      });
      return;
    }

    // Item que ficou em andamento (painel fechado/recarregado): ele vem primeiro e a conversa
    // é conferida contra a "foto" antes de qualquer colagem.
    let rec = await lerEmAndamento(db, c.id);
    if (rec) {
      const dele = c.itens.find((i) => i.chave === rec?.chave && i.status === 'pendente');
      if (!dele) {
        await limparEmAndamento(db, c.id);
        rec = undefined;
      } else {
        item = dele;
      }
    }

    // O intervalo vale a partir do último envio de QUALQUER campanha deste número.
    const v = podeAbrirProximo(
      { enviosHoje, ...ultimoEnvioParaIntervalo(envios, c), problemasSeguidos: c.problemasSeguidos },
      cfg,
      agora,
    );
    if (!v.pode) {
      if (v.tipo === 'intervalo') {
        const pausaLonga = auto && (c.intervaloAtualSeg ?? 0) > AUTO.intervaloMaxSeg;
        this.publicar({
          fase: 'intervalo',
          liberaEm: agora.getTime() + v.esperarMs,
          mensagem: pausaLonga ? 'Pausa longa (a cada 10 envios) antes do próximo contato.' : null,
        });
        if (auto) this.etapa(pausaLonga ? 'pausa_longa_aguardando' : 'intervalo', null, { ok: true });
        this.cancelarTimer = this.deps.agendar(() => this.liberarProximo(), v.esperarMs);
        return;
      }
      await this.pausar(v.motivo);
      return;
    }
    if (!auto && origem !== 'usuario') {
      // Modo manual: nunca abrir a próxima conversa sozinho; espera o clique em "Abrir próximo".
      this.publicar({ fase: 'proximo_pronto', itemAtual: null, liberaEm: null, mensagem: MENSAGEM_PROXIMO_PRONTO });
      return;
    }

    if (auto) {
      // (a) Checagens do automático: nenhum aviso do WhatsApp na tela antes de abrir a conversa.
      this.etapa('politica_ok', item.nome, { ok: true });
      const aviso = await this.sincronizarPendencias();
      if (aviso) {
        await this.freioAutomatico(aviso);
        return;
      }
      if (!this.ativo) return;
    }

    // O texto é revalidado AGORA (link, tamanho, quebra de linha), mesmo vindo de backup importado.
    const texto = textoDoItem(item);
    const errosTexto = validarModelo(texto);
    if (errosTexto.length > 0) {
      if (await this.marcar(item, 'problema', `texto recusado: ${errosTexto.join('; ')}`, 'texto_invalido')) await this.passo(origem);
      return;
    }

    this.publicar({ fase: 'abrindo', itemAtual: item, liberaEm: null, mensagem: null });
    const meuNomeGuardado = await lerMeuNome(db);
    const r = await this.pedirRegistrando(
      { tipo: 'abrirEColar', nome: item.nome, texto, ...(rec ? { fotoAntes: rec.foto } : {}), ...(meuNomeGuardado ? { meuNome: meuNomeGuardado } : {}) },
      true,
      item.nome,
    );
    // O content script aprende meu nome sozinho (autor das minhas mensagens); guardamos para as próximas conversas.
    if (r.meuNome && r.meuNome !== meuNomeGuardado) await salvarMeuNome(db, r.meuNome);

    if (!this.ativo) {
      // Pausado enquanto abria. Se o texto chegou a ser colado, guarda o registro (a retomada
      // confere se saiu) e tira o texto da caixa.
      if (r.ok) {
        await this.guardarEmAndamento(item, texto, r);
        await this.deps.pedir({ tipo: 'limparCaixa', texto });
        await this.deps.pedir({ tipo: 'pararObservacao' });
      }
      return;
    }
    if (r.ok) {
      await this.guardarEmAndamento(item, texto, r);
      if (auto) {
        await this.iniciarContagem(item, texto, r.jid ?? null);
        return;
      }
      this.publicar({ fase: 'aguardando_envio', itemAtual: item, mensagem: null, emAndamento: null });
      return;
    }
    if (r.codigo === 'ja_enviada') {
      // A conversa já tem mensagem nossa nova: conta como enviada e NÃO cola de novo.
      await this.registrarEnviado(item, {
        enviadoEm: this.deps.agora().toISOString(),
        textoConfere: false,
        jid: r.jid ?? null,
        motivo: 'mensagem sua nova encontrada ao retomar — confira no WhatsApp',
      });
      await this.passo('automatico'); // já estamos dentro de avancar(): segue direto para o intervalo
      return;
    }
    if (r.codigo === 'usuario_digitando' && auto) {
      // (b) Automático: não mexe em nada enquanto o usuário digita; tenta de novo em 15 s.
      this.etapa('usuario_digitando', item.nome, { ok: true });
      this.publicar({ fase: 'intervalo', itemAtual: null, liberaEm: this.deps.agora().getTime() + AUTO.novaTentativaDigitandoMs, mensagem: r.erro });
      this.cancelarTimer = this.deps.agendar(() => this.liberarProximo(), AUTO.novaTentativaDigitandoMs);
      return;
    }
    if (r.codigo === 'usuario_digitando') {
      // Não é problema do contato: espera o usuário terminar e clicar de novo.
      this.publicar({ fase: 'proximo_pronto', itemAtual: null, mensagem: r.erro });
      return;
    }
    if (r.codigo === 'cancelado') {
      await this.pausar(r.erro);
      return;
    }
    await this.registrarRetratoDaPagina(item.nome);
    if (ERROS_GERAIS.has(r.codigo)) {
      this.publicar({ itemAtual: null, erroGeral: { nome: item.nome, codigo: r.codigo, mensagem: r.erro } });
      await this.pausar(r.erro);
      return;
    }
    if (ERROS_ANTES_DE_COLAR.has(r.codigo)) {
      // Conferência que falhou ANTES de colar: nada foi colado nem enviado, e isso não é sinal de
      // problema no WhatsApp. O contato vira "pulado (revisar)" com o motivo e NÃO conta no freio.
      this.etapa('pulado_para_revisar', item.nome, { ok: false, codigo: r.codigo, erro: r.erro });
      await this.marcar(item, 'pulado', `${r.erro} Nada foi colado nem enviado — pulado para revisar (não conta como problema).`, r.codigo);
      if (!this.ativo) return;
      if (auto && proximoPendente(this.estado.campanha)) {
        // Automático: não abre o contato seguinte de imediato; respira alguns segundos.
        this.publicar({ fase: 'intervalo', itemAtual: null, liberaEm: this.deps.agora().getTime() + AUTO.pausaAposPuladoMs, mensagem: `${item.nome} foi pulado para revisar.` });
        this.cancelarTimer = this.deps.agendar(() => this.liberarProximo(), AUTO.pausaAposPuladoMs);
        return;
      }
      await this.passo(origem);
      return;
    }
    if (await this.marcar(item, 'problema', r.erro, r.codigo)) await this.passo(origem);
  }

  // ── Modo automático (0.3.0) ────────────────────────────────────────────────
  // Só roda com o modo automático ligado (lido do banco em `passo`). O manual nunca chega aqui.

  private contagemVale(item: ItemCampanha): boolean {
    return this.ativo && this.estado.fase === 'contagem' && this.estado.itemAtual?.chave === item.chave;
  }

  /** (e) Texto colado: abre a contagem regressiva visível (com Cancelar) e agenda a conclusão. */
  private async iniciarContagem(item: ItemCampanha, texto: string, jid: string | null): Promise<void> {
    const ms = AUTO.contagemSeg * 1000;
    this.publicar({ fase: 'contagem', itemAtual: item, liberaEm: this.deps.agora().getTime() + ms, mensagem: null, emAndamento: null });
    this.etapa('contagem_iniciada', item.nome, { ok: true });
    this.cancelarTimer = this.deps.agendar(() => void this.concluirContagem(item, texto, jid), ms);
    await this.deps.pedir({ tipo: 'modoAutomatico', ligado: true });
  }

  /** (f→g) A contagem acabou sem cancelamento: emite o token e pede o envio. O content script reconfere tudo. */
  private async concluirContagem(item: ItemCampanha, texto: string, jid: string | null): Promise<void> {
    this.cancelarTimer = null;
    if (!this.contagemVale(item)) return;
    if (!(await lerAutomatico(this.deps.db)).ligado) {
      this.etapa('modo_desligado_na_contagem', item.nome, { ok: false, codigo: 'modo_desligado' });
      await this.pausar('Modo automático desligado durante a contagem — nada foi enviado.');
      return;
    }
    if (!this.contagemVale(item)) return;
    const campanhaId = this.estado.campanha.id;
    this.seqToken += 1;
    const token = emitirToken({ campanhaId, nome: item.nome, texto }, this.deps.agora().getTime(), `${campanhaId}:${item.chave}:${this.seqToken}`);
    await this.deps.pedir({ tipo: 'modoAutomatico', ligado: true }); // renova: o painel está aberto agora
    if (!this.contagemVale(item)) return;
    this.etapa('token_emitido', item.nome, { ok: true });
    const r = await this.pedirRegistrando({ tipo: 'enviarAutomatico', nome: item.nome, texto, campanhaId, jid, token }, false, item.nome);
    // Pausado (ou o envio do próprio usuário foi percebido) enquanto o pedido corria: nada a fazer aqui.
    if (!this.contagemVale(item)) return;
    if (r.ok) {
      this.etapa('clique_enviar', item.nome, { ok: true });
      this.publicar({ fase: 'confirmando', liberaEm: this.deps.agora().getTime() + AUTO.confirmacaoMs, mensagem: 'Confirmando que a mensagem saiu…' });
      this.cancelarTimer = this.deps.agendar(() => void this.naoConfirmado(item), AUTO.confirmacaoMs);
      return;
    }
    await this.falhaNoEnvio(item, texto, r);
  }

  /** O content script recusou o envio (nada foi enviado). */
  private async falhaNoEnvio(item: ItemCampanha, texto: string, r: Extract<RespostaConteudo, { ok: false }>): Promise<void> {
    this.etapa('envio_recusado', item.nome, { ok: false, codigo: r.codigo, erro: r.erro });
    if (r.codigo === 'aviso_whatsapp') {
      await this.freioAutomatico(r.erro);
      return;
    }
    await this.registrarRetratoDaPagina(item.nome);
    if (r.codigo === 'botao_enviar_ausente' || r.codigo === 'envio_nao_autorizado' || ERROS_GERAIS.has(r.codigo)) {
      // Erro geral (a tela mudou ou o token não valeu): para a campanha com o erro; o texto colado é retirado.
      this.publicar({ erroGeral: { nome: item.nome, codigo: r.codigo, mensagem: r.erro } });
      await this.pausar(r.erro);
      return;
    }
    // Problema deste contato (título mudou, texto alterado…): tira o texto SE ainda for exatamente o nosso e segue.
    await this.pedirRegistrando({ tipo: 'limparCaixa', texto }, false, item.nome);
    if (await this.marcar(item, 'problema', r.erro, r.codigo)) await this.avancar('usuario');
  }

  /** (h) 20 s depois do clique o detector não viu a mensagem: pausa com erro e NUNCA repete este contato. */
  private async naoConfirmado(item: ItemCampanha): Promise<void> {
    this.cancelarTimer = null;
    const vale = (): boolean => this.ativo && this.estado.fase === 'confirmando' && this.estado.itemAtual?.chave === item.chave;
    if (!vale()) return;
    // Pode ter sido percebido sem ninguém ouvindo: pergunta ao content script antes de desistir.
    await this.sincronizarPendencias();
    if (this.estado.campanha.itens.find((i) => i.chave === item.chave)?.status === 'enviado') {
      if (this.ativo && this.estado.fase === 'confirmando') await this.avancar('automatico');
      return;
    }
    if (!vale()) return;
    const mensagem = `Cliquei em enviar para ${item.nome}, mas não percebi a mensagem sair em ${AUTO.confirmacaoMs / 1000} s. Confira no WhatsApp. Este contato não será repetido.`;
    this.etapa('envio_nao_confirmado', item.nome, { ok: false, codigo: 'envio_nao_confirmado' });
    await this.registrarRetratoDaPagina(item.nome);
    this.publicar({ erroGeral: { nome: item.nome, codigo: 'envio_nao_confirmado', mensagem } });
    await this.marcar(item, 'problema', mensagem, 'envio_nao_confirmado');
    if (this.ativo) await this.pausar(mensagem);
  }

  /** Botão Cancelar da contagem: pausa a campanha e limpa a caixa (nada foi enviado). */
  async cancelarEnvio(): Promise<void> {
    if (this.estado.fase !== 'contagem') return;
    this.etapa('cancelado_pelo_usuario', this.estado.itemAtual?.nome ?? null, { ok: true });
    await this.pausar('Envio cancelado por você — nada foi enviado.');
  }

  /**
   * Freio do automático: PAUSA a campanha e deixa o alerta. O modo automático continua ligado
   * (decisão do dono, 20/10/2026: autorizado uma vez, fica autorizado); Retomar segue no automático.
   */
  private async freioAutomatico(motivo: string): Promise<void> {
    this.etapa('freio', null, { ok: false, codigo: 'freio', erro: motivo });
    const alerta = `Campanha PAUSADA pelo freio: ${motivo}. Confira o WhatsApp e clique em Retomar para continuar no automático.`;
    await this.pausar(alerta);
    this.publicar({ alertaAutomatico: alerta });
  }

  private async guardarEmAndamento(item: ItemCampanha, texto: string, r: Extract<RespostaConteudo, { ok: true }>): Promise<void> {
    await gravarEmAndamento(this.deps.db, {
      campanhaId: this.estado.campanha.id,
      chave: item.chave,
      nome: item.nome,
      texto,
      foto: r.foto ?? [],
      jid: r.jid ?? null,
      iniciadoEm: this.deps.agora().toISOString(),
    });
  }
}
