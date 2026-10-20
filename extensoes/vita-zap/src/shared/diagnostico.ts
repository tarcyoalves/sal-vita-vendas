// Diagnóstico: registro circular (últimos 200 eventos) em memória + IndexedDB, para o dono
// conseguir mandar "o que aconteceu" sem abrir o console.
//
// PRIVACIDADE: não guarda o texto da mensagem, nem nome de outro contato além do item atual,
// e mascara qualquer sequência que pareça telefone. Só o painel escreve aqui.

import { type Banco, apagarDiagnostico, listarDiagnostico, salvarEventoDiagnostico } from './banco';
import type { DiagnosticoPagina, RespostaConteudo } from './mensagens';

export const MAX_EVENTOS_DIAGNOSTICO = 200;

export interface EventoDiagnostico {
  /** Chave de ordenação/armazenamento (ISO + contador). */
  id: string;
  quando: string;
  fase: string;
  /** Tipo do pedido enviado ao content script (nunca o conteúdo). */
  pedido: string | null;
  resposta: { ok: boolean; codigo?: string; erro?: string } | null;
  versao: string;
  /** Contato atual (telefones mascarados) — só o item em andamento. */
  item: string | null;
  pagina: { url: string; idioma: string; seletores: Record<string, string>; dataIds?: { total: number; amostras: string[] }; estruturaMensagem?: string[]; caixaBusca?: DiagnosticoPagina['caixaBusca']; linhasMensagem?: DiagnosticoPagina['linhasMensagem']; classificacao?: DiagnosticoPagina['classificacao'] } | null;
}

export type NovoEvento = Omit<EventoDiagnostico, 'id' | 'quando' | 'versao'>;

/** Troca sequências de 8+ dígitos (com +, espaços, hífens, parênteses) por "••••12" (últimos 2). */
export function mascararTelefones(texto: string): string {
  return texto.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => {
    const digitos = m.replace(/\D/g, '');
    return digitos.length < 8 ? m : `••••${digitos.slice(-2)}`;
  });
}

function limpar(texto: string, max = 300): string {
  const t = mascararTelefones(texto).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function resumirResposta(r: RespostaConteudo): NonNullable<EventoDiagnostico['resposta']> {
  return r.ok ? { ok: true } : { ok: false, codigo: r.codigo, erro: limpar(r.erro) };
}

export function resumirPagina(d: DiagnosticoPagina): NonNullable<EventoDiagnostico['pagina']> {
  const seletores: Record<string, string> = {};
  for (const s of d.seletores) seletores[s.chave] = s.casou ?? 'nenhuma';
  return {
    url: limpar(d.url, 120),
    idioma: limpar(d.idioma, 20),
    seletores,
    dataIds: { total: d.dataIds.total, amostras: d.dataIds.amostras.slice(0, 8).map((a) => a.slice(0, 120)) },
    estruturaMensagem: d.estruturaMensagem.slice(0, 40),
    caixaBusca: d.caixaBusca ? { ...d.caixaBusca, ariaLabel: d.caixaBusca.ariaLabel === null ? null : limpar(d.caixaBusca.ariaLabel, 60) } : null,
    linhasMensagem: { ...d.linhasMensagem, autores: d.linhasMensagem.autores.slice(0, 10).map((a) => a.slice(0, 3)) },
    classificacao: d.classificacao,
  };
}

export function nomeSeguro(nome: string | null | undefined): string | null {
  return nome ? limpar(nome, 80) : null;
}

type Ouvinte = () => void;

export class RegistroDiagnostico {
  private eventos: EventoDiagnostico[] = [];
  private contador = 0;
  private readonly ouvintes = new Set<Ouvinte>();

  constructor(
    private readonly db: Banco | null,
    readonly versao: string,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Carrega o que já estava gravado (últimos 200). */
  async carregar(): Promise<void> {
    if (!this.db) return;
    const gravados = await listarDiagnostico(this.db);
    this.eventos = [...gravados, ...this.eventos].slice(-MAX_EVENTOS_DIAGNOSTICO);
    this.avisar();
  }

  registrar(novo: NovoEvento): void {
    const quando = this.agora().toISOString();
    this.contador += 1;
    const ev: EventoDiagnostico = {
      ...novo,
      item: nomeSeguro(novo.item),
      resposta: novo.resposta ? { ...novo.resposta, ...(novo.resposta.erro !== undefined ? { erro: limpar(novo.resposta.erro) } : {}) } : null,
      id: `${quando}#${String(this.contador).padStart(6, '0')}`,
      quando,
      versao: this.versao,
    };
    this.eventos.push(ev);
    if (this.eventos.length > MAX_EVENTOS_DIAGNOSTICO) this.eventos.splice(0, this.eventos.length - MAX_EVENTOS_DIAGNOSTICO);
    if (this.db) void salvarEventoDiagnostico(this.db, ev, MAX_EVENTOS_DIAGNOSTICO).catch(() => undefined);
    this.avisar();
  }

  lista(): readonly EventoDiagnostico[] {
    return this.eventos;
  }

  async limpar(): Promise<void> {
    this.eventos = [];
    if (this.db) await apagarDiagnostico(this.db);
    this.avisar();
  }

  assinar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private avisar(): void {
    for (const fn of this.ouvintes) fn();
  }
}

/** Texto do diagnóstico, pronto para colar numa conversa ou salvar em .txt. */
export function textoDiagnostico(eventos: readonly EventoDiagnostico[], versao: string, geradoEm: Date = new Date()): string {
  const linhas = [
    `Vita Zap ${versao} — diagnóstico`,
    `Gerado em: ${geradoEm.toISOString()}`,
    `Eventos: ${eventos.length} (máx. ${MAX_EVENTOS_DIAGNOSTICO})`,
    'Sem texto de mensagem; telefones mascarados.',
    '',
  ];
  for (const e of eventos) {
    const r = e.resposta ? (e.resposta.ok ? 'ok' : `ERRO ${e.resposta.codigo ?? '?'}: ${e.resposta.erro ?? ''}`) : '-';
    linhas.push(`[${e.quando}] fase=${e.fase} pedido=${e.pedido ?? '-'} resposta=${r} versao=${e.versao}${e.item ? ` item="${e.item}"` : ''}`);
    if (e.pagina) {
      linhas.push(`    página: ${e.pagina.url} idioma="${e.pagina.idioma}"`);
      for (const [chave, casou] of Object.entries(e.pagina.seletores)) linhas.push(`    seletor ${chave}: ${casou}`);
      if (e.pagina.dataIds) {
        linhas.push(`    #main [data-id]: ${e.pagina.dataIds.total}`);
        for (const a of e.pagina.dataIds.amostras) linhas.push(`      data-id: ${a}`);
      }
      if (e.pagina.caixaBusca !== undefined) linhas.push(`    caixa de busca: ${e.pagina.caixaBusca ? JSON.stringify(e.pagina.caixaBusca) : 'não achada'}`);
      if (e.pagina.linhasMensagem) linhas.push(`    linhas de mensagem: ${JSON.stringify(e.pagina.linhasMensagem)}`);
      if (e.pagina.classificacao) linhas.push(`    classificação: ${JSON.stringify(e.pagina.classificacao)}`);
      for (const x of e.pagina.estruturaMensagem ?? []) linhas.push(`    mensagem ${x}`);
    }
  }
  return linhas.join('\n');
}
