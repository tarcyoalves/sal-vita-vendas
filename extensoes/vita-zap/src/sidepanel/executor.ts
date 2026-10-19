// Condutor da campanha no modo "uma tecla".
//
// Ciclo: checa a política → abre o próximo contato e cola o texto → ESPERA o usuário apertar
// Enter → o content script avisa que a mensagem saiu → registra → espera o intervalo → próximo.
// O executor nunca envia nada: ele não tem como (não existe pedido de envio no protocolo).

import {
  type Campanha,
  type ItemCampanha,
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

  constructor(private readonly deps: DependenciasExecutor, campanha: Campanha) {
    this.estado = {
      campanha,
      fase: campanha.status === 'concluida' ? 'concluida' : 'parada',
      mensagem: campanha.motivoPausa,
      itemAtual: null,
      liberaEm: null,
      enviosHoje: 0,
      tetoDiario: 0,
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

  private limparTimer(): void {
    this.cancelarTimer?.();
    this.cancelarTimer = null;
  }

  /** Inicia ou retoma. Retomar zera o freio: o usuário confirmou que conferiu o WhatsApp. */
  async iniciar(): Promise<void> {
    if (this.ativo || this.estado.campanha.status === 'concluida') return;
    this.ativo = true;
    await this.gravar({ ...this.estado.campanha, status: 'em_execucao', motivoPausa: null, problemasSeguidos: 0 });
    this.publicar({ mensagem: null });
    await this.avancar();
  }

  async pausar(motivo: string | null = 'pausada por você'): Promise<void> {
    const estavaAguardando = this.estado.fase === 'aguardando_envio' ? this.estado.itemAtual : null;
    this.ativo = false;
    this.limparTimer();
    if (estavaAguardando) await this.deps.pedir({ tipo: 'limparCaixa', texto: textoDoItem(estavaAguardando) });
    else await this.deps.pedir({ tipo: 'pararObservacao' });
    const c = this.estado.campanha;
    if (c.status !== 'concluida') await this.gravar({ ...c, status: 'pausada', motivoPausa: motivo });
    this.publicar({ fase: c.status === 'concluida' ? 'concluida' : 'parada', mensagem: motivo, itemAtual: null, liberaEm: null });
  }

  /** Evento do content script: a mensagem do contato atual apareceu no chat. */
  async aoReceberEvento(ev: EventoConteudo): Promise<void> {
    if (ev.tipo !== 'vitaZap:envioDetectado') return;
    const item = this.estado.itemAtual;
    if (!this.ativo || this.estado.fase !== 'aguardando_envio' || !item || ev.nome !== item.nome) return;
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
    if (await this.marcar(item, tipo, motivo)) await this.avancar();
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
    const c = marcarItem(this.estado.campanha, item.chave, tipo, agora, motivo);
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
    const r = await this.deps.pedir({ tipo: 'abrirEColar', nome: item.nome, texto: textoDoItem(item) }, true);
    if (!this.ativo) return; // pausado enquanto abria
    if (r.ok) {
      this.publicar({ fase: 'aguardando_envio', itemAtual: item, mensagem: null });
      return;
    }
    if (ERROS_GERAIS.has(r.codigo)) {
      this.publicar({ itemAtual: null });
      await this.pausar(r.erro);
      return;
    }
    if (await this.marcar(item, 'problema', r.erro)) await this.passo();
  }
}
