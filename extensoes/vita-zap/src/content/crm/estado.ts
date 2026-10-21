// Estado do CRM em memória no content script, espelhado em chrome.storage.local.
// Gravação com debounce (a lista de conversas muda o tempo todo) e leitura das mudanças feitas
// por outras partes da extensão (painel lateral, service worker).

import { carregarDados, CHAVES, dadosVazios, gravar, observarMudancas, sanearDados, type Colecao } from '../../shared/crm-store';
import type { DadosCrm } from '../../shared/crm-tipos';

const ATRASO_GRAVACAO_MS = 800;
const MAX_CONVERSAS = 4000;
const MANTER_CONVERSAS = 3000;

export class Estado {
  dados: DadosCrm = dadosVazios();
  private sujas = new Set<Colecao>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ouvintes = new Set<() => void>();
  private parar: (() => void) | null = null;

  async iniciar(aoAcaoPendente?: () => void): Promise<void> {
    this.dados = await carregarDados();
    this.parar = observarMudancas((colecoes, mudancas) => {
      let mudou = false;
      for (const c of colecoes) {
        if (c === 'conversas') continue; // só o content script escreve; o painel apenas lê
        const novo = sanearDados({ [c]: mudancas[CHAVES[c]]?.newValue ?? undefined })[c];
        if (novo === undefined) continue;
        if (JSON.stringify(novo) !== JSON.stringify(this.dados[c])) {
          (this.dados as unknown as Record<string, unknown>)[c] = novo;
          mudou = true;
        }
      }
      if (mudou) this.avisar();
      if (aoAcaoPendente && 'vz.acaoPendente' in mudancas) aoAcaoPendente();
    });
  }

  encerrar(): void {
    this.parar?.();
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

  /** Marca coleções como alteradas: grava com debounce e avisa a interface. */
  mudou(...colecoes: Colecao[]): void {
    for (const c of colecoes) this.sujas.add(c);
    if (this.timer == null) this.timer = setTimeout(() => void this.salvarAgora(), ATRASO_GRAVACAO_MS);
    this.avisar();
  }

  /** Só grava (sem avisar a interface): usado pela leitura da lista, que já re-renderiza sozinha. */
  mudouSilencioso(...colecoes: Colecao[]): void {
    for (const c of colecoes) this.sujas.add(c);
    if (this.timer == null) this.timer = setTimeout(() => void this.salvarAgora(), ATRASO_GRAVACAO_MS);
  }

  async salvarAgora(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const pendentes = [...this.sujas];
    this.sujas.clear();
    if (pendentes.includes('conversas')) this.podarConversas();
    for (const c of pendentes) {
      try {
        await gravar(c, this.dados[c] as never);
      } catch (e) {
        console.warn('[Vita Zap] não consegui gravar', c, e);
      }
    }
  }

  /** Mantém a coleção de conversas limitada: descarta as vistas há mais tempo e sem dados do usuário. */
  private podarConversas(): void {
    const todas = Object.values(this.dados.conversas);
    if (todas.length <= MAX_CONVERSAS) return;
    const ordem = todas.filter((c) => !this.dados.contatos[c.chave]).sort((a, b) => a.vistaEm - b.vistaEm);
    for (const c of ordem.slice(0, todas.length - MANTER_CONVERSAS)) delete this.dados.conversas[c.chave];
  }
}
