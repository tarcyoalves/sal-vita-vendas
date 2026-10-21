// RepositorioLocal: a implementação do RepositorioContatos em chrome.storage.local.
// É o ÚNICO arquivo da extensão que toca em chrome.storage (tests/arquitetura-repositorio.test.ts
// garante). Uma chave por coleção (vz.*); as mutações são serializadas (uma de cada vez) e só
// regravam as coleções que de fato mudaram.

import {
  acharContato,
  adicionarNota as opAdicionarNota,
  alternarEtiqueta as opAlternarEtiqueta,
  atualizarSeExistir,
  criarEtiqueta as opCriarEtiqueta,
  definirFase as opDefinirFase,
  dispensarContato,
  editarNota as opEditarNota,
  excluirEtiqueta as opExcluirEtiqueta,
  excluirNota as opExcluirNota,
  garantirContato,
  reativarContato,
  registrarUltimoContatoEm,
  renomearEtiqueta as opRenomearEtiqueta,
  telefoneDaRef,
  validarNota,
  vincularContato,
} from './crm-contatos';
import { exportarJson, lerImportacao, mesclarDados, substituirDados } from './crm-importacao';
import { adiarLembrete, criarLembrete as opCriarLembrete, type ResultadoLembrete } from './crm-lembretes';
import { excluirResposta as opExcluirResposta, MODELOS_INICIAIS, salvarResposta as opSalvarResposta } from './crm-modelos';
import { CHAVE_ACAO_PENDENTE, CHAVES, COLECOES, CONFIG_PADRAO, dadosVazios, ehAcaoPendente, novoId, sanearDados, type Colecao } from './crm-store';
import type { AcaoPendente, ConfigCrm, Contato, Conversa, DadosCrm, Etiqueta, Fase, Lembrete, RefContato } from './crm-tipos';
import type { DestinoVinculo, EventoRepositorio, ItemVisto, ModoImportacao, RepositorioContatos, ResultadoImportar } from './repositorio';

const VALIDADE_ABERTURA_MS = 15 * 60_000;

/** Coleções que as mutações leem e regravam (as conversas lidas da lista ficam de fora: são grandes). */
export const COLECOES_DE_ANOTACAO: Colecao[] = COLECOES.filter((c) => c !== 'conversas');

type Ouvinte = (e: EventoRepositorio) => void;

export class RepositorioLocal implements RepositorioContatos {
  private fila: Promise<unknown> = Promise.resolve();
  private readonly ouvintes = new Set<Ouvinte>();
  private pararStorage: (() => void) | null = null;

  constructor(private readonly relogio: () => number = Date.now) {}

  // ── Infraestrutura ─────────────────────────────────────────────────────────

  private async ler(colecoes: Colecao[]): Promise<DadosCrm> {
    const bruto = (await chrome.storage.local.get(colecoes.map((c) => CHAVES[c]))) as Record<string, unknown>;
    const lido: Partial<Record<Colecao, unknown>> = {};
    for (const c of colecoes) lido[c] = bruto[CHAVES[c]];
    const san = sanearDados(lido);
    const d: DadosCrm = { ...dadosVazios(), ...san, config: { ...CONFIG_PADRAO, ...san.config } };
    // Primeira vez: um modelo de exemplo (id fixo: dois lugares semeando ao mesmo tempo não duplicam).
    if (colecoes.includes('respostas') && !(CHAVES.respostas in bruto)) {
      d.respostas = MODELOS_INICIAIS.map((m) => ({ ...m }));
      await chrome.storage.local.set({ [CHAVES.respostas]: d.respostas });
    }
    return d;
  }

  /** Lê, aplica `fn`, grava só o que mudou e avisa os ouvintes. Uma de cada vez. */
  private mutar<T>(fn: (d: DadosCrm) => T): Promise<T> {
    const tarefa = this.fila.then(async () => {
      const d = await this.ler(COLECOES_DE_ANOTACAO);
      const antes = new Map(COLECOES_DE_ANOTACAO.map((c) => [c, JSON.stringify(d[c])]));
      const r = fn(d);
      const mudadas = COLECOES_DE_ANOTACAO.filter((c) => JSON.stringify(d[c]) !== antes.get(c));
      if (mudadas.length > 0) {
        await chrome.storage.local.set(Object.fromEntries(mudadas.map((c) => [CHAVES[c], d[c]])));
        this.emitir({ colecoes: mudadas, abertura: false });
      }
      return r;
    });
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  private emitir(e: EventoRepositorio): void {
    for (const o of this.ouvintes) o(e);
  }

  aoMudar(cb: Ouvinte): () => void {
    this.ouvintes.add(cb);
    if (!this.pararStorage) {
      const ouvinte = (mudancas: Record<string, chrome.storage.StorageChange>, area: string): void => {
        if (area !== 'local') return;
        const colecoes = COLECOES.filter((c) => CHAVES[c] in mudancas);
        const abertura = CHAVE_ACAO_PENDENTE in mudancas && mudancas[CHAVE_ACAO_PENDENTE].newValue !== undefined;
        if (colecoes.length > 0 || abertura) this.emitir({ colecoes, abertura });
      };
      chrome.storage.onChanged.addListener(ouvinte);
      this.pararStorage = () => chrome.storage.onChanged.removeListener(ouvinte);
    }
    return () => {
      this.ouvintes.delete(cb);
      if (this.ouvintes.size === 0 && this.pararStorage) {
        this.pararStorage();
        this.pararStorage = null;
      }
    };
  }

  // ── Leitura ────────────────────────────────────────────────────────────────

  carregar(colecoes: readonly Colecao[] = COLECOES): Promise<DadosCrm> {
    return this.ler([...colecoes]);
  }

  async listarContatos(): Promise<Contato[]> {
    return Object.values((await this.ler(['contatos'])).contatos);
  }

  async obterContato(ref: RefContato): Promise<Contato | null> {
    return acharContato(await this.ler(['contatos']), ref) ?? null;
  }

  async listarLembretes(): Promise<Lembrete[]> {
    return (await this.ler(['lembretes'])).lembretes;
  }

  async listarEtiquetas(): Promise<Etiqueta[]> {
    return (await this.ler(['etiquetas'])).etiquetas;
  }

  // ── Contatos ───────────────────────────────────────────────────────────────

  registrarContato(ref: RefContato): Promise<Contato> {
    return this.mutar((d) => structuredClone(garantirContato(d, ref, this.relogio())));
  }

  vincular(contatoId: string, destino: DestinoVinculo): Promise<{ ok: true; contato: Contato } | { ok: false; erro: string }> {
    return this.mutar((d) => {
      const r = vincularContato(d, contatoId, destino, this.relogio());
      return 'erro' in r ? { ok: false as const, erro: r.erro } : { ok: true as const, contato: structuredClone(r.contato) };
    });
  }

  registrarVistos(itens: ItemVisto[]): Promise<void> {
    if (itens.length === 0) return Promise.resolve();
    return this.mutar((d) => {
      const agora = this.relogio();
      for (const i of itens) {
        const c = atualizarSeExistir(d, i.ref, agora);
        if (c && i.ultimoContatoEm != null) registrarUltimoContatoEm(c, i.ultimoContatoEm);
      }
    });
  }

  registrarUltimoContato(ref: RefContato, em: number): Promise<void> {
    return this.mutar((d) => {
      registrarUltimoContatoEm(garantirContato(d, ref, this.relogio()), em);
    });
  }

  // ── Notas ──────────────────────────────────────────────────────────────────

  adicionarNota(ref: RefContato, texto: string): Promise<string | null> {
    return this.mutar((d) => {
      const agora = this.relogio();
      const invalida = validarNota(texto); // antes de criar o contato: nota recusada não deixa contato à toa
      return invalida ?? opAdicionarNota(garantirContato(d, ref, agora), texto, agora);
    });
  }

  editarNota(ref: RefContato, notaId: string, texto: string): Promise<string | null> {
    return this.mutar((d) => {
      const c = acharContato(d, ref);
      return c ? opEditarNota(c, notaId, texto, this.relogio()) : 'Contato não encontrado.';
    });
  }

  excluirNota(ref: RefContato, notaId: string): Promise<void> {
    return this.mutar((d) => {
      const c = acharContato(d, ref);
      if (c) opExcluirNota(c, notaId, this.relogio());
    });
  }

  // ── Fase, etiquetas ────────────────────────────────────────────────────────

  definirFase(ref: RefContato, fase: Fase | null): Promise<void> {
    return this.mutar((d) => opDefinirFase(garantirContato(d, ref, this.relogio()), fase, this.relogio()));
  }

  criarEtiqueta(nome: string, cor: string): Promise<{ erro: string } | { etiqueta: Etiqueta }> {
    return this.mutar((d) => opCriarEtiqueta(d, nome, cor));
  }

  alternarEtiqueta(ref: RefContato, etiquetaId: string): Promise<boolean> {
    return this.mutar((d) => opAlternarEtiqueta(garantirContato(d, ref, this.relogio()), etiquetaId, this.relogio()));
  }

  renomearEtiqueta(etiquetaId: string, nome: string, cor: string): Promise<string | null> {
    return this.mutar((d) => opRenomearEtiqueta(d, etiquetaId, nome, cor));
  }

  excluirEtiqueta(etiquetaId: string): Promise<void> {
    return this.mutar((d) => opExcluirEtiqueta(d, etiquetaId));
  }

  // ── Triagem ────────────────────────────────────────────────────────────────

  dispensar(ref: RefContato, assinaturaDaConversa: string): Promise<void> {
    return this.mutar((d) => dispensarContato(garantirContato(d, ref, this.relogio()), assinaturaDaConversa, this.relogio()));
  }

  reativar(ref: RefContato): Promise<void> {
    return this.mutar((d) => {
      const c = acharContato(d, ref);
      if (c) reativarContato(c, this.relogio());
    });
  }

  // ── Lembretes ──────────────────────────────────────────────────────────────

  criarLembrete(entrada: { ref: RefContato; venceEm: number | null; rascunho?: string }, agora: Date): Promise<ResultadoLembrete> {
    return this.mutar((d) => {
      // Valida antes de criar o contato: lembrete recusado não deixa contato à toa.
      const teste = opCriarLembrete({ contatoId: 'x', nome: entrada.ref.nome, venceEm: entrada.venceEm }, agora, 'x');
      if (!teste.ok) return teste;
      const c = garantirContato(d, entrada.ref, agora.getTime());
      const r = opCriarLembrete(
        { contatoId: c.id, nome: entrada.ref.nome, telefone: telefoneDaRef(entrada.ref) ?? c.telefone, venceEm: entrada.venceEm, rascunho: entrada.rascunho },
        agora,
        novoId(),
      );
      if (r.ok) d.lembretes.push(r.lembrete);
      return r;
    });
  }

  atualizarLembrete(id: string, patch: Partial<Pick<Lembrete, 'status' | 'rascunho' | 'disparadoEm'>>): Promise<void> {
    return this.mutar((d) => {
      const l = d.lembretes.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    });
  }

  adiarLembrete(id: string, venceEm: number, agora: Date): Promise<void> {
    return this.mutar((d) => {
      const i = d.lembretes.findIndex((x) => x.id === id);
      if (i >= 0) d.lembretes[i] = adiarLembrete(d.lembretes[i], venceEm, agora);
    });
  }

  excluirLembrete(id: string): Promise<void> {
    return this.mutar((d) => {
      d.lembretes = d.lembretes.filter((l) => l.id !== id);
    });
  }

  // ── Respostas rápidas ──────────────────────────────────────────────────────

  salvarResposta(entrada: { id?: string; titulo: string; atalho: string; texto: string }): Promise<string | null> {
    return this.mutar((d) => opSalvarResposta(d, entrada));
  }

  excluirResposta(id: string): Promise<void> {
    return this.mutar((d) => opExcluirResposta(d, id));
  }

  // ── Estado da tela ─────────────────────────────────────────────────────────

  salvarConversas(conversas: Record<string, Conversa>): Promise<void> {
    const tarefa = this.fila.then(async () => {
      await chrome.storage.local.set({ [CHAVES.conversas]: conversas });
      this.emitir({ colecoes: ['conversas'], abertura: false });
    });
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  salvarConfig(config: ConfigCrm): Promise<void> {
    return this.mutar((d) => {
      d.config = config;
    });
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async exportarJson(): Promise<string> {
    return exportarJson(await this.ler(COLECOES_DE_ANOTACAO), new Date(this.relogio()));
  }

  async importar(texto: string, modo: ModoImportacao): Promise<ResultadoImportar> {
    const r = lerImportacao(texto);
    if (!r.ok) return r;
    await this.mutar((d) => {
      const novo = modo === 'substituir' ? substituirDados(d, r.dados) : mesclarDados(d, r.dados);
      d.contatos = novo.contatos;
      d.etiquetas = novo.etiquetas;
      d.lembretes = novo.lembretes;
      d.respostas = novo.respostas;
    });
    return { ok: true, resumo: r.resumo };
  }

  // ── Abrir conversa ─────────────────────────────────────────────────────────

  async pedirAbertura(acao: Omit<AcaoPendente, 'tipo' | 'ts'>): Promise<void> {
    const pedido: AcaoPendente = { tipo: 'abrirConversa', ...acao, ts: this.relogio() };
    await chrome.storage.local.set({ [CHAVE_ACAO_PENDENTE]: pedido });
  }

  async consumirAbertura(): Promise<AcaoPendente | null> {
    const bruto = (await chrome.storage.local.get(CHAVE_ACAO_PENDENTE))[CHAVE_ACAO_PENDENTE];
    if (bruto === undefined) return null;
    await chrome.storage.local.remove(CHAVE_ACAO_PENDENTE);
    if (!ehAcaoPendente(bruto) || this.relogio() - bruto.ts > VALIDADE_ABERTURA_MS) return null;
    return bruto;
  }
}

let padrao: RepositorioContatos | null = null;

/** Repositório usado pela extensão (um por contexto: página, painel, service worker). */
export function repositorioPadrao(): RepositorioContatos {
  padrao ??= new RepositorioLocal();
  return padrao;
}

/** Só para testes: descarta o repositório padrão (e os ouvintes dele) para o próximo teste começar limpo. */
export function reiniciarRepositorioPadrao(): void {
  padrao = null;
}
