// Estado do CRM em memória no content script. Toda leitura/gravação passa pelo repositório
// (RepositorioContatos): a UI nunca fala com chrome.storage.
//
// `dados` é uma cópia local para desenhar sem esperar (a lista do WhatsApp muda o tempo todo).
// Mudanças feitas pela UI vão pelo repositório (`fazer`), que regrava e devolve o estado novo;
// mudanças de fora (painel lateral, service worker) chegam por `repo.aoMudar`.

import { COLECOES, dadosVazios, type Colecao } from '../../shared/crm-store';
import type { DadosCrm } from '../../shared/crm-tipos';
import type { RepositorioContatos } from '../../shared/repositorio';

const ATRASO_GRAVACAO_MS = 800;
const MAX_CONVERSAS = 4000;
const MANTER_CONVERSAS = 3000;

/** Coleções que a UI edita (as conversas lidas da lista só o content script escreve). */
const COLECOES_EDITAVEIS: Colecao[] = COLECOES.filter((c) => c !== 'conversas');

export class Estado {
  dados: DadosCrm = dadosVazios();
  private conversasSujas = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ouvintes = new Set<() => void>();
  private parar: (() => void) | null = null;

  constructor(readonly repo: RepositorioContatos) {}

  async iniciar(aoAbertura?: () => void): Promise<void> {
    this.dados = await this.repo.carregar();
    this.parar = this.repo.aoMudar((e) => {
      if (e.colecoes.some((c) => c !== 'conversas')) void this.recarregar();
      if (e.abertura) aoAbertura?.();
    });
  }

  encerrar(): void {
    this.parar?.();
    this.parar = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  ouvir(fn: () => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private avisar(): void {
    for (const f of this.ouvintes) f();
  }

  /** Relê as coleções editáveis do repositório e avisa a interface se algo mudou. */
  async recarregar(): Promise<void> {
    const novo = await this.repo.carregar(COLECOES_EDITAVEIS);
    let mudou = false;
    for (const c of COLECOES_EDITAVEIS) {
      if (JSON.stringify(novo[c]) !== JSON.stringify(this.dados[c])) {
        (this.dados as unknown as Record<string, unknown>)[c] = novo[c];
        mudou = true;
      }
    }
    if (mudou) this.avisar();
  }

  /** Executa uma operação no repositório e atualiza o estado local com o resultado. */
  async fazer<T>(op: (repo: RepositorioContatos) => Promise<T>): Promise<T> {
    const r = await op(this.repo);
    await this.recarregar();
    return r;
  }

  /** As conversas lidas da lista mudaram: grava com debounce (sem avisar a interface, que já redesenha sozinha). */
  conversasMudaram(): void {
    this.conversasSujas = true;
    if (this.timer == null) this.timer = setTimeout(() => void this.salvarAgora(), ATRASO_GRAVACAO_MS);
  }

  async salvarAgora(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.conversasSujas) return;
    this.conversasSujas = false;
    this.podarConversas();
    try {
      await this.repo.salvarConversas(this.dados.conversas);
    } catch (e) {
      console.warn('[Vita Zap] não consegui gravar as conversas', e);
    }
  }

  /** Mantém as conversas lidas limitadas: descarta as vistas há mais tempo. */
  private podarConversas(): void {
    const todas = Object.values(this.dados.conversas);
    if (todas.length <= MAX_CONVERSAS) return;
    const ordem = [...todas].sort((a, b) => a.vistaEm - b.vistaEm);
    for (const c of ordem.slice(0, todas.length - MANTER_CONVERSAS)) delete this.dados.conversas[c.chave];
  }
}
