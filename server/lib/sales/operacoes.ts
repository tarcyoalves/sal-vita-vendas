// Operações do Sales AI usadas pelo painel do admin (server/routers/sales.ts) e pelas rotas do
// Hermes (server/salesRoutes.ts). ESTE ARQUIVO DEFINE O CONTRATO entre os dois lados; a
// implementação é do lote "API do Hermes, ciclo e ponte". Até lá, cada função lança NAO_IMPLEMENTADO.
import type { JourneyState, MessageStatus, SalesMode } from '../../../shared/sales';

export class NaoImplementado extends Error {
  constructor(nome: string) { super(`Sales AI: ${nome} ainda não implementado`); this.name = 'NaoImplementado'; }
}

export interface PainelResumo {
  modo: SalesMode;
  canal: { ativo: boolean; politicaAprovada: boolean };
  agenteAtivo: boolean;
  disponibilidade: 'nao_informado' | 'disponivel' | 'em_falta';
  executores: Array<{ executor: string; versao: string | null; ultimoSinalEm: Date; atrasado: boolean }>;
  hoje: {
    dataSp: string;
    empresasNovasContatadas: number;
    mensagensAceitas: number;
    respostasHumanas: number;
    pedidosDeSaida: number;
    devolvidas: number;
    desconhecidas: number;
  };
  excecoesAbertas: number;
  loteDoDia: { id: number; status: string; tamanho: number } | null;
  jornadasPorEstado: Partial<Record<JourneyState, number>>;
}

export interface ResultadoCiclo {
  simulado: boolean;
  empresasSincronizadas: number;
  contatosNovos: number;
  qualificados: number;
  inelegiveisPorMotivo: Record<string, number>;
  loteId: number | null;
  mensagensGeradas: number;
  mensagensNaoGeradas: Record<string, number>;
  reservasLiberadas: number;
  marcadasDesconhecidas: number;
  cadenciasAvancadas: number;
  tarefasCrmProcessadas: number;
  avisos: string[];
}

export interface ItemLote {
  messageId: number;
  journeyId: number;
  companyId: number;
  empresa: string;
  cidadeUf: string | null;
  email: string;
  segmentos: string[];
  score: number | null;
  scoreMotivos: string[];
  passo: number;
  assunto: string;
  corpo: string;
  status: MessageStatus;
  fonteEmail: string | null;
}

export interface JornadaResumo {
  journeyId: number;
  companyId: number;
  contactId: number;
  empresa: string;
  cidadeUf: string | null;
  email: string;
  estado: JourneyState;
  passo: number;
  score: number | null;
  segmentos: string[];
  elegivel: boolean | null;
  motivosInelegivel: string[];
  pausada: string | null;
  ultimoContatoEm: Date | null;
  ultimoEventoEm: Date | null;
}

export interface RelatorioVendas {
  de: string;
  ate: string;
  empresas: { pesquisadas: number; elegiveis: number; contatadas: number };
  mensagens: { tentadas: number; aceitas: number; devolvidas: number; desconhecidas: number; falhas: number };
  respostas: { humanas: number; positivas: number; pedidosDeSaida: number; reclamacoes: number };
  agente: { conversas: number; linksDePedido: number; encaminhadas: number; respostasBarradas: number };
  vendas: { pedidosSiteComCupomCampanha: number; caixasSite: number; receitaSiteCentavos: number };
  /** Indício, não prova: o Mercado Livre não informa a origem do comprador. */
  indicios: string[];
  porSegmento: Array<{ segmento: string; contatadas: number; respostas: number; positivas: number }>;
  porUf: Array<{ uf: string; contatadas: number; respostas: number; positivas: number }>;
  /** Sem custo industrial informado, margem e lucro não são calculáveis. */
  rentabilidade: 'nao_calculavel';
}

export async function obterPainel(): Promise<PainelResumo> { throw new NaoImplementado('obterPainel'); }

/** Muda o modo. Para PAUSED: revoga reservas (RESERVED → PENDING, fence sobe). */
export async function definirModo(_modo: SalesMode, _por: string, _motivo?: string): Promise<{ modo: SalesMode; reservasRevogadas: number }> {
  throw new NaoImplementado('definirModo');
}

/** Ciclo diário/idempotente: ponte Radar → prospecção, pontuação, elegibilidade, lote, cadência, conciliação, saída CRM. */
export async function executarCiclo(_opts: { por: string; simular?: boolean }): Promise<ResultadoCiclo> {
  throw new NaoImplementado('executarCiclo');
}

export async function listarLote(_loteId?: number): Promise<{ lote: { id: number; data: string; status: string; tamanho: number } | null; itens: ItemLote[] }> {
  throw new NaoImplementado('listarLote');
}
export async function aprovarLote(_loteId: number, _por: string): Promise<{ aprovadas: number }> { throw new NaoImplementado('aprovarLote'); }
export async function cortarDoLote(_messageId: number, _por: string, _motivo: string): Promise<void> { throw new NaoImplementado('cortarDoLote'); }

export async function listarJornadas(_f: { estado?: JourneyState; busca?: string; pagina: number; porPagina: number }): Promise<{ itens: JornadaResumo[]; total: number }> {
  throw new NaoImplementado('listarJornadas');
}
export async function pausarJornada(_journeyId: number, _motivo: string, _por: string): Promise<void> { throw new NaoImplementado('pausarJornada'); }
export async function retomarJornada(_journeyId: number, _por: string): Promise<void> { throw new NaoImplementado('retomarJornada'); }

/** Supressão manual: propaga pelos dois bancos (suppressEmailGlobal), cancela mensagens e põe a jornada em SUPPRESSED. */
export async function suprimirContato(_email: string, _motivo: string, _por: string): Promise<{ ok: boolean; falhas: string[] }> {
  throw new NaoImplementado('suprimirContato');
}

export async function listarExcecoes(_f: { status: 'open' | 'resolved' | 'dismissed'; pagina: number; porPagina: number }): Promise<{
  itens: Array<{ id: number; kind: string; severity: string; title: string; detail: string | null; evidence: unknown; proposedAction: unknown; createdBy: string; createdAt: Date; companyId: number | null; contactId: number | null; conversationId: string | null }>;
  total: number;
}> { throw new NaoImplementado('listarExcecoes'); }
export async function resolverExcecao(_id: number, _r: { status: 'resolved' | 'dismissed'; resolucao: string }, _por: string): Promise<void> {
  throw new NaoImplementado('resolverExcecao');
}

/** Mensagens UNKNOWN para conciliação humana. Nunca reenviadas sozinhas. */
export async function listarDesconhecidas(): Promise<Array<{ messageId: number; email: string; empresa: string; passo: number; ultimaTentativaEm: Date | null; executor: string | null; respostaSmtp: string | null }>> {
  throw new NaoImplementado('listarDesconhecidas');
}
/** 'foi_enviada' → ACCEPTED (avança a cadência); 'nao_foi_enviada' → PENDING com fence novo (pode sair de novo). */
export async function resolverDesconhecida(_messageId: number, _decisao: 'foi_enviada' | 'nao_foi_enviada', _por: string): Promise<void> {
  throw new NaoImplementado('resolverDesconhecida');
}

export async function relatorio(_p: { de: string; ate: string }): Promise<RelatorioVendas> { throw new NaoImplementado('relatorio'); }
