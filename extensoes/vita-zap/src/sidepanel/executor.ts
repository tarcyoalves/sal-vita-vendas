// Condutor da campanha no modo "uma tecla".
//
// Ciclo: checa a política → grava o marcador "em voo" → abre o próximo contato e cola o texto → ESPERA
// o usuário apertar Enter (envio manual, o padrão) ou o content script clicar (envio automático
// OPCIONAL, desligado por padrão) → o content script avisa que a mensagem saiu → registra → espera o
// intervalo → próximo. O executor nunca clica: não existe pedido "enviar" no protocolo.
//
// Marcador "em voo" (Campanha.emVoo): gravado ANTES de colar e apagado só quando o desfecho é conhecido.
// Se o painel fechar com ele presente, ao reabrir NÃO se cola de novo: consulta-se a conversa (saiu uma
// mensagem nossa nova com o texto?) → enviado; senão → "revisar". Nunca se reenvia sozinho.

import {
  type Campanha,
  type EmVoo,
  type ItemCampanha,
  type StatusItem,
  marcarItem,
  proximoPendente,
  textoDoItem,
} from '../shared/campanha';
import { diasSemRepetir, ultimoEnvioPorChave } from '../shared/filtros';
import { diferencaDias, hojeNoFuso } from '../shared/datas';
import {
  type Banco,
  lerConfig,
  listarEnvios,
  listarNaoEnviar,
  marcarNaoEnviar,
  registrarEnvio,
  salvarCampanha,
} from '../shared/banco';
import type { EventoConteudo, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { contarEnviosHoje, podeAbrirProximo, sortearIntervaloSeg } from '../shared/politica';

export interface DependenciasExecutor {
  db: Banco;
  pedir: (pedido: PedidoConteudo, trazerParaFrente?: boolean) => Promise<RespostaConteudo>;
  agora: () => Date;
  aleatorio: () => number;
  /** Agenda `fn` para daqui a `ms`; devolve a função que cancela. */
  agendar: (fn: () => void, ms: number) => () => void;
  obterEnvioAutomatico?: () => boolean;
}

export type FaseExecucao = 'parada' | 'abrindo' | 'aguardando_envio' | 'intervalo' | 'concluida';

export interface EstadoExecutor {
  campanha: Campanha;
  fase: FaseExecucao;
  mensagem: string | null;
  itemAtual: ItemCampanha | null;
  /** Quando o intervalo libera o próximo (epoch ms). */
  liberaEm: number | null;
  enviosHoje: number;
  tetoDiario: number;
  envioAutomatico: boolean;
}

export type AcaoManual = 'pulado' | 'nao_cliente' | 'problema' | 'nao_enviar';

/** Erros do content script que indicam problema geral (não do contato): pausam sem marcar ninguém. */
const ERROS_GERAIS = new Set(['seletor', 'nao_pronto', 'ocupado', 'interno']);

export class Executor {
  private estado: EstadoExecutor;
  private readonly ouvintes = new Set<(e: EstadoExecutor) => void>();
  private cancelarTimer: (() => void) | null = null;
  private ativo = false;
  private avancando = false;
  /** Envio automático é OPCIONAL: desligado por padrão (envio manual). */
  private envioAutomatico = false;

  constructor(private readonly deps: DependenciasExecutor, campanha: Campanha) {
    this.estado = {
      campanha,
      fase: campanha.status === 'concluida' ? 'concluida' : 'parada',
      mensagem: campanha.motivoPausa,
      itemAtual: null,
      liberaEm: null,
      enviosHoje: 0,
      tetoDiario: 0,
      envioAutomatico: false,
    };
  }

  private async gravarMarcador(emVoo: EmVoo | null): Promise<void> {
    if ((this.estado.campanha.emVoo ?? null) === emVoo) return;
    await this.gravar({ ...this.estado.campanha, emVoo });
  }

  /**
   * Se o painel foi fechado/travado com uma mensagem em voo, resolve isso ANTES de qualquer colagem:
   * consulta a conversa; saiu → registra como enviado; não achou → "revisar". Devolve false se não deu para
   * conferir (WhatsApp fechado etc.): a campanha não anda enquanto o marcador existir.
   */
  async reconciliar(): Promise<boolean> {
    const c = this.estado.campanha;
    const m = c.emVoo;
    if (!m) return true;
    const item = c.itens.find((i) => i.chave === m.chave);
    if (!item || item.status !== 'pendente') {
      await this.gravarMarcador(null);
      return true;
    }
    const r = await this.deps.pedir({ tipo: 'consultarEnvio', nome: m.nome, texto: m.texto, idsAntes: m.idsAntes }, true);
    if (!r.ok) {
      this.publicar({
        mensagem: `Havia uma mensagem para "${m.nome}" em andamento quando o painel fechou e não consegui conferir a conversa (${r.erro}). Não colei nada. Abra o WhatsApp Web e use Retomar.`,
      });
      return false;
    }
    const agora = this.deps.agora();
    if (r.situacao === 'enviado') {
      await registrarEnvio(this.deps.db, { campanhaId: c.id, chave: item.chave, nome: item.nome, enviadoEm: agora.toISOString(), textoConfere: true });
      const cfg = await lerConfig(this.deps.db);
      await this.gravar({
        ...marcarItem(c, item.chave, 'enviado', agora, 'confirmado ao reabrir o painel'),
        emVoo: null,
        ultimoEnvioEm: agora.toISOString(),
        intervaloAtualSeg: sortearIntervaloSeg(cfg, this.deps.aleatorio),
      });
      return true;
    }
    await this.gravar({
      ...marcarItem(c, item.chave, 'revisar', agora, 'o painel fechou com esta mensagem em andamento e não achei o envio na conversa; não reenviei. Confira no WhatsApp'),
      emVoo: null,
    });
    return true;
  }

  setEnvioAutomatico(ativo: boolean): void {
    this.envioAutomatico = ativo;
    this.publicar({ envioAutomatico: ativo });
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

  private limparTimer(): void {
    this.cancelarTimer?.();
    this.cancelarTimer = null;
  }

  /** Inicia ou retoma. Retomar zera o freio: o usuário confirmou que conferiu o WhatsApp. */
  async iniciar(): Promise<void> {
    if (this.ativo || this.estado.campanha.status === 'concluida') return;
    this.ativo = true;
    if (!(await this.reconciliar())) {
      this.ativo = false;
      return;
    }
    await this.gravar({ ...this.estado.campanha, status: 'em_execucao', motivoPausa: null, problemasSeguidos: 0 });
    this.publicar({ mensagem: null });
    await this.avancar();
  }

  async pausar(motivo: string | null = 'pausada por você'): Promise<void> {
    const estavaAguardando = this.estado.fase === 'aguardando_envio' ? this.estado.itemAtual : null;
    this.ativo = false;
    this.limparTimer();
    if (estavaAguardando) {
      const r = await this.deps.pedir({ tipo: 'limparCaixa', texto: textoDoItem(estavaAguardando) });
      // Só some o marcador se o texto era exatamente o nosso e foi apagado agora: nada ficou em voo.
      // Caixa vazia/editada = pode ter saído; o marcador fica e, ao retomar, a conversa é consultada.
      if (r.ok && r.limpou) await this.gravarMarcador(null);
    } else await this.deps.pedir({ tipo: 'pararObservacao' });
    const c = this.estado.campanha;
    if (c.status !== 'concluida') await this.gravar({ ...c, status: 'pausada', motivoPausa: motivo });
    this.publicar({ fase: c.status === 'concluida' ? 'concluida' : 'parada', mensagem: motivo, itemAtual: null, liberaEm: null });
  }

  /** Evento do content script: envio detectado, bloqueado antes do clique, não confirmado ou observação expirada. */
  async aoReceberEvento(ev: EventoConteudo): Promise<void> {
    if (ev.tipo === 'vitaZap:progressoVarredura') return;
    const item = this.estado.itemAtual;
    if (!this.ativo || this.estado.fase !== 'aguardando_envio' || !item || ev.nome !== item.nome) return;

    if (ev.tipo === 'vitaZap:envioBloqueado') {
      // Nada foi clicado. Conta como problema (freio) e a campanha pausa para o atendente olhar.
      const motivo = `envio automático cancelado antes do clique (${ev.codigo}): ${ev.motivo}`;
      await this.gravarMarcador(null);
      await this.marcarComo(item, 'problema', motivo, true);
      if (this.ativo) await this.pausar(motivo);
      return;
    }
    if (ev.tipo === 'vitaZap:envioNaoConfirmado') {
      // Clicou e não viu sair: PODE ter saído. Revisar (nunca reenviar sozinho), conta no freio e pausa.
      const motivo = `envio_nao_confirmado: ${ev.motivo}`;
      await this.gravarMarcador(null);
      await this.marcarComo(item, 'revisar', motivo, true);
      if (this.ativo) await this.pausar(motivo);
      return;
    }
    if (ev.tipo === 'vitaZap:observacaoExpirada') {
      const motivo = `sem confirmação do envio de "${item.nome}" depois de 30 min: confira no WhatsApp se saiu`;
      await this.gravarMarcador(null);
      await this.marcarComo(item, 'revisar', motivo, false);
      if (this.ativo) await this.pausar(motivo);
      return;
    }

    const agora = this.deps.agora();
    const c = this.estado.campanha;
    await registrarEnvio(this.deps.db, {
      campanhaId: c.id,
      chave: item.chave,
      nome: item.nome,
      enviadoEm: agora.toISOString(),
      textoConfere: ev.textoConfere,
    });
    const marcada = marcarItem(c, item.chave, 'enviado', agora, ev.textoConfere ? null : 'texto enviado foi editado');
    const cfg = await lerConfig(this.deps.db);
    await this.gravar({
      ...marcada,
      emVoo: null,
      ultimoEnvioEm: agora.toISOString(),
      intervaloAtualSeg: sortearIntervaloSeg(cfg, this.deps.aleatorio),
    });
    this.publicar({ itemAtual: null });
    await this.avancar();
  }

  /** Botões Pular / Não é cliente / Problema / Não enviar mais. */
  async acao(tipo: AcaoManual, motivo: string | null = null): Promise<void> {
    const item = this.estado.itemAtual;
    if (!item || this.estado.fase !== 'aguardando_envio') return;
    await this.deps.pedir({ tipo: 'limparCaixa', texto: textoDoItem(item) });
    await this.gravarMarcador(null); // decisão explícita do atendente: nada mais em voo
    if (await this.marcar(item, tipo, motivo)) await this.avancar();
  }

  /** Pula um item específico da campanha (remove dos próximos disparos). */
  async pularItem(chave: string, motivo: string = 'removido por você da lista'): Promise<void> {
    const c = this.estado.campanha;
    const novosItens = c.itens.map((i) =>
      i.chave === chave && (i.status === 'pendente' || i.status === 'problema' || i.status === 'revisar')
        ? { ...i, status: 'pulado' as const, motivo, atualizadoEm: this.deps.agora().toISOString() }
        : i,
    );
    await this.gravar({ ...c, itens: novosItens });
  }

  /** Bloqueia o contato (não enviar mais) e marca como 'nao_enviar' na campanha. */
  async bloquearItem(chave: string, motivo: string = 'não enviar mais'): Promise<void> {
    const item = this.estado.campanha.itens.find((i) => i.chave === chave);
    if (item) {
      await marcarNaoEnviar(this.deps.db, {
        chave: item.chave,
        nome: item.nome,
        desde: this.deps.agora().toISOString(),
        motivo,
      });
    }
    const c = this.estado.campanha;
    const novosItens = c.itens.map((i) =>
      i.chave === chave && (i.status === 'pendente' || i.status === 'problema' || i.status === 'revisar')
        ? { ...i, status: 'nao_enviar' as const, motivo, atualizadoEm: this.deps.agora().toISOString() }
        : i,
    );
    await this.gravar({ ...c, itens: novosItens });
  }

  /** Edita o primeiro nome de um item antes do envio. */
  async editarItem(chave: string, novoPrimeiroNome: string): Promise<void> {
    const c = this.estado.campanha;
    const novosItens = c.itens.map((i) =>
      i.chave === chave && (i.status === 'pendente' || i.status === 'problema')
        ? { ...i, primeiroNome: novoPrimeiroNome }
        : i,
    );
    await this.gravar({ ...c, itens: novosItens });
  }

  /** Recoloca um item (problema ou pulado) de volta como pendente. */
  async recolocarPendente(chave: string): Promise<void> {
    const c = this.estado.campanha;
    const novosItens = c.itens.map((i) =>
      i.chave === chave && (i.status === 'problema' || i.status === 'pulado' || i.status === 'revisar')
        ? { ...i, status: 'pendente' as const, motivo: null, atualizadoEm: this.deps.agora().toISOString() }
        : i,
    );
    await this.gravar({ ...c, itens: novosItens, problemasSeguidos: 0, status: c.status === 'concluida' ? 'pausada' : c.status });
  }

  /** Recoloca todos os itens com problema de volta para pendente e zera o freio de problemas. */
  /** Ordena os itens pendentes por data decrescente (mais recente primeiro) e desempata por nome. */
  async ordenarPendentesPorData(mapaDatas: Map<string, string | null>): Promise<void> {
    const c = this.estado.campanha;
    const processados = c.itens.filter((i) => i.status !== 'pendente');
    const pendentes = c.itens
      .filter((i) => i.status === 'pendente')
      .sort((a, b) => {
        const dataA = a.ultimaConversa ?? mapaDatas.get(a.chave) ?? '';
        const dataB = b.ultimaConversa ?? mapaDatas.get(b.chave) ?? '';
        if (dataA && dataB && dataA !== dataB) return dataB.localeCompare(dataA);
        if (dataA && !dataB) return -1;
        if (!dataA && dataB) return 1;
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
    await this.gravar({ ...c, itens: [...processados, ...pendentes] });
  }

  async recolocarProblemasComoPendentes(): Promise<void> {
    const c = this.estado.campanha;
    const novosItens = c.itens.map((i) =>
      i.status === 'problema' ? { ...i, status: 'pendente' as const, motivo: null } : i,
    );
    await this.gravar({ ...c, itens: novosItens, problemasSeguidos: 0, status: c.status === 'concluida' ? 'pausada' : c.status });
  }

  /** Marca o item. Devolve false se o freio parou a campanha. */
  private async marcar(item: ItemCampanha, tipo: AcaoManual, motivo: string | null): Promise<boolean> {
    const agora = this.deps.agora();
    if (tipo === 'nao_cliente' || tipo === 'nao_enviar') {
      await marcarNaoEnviar(this.deps.db, {
        chave: item.chave,
        nome: item.nome,
        desde: agora.toISOString(),
        motivo: tipo === 'nao_cliente' ? 'não é cliente' : 'não enviar mais',
      });
    }
    return this.marcarComo(item, tipo, motivo);
  }

  /** Grava o status do item e aplica o freio. Devolve false se a campanha parou (freio acionado). */
  private async marcarComo(item: ItemCampanha, status: Exclude<StatusItem, 'pendente' | 'enviado'>, motivo: string | null, contaNoFreio?: boolean): Promise<boolean> {
    const agora = this.deps.agora();
    const c = marcarItem(this.estado.campanha, item.chave, status, agora, motivo, contaNoFreio);
    await this.gravar(c);
    this.publicar({ itemAtual: null });
    if (c.status === 'pausada') {
      // Freio acionado.
      this.ativo = false;
      this.limparTimer();
      this.publicar({ fase: 'parada', mensagem: c.motivoPausa });
      return false;
    }
    return true;
  }

  private async avancar(): Promise<void> {
    if (!this.ativo || this.avancando) return;
    this.avancando = true;
    try {
      await this.passo();
    } finally {
      this.avancando = false;
    }
  }

  private async passo(): Promise<void> {
    this.limparTimer();
    const { db } = this.deps;
    const agora = this.deps.agora();
    let c = this.estado.campanha;

    const [envios, cfg, naoEnviar] = await Promise.all([listarEnvios(db), lerConfig(db), listarNaoEnviar(db)]);
    const enviosHoje = contarEnviosHoje(envios, agora);
    this.publicar({ enviosHoje, tetoDiario: cfg.tetoDiario });

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
      await this.gravar({ ...c, status: 'concluida', motivoPausa: null });
      this.publicar({ fase: 'concluida', itemAtual: null, liberaEm: null, mensagem: 'Campanha concluída.' });
      return;
    }

    const v = podeAbrirProximo(
      { enviosHoje, ultimoEnvioEm: c.ultimoEnvioEm, intervaloAtualSeg: c.intervaloAtualSeg, problemasSeguidos: c.problemasSeguidos },
      cfg,
      agora,
    );
    if (!v.pode) {
      if (v.tipo === 'intervalo') {
        this.publicar({ fase: 'intervalo', liberaEm: agora.getTime() + v.esperarMs, mensagem: null });
        this.cancelarTimer = this.deps.agendar(() => void this.avancar(), v.esperarMs);
        return;
      }
      await this.pausar(v.motivo);
      return;
    }

    this.publicar({ fase: 'abrindo', itemAtual: item, liberaEm: null, mensagem: null });
    const envioAuto = this.deps.obterEnvioAutomatico ? this.deps.obterEnvioAutomatico() : this.envioAutomatico;
    const texto = textoDoItem(item);
    // Marcador "em voo": ANTES de colar. A foto dos ids chega na resposta (a conversa só abre lá dentro).
    const marcador: EmVoo = { chave: item.chave, nome: item.nome, texto, idsAntes: null, desde: agora.toISOString() };
    await this.gravarMarcador(marcador);
    let r: RespostaConteudo;
    try {
      r = await this.deps.pedir({ tipo: 'abrirEColar', nome: item.nome, texto, envioAutomatico: envioAuto }, true);
    } catch (e) {
      r = { ok: false, codigo: 'interno', erro: e instanceof Error ? e.message : String(e) };
    }
    if (!this.ativo) {
      // Pausado enquanto abria: se colou, tira o texto; o marcador só some se a caixa foi mesmo limpa.
      if (r.ok) {
        const l = await this.deps.pedir({ tipo: 'limparCaixa', texto });
        if (l.ok && l.limpou) await this.gravarMarcador(null);
      } else if (r.codigo !== 'interno') await this.gravarMarcador(null);
      return;
    }
    if (r.ok) {
      await this.gravarMarcador({ ...marcador, idsAntes: r.idsAntes ?? null });
      this.publicar({ fase: 'aguardando_envio', itemAtual: item, mensagem: null });
      return;
    }
    // Erro 'interno' pode ter acontecido depois de colar: o marcador fica (a retomada consulta a conversa).
    // Qualquer outro erro é anterior à colagem (ou o content script já limpou a caixa).
    if (r.codigo !== 'interno') await this.gravarMarcador(null);
    if (ERROS_GERAIS.has(r.codigo)) {
      this.publicar({ itemAtual: null });
      await this.pausar(r.erro);
      return;
    }
    // Sem sinal positivo de conversa individual: não colou, vai para "revisar" e NÃO conta no freio.
    if (r.codigo === 'nao_confirmado') {
      if (await this.marcarComo(item, 'revisar', r.erro)) await this.passo();
      return;
    }
    if (await this.marcar(item, 'problema', r.erro)) await this.passo();
  }
}
