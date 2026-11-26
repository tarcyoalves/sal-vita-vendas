// Motor do "Pedir à IA" (v0.7.57), sem React.
//
// Divisão de trabalho (igual ao follow-up e à reativação):
//  - regras puras (plano, candidatas, pré-filtro, itens): shared/pedido-ia.ts;
//  - ler a conversa: content script (`lerConversa`, só leitura, identidade estrita; falha fechada = "revisar");
//  - decidir se corresponde: IA no servidor do CRM (zapIa.interpretarPedido / zapIa.conferirPedido);
//  - trava de agendamento: shared/trava-agendamento.ts, consultada no CRM pelo service worker;
//  - ENVIAR mensagem: o MESMO Executor das campanhas (teto diário compartilhado, horário, intervalo 60–120 s, freio,
//    "Não enviar mais", conversa conferida antes do clique, trava de agendamento antes de abrir cada contato). Este
//    arquivo NÃO tem caminho próprio de clique: só monta uma campanha comum, que o dono inicia na aba "3. Envio".
//  - NADA sai sozinho daqui: o resultado é uma lista para revisão; mensagem só depois de prévia aprovada pelo dono.

import { type Banco, lerPedidos, listarNaoEnviar, marcarNaoEnviar, salvarCampanha, salvarPedidos } from '../shared/banco';
import { type Campanha, novoId, type ItemCampanha } from '../shared/campanha';
import { MARCADOR_PRIMEIRO_NOME } from '../shared/constantes';
import type { ContatoVarrido } from '../shared/contatos';
import { instanteNoFuso } from '../shared/crm-lembretes';
import { hojeNoFuso, somarDias } from '../shared/datas';
import { FILTROS_PADRAO } from '../shared/filtros';
import { modeloDeCobrancaValido, paraModelo } from '../shared/followup';
import {
  MARCADOR_NOME,
  montarTextoCobranca,
  normalizarEstilo,
  normalizarTextos,
  sortearTexto,
  textoCobrancaValido,
  textoParaModelo,
  textosParaContato,
  type ModoCobranca,
  type OrigemTexto,
} from '../shared/followup-estilo';
import type { LeadsCRM } from '../shared/leads';
import type { CodigoErro, MensagemLida, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { primeiroNome as extrairPrimeiroNome } from '../shared/nomes';
import {
  type ConversaParaPedido,
  type EstadoPedidos,
  type ItemPedido,
  type PedidoInterpretado,
  type PlanoPedido,
  type ResultadoPedido,
  type TravaDoItem,
  LOTE_CONFERENCIA,
  candidatosDoPedido,
  diasDeAgendamentoValidos,
  errosDoPlano,
  guardarPedido,
  nasceMarcado,
  podeReceberMensagem,
  recusaPeloPlano,
  removerPedido,
} from '../shared/pedido-ia';
import type { ResultadoTrava } from '../shared/trava-agendamento';
import { falhaDaIa, iaFuncionou } from './saude-painel';

const ERROS_GERAIS: ReadonlySet<CodigoErro> = new Set<CodigoErro>(['seletor', 'nao_pronto', 'ocupado', 'interno']);

export interface DependenciasPedido {
  db: Banco;
  pedir: (pedido: PedidoConteudo, trazerParaFrente?: boolean) => Promise<RespostaConteudo>;
  ia: Pick<LeadsCRM, 'interpretarPedido' | 'conferirPedido' | 'escreverCobranca'>;
  /** Trava de agendamento: um resultado por contato. `forcar` consulta o CRM de novo. */
  travar: (contatos: ReadonlyArray<{ nome: string; chave: string; telefone?: string | null }>, forcar: boolean) => Promise<ResultadoTrava[]>;
  /** Equipe (v0.7.60): o "não enviar mais" fresco antes de montar a lista. Nunca lança. Ausente = nada. */
  preparar?: (contatos: ReadonlyArray<{ nome: string; chave: string }>) => Promise<unknown>;
  /** Cria o lembrete do CRM (agendamento). Devolve o erro ou null. */
  criarLembrete: (nome: string, venceEm: number, agora: Date) => Promise<string | null>;
  agora: () => Date;
  aleatorio: () => number;
  esperar: (ms: number) => Promise<void>;
}

export interface OpcoesRodadaPedido {
  parar?: () => boolean;
  aoProgredir?: (texto: string) => void;
  /** Termos do nome por palavra inteira (v0.7.63). Ausente = pedaço do texto. */
  palavraInteira?: boolean;
}

export type ResultadoInterpretar = { ok: true; valor: PedidoInterpretado } | { ok: false; mensagem: string };

/** Como o dono quer o texto desta mensagem: os textos dele (sorteados) ou a IA no estilo dele (com fallback para os textos). */
export interface TextosDoEnvio {
  modo: ModoCobranca;
  /** Com {nome}; 1 a 10. */
  textos: string[];
  /** Só no modo 'ia_estilo'. */
  estilo: string;
}

export interface ItemDaPrevia {
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Com {primeiroNome}: o formato do item de campanha. */
  modelo: string;
  origem: OrigemTexto;
  /** Como a mensagem sai de verdade (com o nome no lugar). */
  texto: string;
}

export interface PreviaEnvio {
  itens: ItemDaPrevia[];
  excluidos: Array<{ chave: string; nome: string; motivo: string }>;
  /** Por que não dá para montar (nenhum texto válido, por exemplo). */
  erro: string | null;
}

const travaDoItem = (t: ResultadoTrava | undefined): TravaDoItem =>
  !t ? { tipo: 'indisponivel', motivo: 'sem resposta do CRM' } : t.tipo === 'agendado' ? { tipo: 'agendado', ate: new Date(t.ate).toISOString(), motivo: t.motivo } : t.tipo === 'indisponivel' ? { tipo: 'indisponivel', motivo: t.motivo } : { tipo: 'livre' };

export class MotorPedido {
  private ultimoSorteado: string | null = null;

  constructor(private readonly d: DependenciasPedido) {}

  carregar(): Promise<EstadoPedidos> {
    return lerPedidos(this.d.db);
  }

  private async gravarUltimo(r: ResultadoPedido): Promise<EstadoPedidos> {
    const e = await lerPedidos(this.d.db);
    return salvarPedidos(this.d.db, { ...e, ultimo: r });
  }

  async removerSalvo(id: string): Promise<EstadoPedidos> {
    const e = await lerPedidos(this.d.db);
    return salvarPedidos(this.d.db, { ...e, salvos: removerPedido(e.salvos, id) });
  }

  // ── Passo 1: entender o pedido ────────────────────────────────────────────

  async interpretar(texto: string): Promise<ResultadoInterpretar> {
    try {
      const r = await this.d.ia.interpretarPedido(texto);
      return r.ok ? { ok: true, valor: r.valor } : { ok: false, mensagem: r.erro.mensagem };
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
    }
  }

  // ── Passo 2: ler as conversas e conferir (SÓ LEITURA no WhatsApp) ─────────

  /**
   * Uma rodada: escolhe as candidatas pela lista, trava de agendamento do CRM (só informativa aqui: o envio confere de novo),
   * lê cada conversa (lerConversa), descarta pelo plano o que o código já sabe e manda o resto à IA em lotes.
   * Nada é enviado e nada é escrito no WhatsApp.
   */
  async rodar(texto: string, plano: PlanoPedido, contatos: ReadonlyArray<ContatoVarrido>, opcoes: OpcoesRodadaPedido = {}): Promise<ResultadoPedido> {
    const agora0 = this.d.agora();
    const base: ResultadoPedido = {
      id: novoId(agora0, this.d.aleatorio),
      texto,
      plano,
      rodadaEm: agora0.toISOString(),
      candidatos: 0,
      lidas: 0,
      descartadas: 0,
      semConferir: 0,
      cortados: 0,
      fora: [],
      avisos: [],
      itens: [],
    };
    const erros = errosDoPlano(plano);
    if (erros.length > 0) return { ...base, avisos: [`Plano incompleto: ${erros.join('; ')}.`] };

    await this.d.preparar?.(contatos.filter((c) => c.temConversa && !c.soNumero && !c.pareceGrupo).map((c) => ({ nome: c.nome, chave: c.chave })));
    const naoEnviar = new Set((await listarNaoEnviar(this.d.db)).map((n) => n.chave));
    const cand = candidatosDoPedido(contatos, plano, { hoje: hojeNoFuso(agora0), naoEnviar, palavraInteira: opcoes.palavraInteira });
    const r: ResultadoPedido = { ...base, candidatos: cand.candidatos.length, cortados: cand.cortados, fora: cand.fora };
    // O pedido usado fica salvo para repetir, mesmo que nada seja achado.
    const antes = await lerPedidos(this.d.db);
    await salvarPedidos(this.d.db, { ...antes, salvos: guardarPedido(antes.salvos, texto, plano, agora0) });
    if (cand.candidatos.length === 0) {
      r.avisos.push('Nenhuma conversa da lista serve para este pedido (veja "Por que ficaram de fora"). Se a lista é antiga, faça a varredura de novo.');
      await this.gravarUltimo(r);
      return r;
    }

    const travasBrutas = await this.d.travar(cand.candidatos.map((c) => ({ nome: c.nome, chave: c.chave })), true).catch(() => [] as ResultadoTrava[]);
    const travas = cand.candidatos.map((_, i) => travaDoItem(travasBrutas.length === cand.candidatos.length ? travasBrutas[i] : undefined));

    const paraIa: Array<{ c: ContatoVarrido; trava: TravaDoItem; mensagens: MensagemLida[]; lidoEm: string }> = [];
    for (const [i, c] of cand.candidatos.entries()) {
      if (opcoes.parar?.()) {
        r.avisos.push('Parado por você antes do fim.');
        r.semConferir += cand.candidatos.length - i;
        break;
      }
      opcoes.aoProgredir?.(`Lendo ${i + 1} de ${cand.candidatos.length}: ${c.nome}`);
      let resp: RespostaConteudo;
      try {
        resp = await this.d.pedir({ tipo: 'lerConversa', nome: c.nome }, true);
      } catch (e) {
        resp = { ok: false, codigo: 'interno', erro: e instanceof Error ? e.message : String(e) };
      }
      const agora = this.d.agora();
      if (!resp.ok) {
        if (ERROS_GERAIS.has(resp.codigo)) {
          r.avisos.push(resp.erro);
          r.semConferir += cand.candidatos.length - i;
          break;
        }
        // Identidade da conversa não confere, grupo, nome repetido, não achei: falha fechada, vira "revisar" (nunca recebe mensagem).
        r.lidas += 1;
        r.itens.push(this.item(c, travas[i], { corresponde: false, revisar: true, motivo: `Revisar: ${resp.erro}`, confianca: 'baixa', pediuParaSair: false }, agora));
      } else {
        r.lidas += 1;
        const mensagens = resp.mensagens ?? [];
        if (recusaPeloPlano(mensagens, plano) !== null) r.descartadas += 1;
        else paraIa.push({ c, trava: travas[i], mensagens, lidoEm: agora.toISOString() });
      }
      if (i < cand.candidatos.length - 1) await this.d.esperar(1500 + Math.floor(this.d.aleatorio() * 2500));
    }

    for (let ini = 0; ini < paraIa.length; ini += LOTE_CONFERENCIA) {
      const lote = paraIa.slice(ini, ini + LOTE_CONFERENCIA);
      const conversas: ConversaParaPedido[] = lote.map((x, k) => ({
        ref: `c${k + 1}`,
        primeiroNome: extrairPrimeiroNome(x.c.nome, ['cliente']),
        mensagens: x.mensagens.map((m) => ({ de: m.de, texto: m.texto, ...(m.quando ? { quando: m.quando } : {}) })),
      }));
      let resp;
      try {
        resp = await this.d.ia.conferirPedido(plano, conversas);
      } catch (e) {
        resp = { ok: false as const, erro: { tipo: 'rede' as const, mensagem: e instanceof Error ? e.message : String(e) } };
      }
      if (!resp.ok) {
        // IA fora do ar / limite: o que falta NÃO vira "corresponde" nem some em silêncio: fica contado como "sem conferir".
        r.avisos.push(`A IA não respondeu (${resp.erro.mensagem}). ${paraIa.length - ini} conversa(s) ficaram sem conferir: rode de novo mais tarde.`);
        r.semConferir += paraIa.length - ini;
        falhaDaIa(resp.erro.mensagem, this.d.agora().getTime());
        break;
      }
      iaFuncionou();
      const porRef = new Map(resp.valor.map((x) => [x.ref, x]));
      for (const [k, x] of lote.entries()) {
        const conf = porRef.get(`c${k + 1}`);
        const agora = this.d.agora();
        if (!conf || conf.revisar) {
          r.itens.push(this.item(x.c, x.trava, { corresponde: false, revisar: true, motivo: conf?.motivo || 'Revisar: a IA não devolveu uma conferência válida para esta conversa', confianca: 'baixa', pediuParaSair: false }, agora, x.lidoEm));
        } else if (!conf.corresponde) {
          r.descartadas += 1;
        } else {
          r.itens.push(this.item(x.c, x.trava, { corresponde: true, revisar: false, motivo: conf.motivo, confianca: conf.confianca, pediuParaSair: conf.pediuParaSair }, agora, x.lidoEm));
        }
      }
    }
    // Melhores primeiro: confiança, depois conversa mais recente.
    const peso = { alta: 0, media: 1, baixa: 2 } as const;
    r.itens.sort((a, b) => Number(a.revisar) - Number(b.revisar) || peso[a.confianca] - peso[b.confianca] || (b.ultimaConversa ?? '').localeCompare(a.ultimaConversa ?? '') || a.nome.localeCompare(b.nome, 'pt-BR'));
    await this.gravarUltimo(r);
    return r;
  }

  private item(
    c: ContatoVarrido,
    trava: TravaDoItem,
    d: { corresponde: boolean; revisar: boolean; motivo: string; confianca: ItemPedido['confianca']; pediuParaSair: boolean },
    agora: Date,
    lidoEm: string = agora.toISOString(),
  ): ItemPedido {
    return {
      chave: c.chave,
      nome: c.nome,
      primeiroNome: extrairPrimeiroNome(c.nome, ['cliente']),
      ultimaConversa: c.ultimaConversa,
      corresponde: d.corresponde,
      revisar: d.revisar,
      motivo: d.motivo,
      confianca: d.confianca,
      pediuParaSair: d.pediuParaSair,
      trava,
      marcado: trava.tipo === 'livre' && nasceMarcado(d.confianca, d.revisar, d.pediuParaSair),
      estado: 'aberto',
      lidoEm,
      atualizadoEm: agora.toISOString(),
    };
  }

  // ── Ações por item e em lote (nada envia) ─────────────────────────────────

  private async mudarItens(chaves: ReadonlyArray<string>, f: (i: ItemPedido) => ItemPedido): Promise<ResultadoPedido | null> {
    const e = await lerPedidos(this.d.db);
    if (!e.ultimo) return null;
    const alvo = new Set(chaves);
    const itens = e.ultimo.itens.map((i) => (alvo.has(i.chave) && i.estado === 'aberto' ? f(i) : i));
    const ultimo = { ...e.ultimo, itens };
    await salvarPedidos(this.d.db, { ...e, ultimo });
    return ultimo;
  }

  async marcar(chave: string, marcado: boolean): Promise<void> {
    await this.mudarItens([chave], (i) => ({ ...i, marcado }));
  }

  async marcarTodos(chaves: ReadonlyArray<string>, marcado: boolean): Promise<void> {
    await this.mudarItens(chaves, (i) => ({ ...i, marcado }));
  }

  async ignorar(chaves: ReadonlyArray<string>): Promise<void> {
    const agora = this.d.agora().toISOString();
    await this.mudarItens(chaves, (i) => ({ ...i, estado: 'ignorado', marcado: false, atualizadoEm: agora }));
  }

  /** "Não enviar mais": vale para sempre, em qualquer campanha, cobrança ou reativação. */
  async naoEnviarMais(chaves: ReadonlyArray<string>): Promise<number> {
    const e = await lerPedidos(this.d.db);
    const alvo = new Set(chaves);
    const itens = (e.ultimo?.itens ?? []).filter((i) => alvo.has(i.chave) && i.estado === 'aberto');
    const agora = this.d.agora().toISOString();
    for (const i of itens) await marcarNaoEnviar(this.d.db, { chave: i.chave, nome: i.nome, desde: agora, motivo: 'não enviar mais (Pedir à IA)', origem: 'manual' });
    await this.mudarItens(itens.map((i) => i.chave), (i) => ({ ...i, estado: 'nao_enviar', marcado: false, atualizadoEm: agora }));
    return itens.length;
  }

  /** "Agendar no CRM": um lembrete daqui a `dias` dias, às 9h (fuso de Fortaleza). Não manda mensagem. */
  async agendar(chaves: ReadonlyArray<string>, dias: unknown): Promise<{ feitos: number; erros: Array<{ nome: string; erro: string }> }> {
    const n = diasDeAgendamentoValidos(dias);
    const e = await lerPedidos(this.d.db);
    const alvo = new Set(chaves);
    const itens = (e.ultimo?.itens ?? []).filter((i) => alvo.has(i.chave) && i.estado === 'aberto');
    const erros: Array<{ nome: string; erro: string }> = [];
    const feitos: string[] = [];
    for (const i of itens) {
      if (i.trava.tipo === 'agendado') {
        erros.push({ nome: i.nome, erro: i.trava.motivo ?? 'já tem agendamento no CRM' });
        continue;
      }
      const agora = this.d.agora();
      const erro = await this.d.criarLembrete(i.nome, instanteNoFuso(somarDias(hojeNoFuso(agora), n), 9, 0), agora);
      if (erro === null) feitos.push(i.chave);
      else erros.push({ nome: i.nome, erro });
    }
    const quando = this.d.agora().toISOString();
    await this.mudarItens(feitos, (i) => ({ ...i, estado: 'agendado', marcado: false, motivo: `${i.motivo} (agendado no CRM em ${n} dia(s))`, atualizadoEm: quando }));
    return { feitos: feitos.length, erros };
  }

  // ── Enviar mensagem: prévia obrigatória, depois campanha comum (Executor) ─

  private async escolherTexto(item: ItemPedido, assunto: string, t: { modo: ModoCobranca; textos: string[]; estilo: string }, usados: Set<string>, ia: { fora: boolean }): Promise<{ modelo: string; origem: OrigemTexto } | null> {
    const nome = item.primeiroNome.trim();
    if (t.modo === 'ia_estilo' && !ia.fora && nome !== '') {
      try {
        const res = await this.d.ia.escreverCobranca(nome, assunto, 1, { estilo: t.estilo, exemplos: t.textos });
        if (res.ok) {
          const modelo = paraModelo(res.valor, nome);
          const comMarcador = modelo.split(MARCADOR_PRIMEIRO_NOME).join(MARCADOR_NOME);
          const final = montarTextoCobranca(comMarcador, nome);
          const copiaDoDono = t.textos.some((x) => montarTextoCobranca(x, nome) === final);
          if (textoCobrancaValido(comMarcador, nome) && modeloDeCobrancaValido(modelo) && !usados.has(modelo)) return { modelo, origem: copiaDoDono ? 'meus_textos' : 'ia_estilo' };
        } else if (res.erro.tipo !== 'validacao') ia.fora = true;
      } catch {
        ia.fora = true;
      }
    }
    const servem = textosParaContato(t.textos, nome).filter((x) => textoCobrancaValido(x, nome));
    const escolhido = sortearTexto(servem, this.d.aleatorio, this.ultimoSorteado);
    if (escolhido === null) return null;
    this.ultimoSorteado = escolhido;
    const modelo = textoParaModelo(escolhido);
    return modeloDeCobrancaValido(modelo) ? { modelo, origem: 'meus_textos' } : null;
  }

  /**
   * Monta a PRÉVIA (nada é gravado): quem recebe e o texto exato de cada um. Confere de novo, na hora, "Não enviar mais",
   * trava de agendamento (consulta forçada ao CRM), idade da leitura, pedido de sair e primeiro nome. Falha ao conferir = fora.
   */
  async montarPrevia(chaves: ReadonlyArray<string>, envio: TextosDoEnvio): Promise<PreviaEnvio> {
    const e = await lerPedidos(this.d.db);
    const ultimo = e.ultimo;
    const textos = normalizarTextos(envio.textos);
    if (!ultimo) return { itens: [], excluidos: [], erro: 'Não há resultado de pedido para enviar.' };
    if (textos.length === 0) return { itens: [], excluidos: [], erro: 'Escreva pelo menos um texto seu (sem link, sem preço; {nome} é opcional) antes de montar a prévia.' };
    const alvo = new Set(chaves);
    const itens = ultimo.itens.filter((i) => alvo.has(i.chave));
    if (itens.length === 0) return { itens: [], excluidos: [], erro: 'Marque pelo menos uma conversa.' };

    await this.d.preparar?.(itens.map((i) => ({ nome: i.nome, chave: i.chave })));
    const naoEnviar = new Set((await listarNaoEnviar(this.d.db)).map((n) => n.chave));
    const travasBrutas = await this.d.travar(itens.map((i) => ({ nome: i.nome, chave: i.chave })), true).catch(() => [] as ResultadoTrava[]);
    const agora = this.d.agora();
    const estilo = normalizarEstilo(envio.estilo);
    const usados = new Set<string>();
    const ia = { fora: false };
    const previa: PreviaEnvio = { itens: [], excluidos: [], erro: null };
    for (const [k, i] of itens.entries()) {
      const trava = travaDoItem(travasBrutas.length === itens.length ? travasBrutas[k] : undefined);
      const atual: ItemPedido = { ...i, trava };
      const pode = podeReceberMensagem(atual, agora);
      if (naoEnviar.has(i.chave)) previa.excluidos.push({ chave: i.chave, nome: i.nome, motivo: 'marcado "Não enviar mais"' });
      else if (!pode.ok) previa.excluidos.push({ chave: i.chave, nome: i.nome, motivo: pode.motivo });
      else {
        const escolha = await this.escolherTexto(i, ultimo.plano.assunto, { modo: envio.modo, textos, estilo }, usados, ia);
        if (escolha === null) previa.excluidos.push({ chave: i.chave, nome: i.nome, motivo: i.primeiroNome.trim() === '' ? 'o contato não tem primeiro nome e nenhum texto seu serve sem {nome}: escreva você' : 'não achei um texto seu que sirva para este contato' });
        else {
          usados.add(escolha.modelo);
          previa.itens.push({ chave: i.chave, nome: i.nome, primeiroNome: i.primeiroNome, modelo: escolha.modelo, origem: escolha.origem, texto: montarTextoCobranca(escolha.modelo.split(MARCADOR_PRIMEIRO_NOME).join(MARCADOR_NOME), i.primeiroNome) });
        }
      }
    }
    if (previa.itens.length === 0) previa.erro = 'Ninguém desta seleção pode receber mensagem agora (veja os motivos abaixo).';
    return previa;
  }

  /**
   * O dono aprovou a prévia: grava uma campanha COMUM (aba "3. Envio"), parada ("Aprovada. Clique em Iniciar"). Quem manda é o
   * Executor, com toda a política. Itens que mudaram de estado desde a prévia ficam de fora.
   */
  async criarCampanha(previa: PreviaEnvio): Promise<Campanha | null> {
    const e = await lerPedidos(this.d.db);
    if (!e.ultimo || previa.itens.length === 0) return null;
    const abertos = new Set(e.ultimo.itens.filter((i) => i.estado === 'aberto').map((i) => i.chave));
    const prontos = previa.itens.filter((i) => abertos.has(i.chave));
    if (prontos.length === 0) return null;
    const agora = this.d.agora();
    const itens: ItemCampanha[] = prontos.map((i) => ({ chave: i.chave, nome: i.nome, primeiroNome: i.primeiroNome, modelo: i.modelo, status: 'pendente', motivo: null, atualizadoEm: null, marcado: true }));
    const campanha: Campanha = {
      id: novoId(agora, this.d.aleatorio),
      nome: `Pedir à IA: ${e.ultimo.plano.assunto.slice(0, 50)}`,
      criadaEm: agora.toISOString(),
      aprovadaEm: agora.toISOString(),
      termoBusca: 'pedir à IA',
      filtros: { ...FILTROS_PADRAO },
      modelos: [],
      status: 'pausada',
      motivoPausa: 'Aprovada. Clique em Iniciar quando estiver pronto.',
      itens,
      problemasSeguidos: 0,
      ultimoEnvioEm: null,
      intervaloAtualSeg: null,
    };
    await salvarCampanha(this.d.db, campanha);
    const quando = agora.toISOString();
    await this.mudarItens(prontos.map((i) => i.chave), (i) => ({ ...i, estado: 'na_campanha', marcado: false, atualizadoEm: quando }));
    return campanha;
  }
}
