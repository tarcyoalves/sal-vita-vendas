// Regras PURAS de tela da análise de crédito (sem DOM, sem React): quem vê o quê, quando avisar, textos.
// O servidor é quem manda (consultar é adminProcedure; PDF/relatório/listar são staffProcedure): estas regras só
// escondem o que o papel não pode usar, para o botão não aparecer e dar erro.
import { CACHE_DIAS_CREDITO, SALDO_BAIXO_REAIS, SEMAFORO, type Semaforo, type Veredito } from '../../../../shared/credito';
import { PRODUTO_PADRAO, itemDoCatalogo } from '../../../../shared/creditoCatalogo';
import { normalizarPrazo } from '../../../../shared/smbiCondicoes';

/** Custo do produto padrão (Boa Vista), vindo do catálogo único (medido em 16/10/2026). */
export const CUSTO_CONSULTA_REAIS = itemDoCatalogo(PRODUTO_PADRAO)?.custoReais ?? 2.75;

export type PapelCredito = 'admin' | 'manager' | 'user';

export interface PermissoesCredito {
  /** Semáforo e card de leitura: todos os papéis (o servidor limita o atendente à carteira dele). */
  verCard: boolean;
  /** Relatório completo e PDF (têm sócios e dados do documento): admin e gerente. */
  verRelatorio: boolean;
  baixarPdf: boolean;
  /** Página "Análise de crédito" e menu. */
  verPagina: boolean;
  /** Consulta paga, vincular/desvincular, liberar pedido, interruptor, limite, saldo: só admin. */
  consultar: boolean;
  administrar: boolean;
}

export function permissoesCredito(role: string | null | undefined): PermissoesCredito {
  const admin = role === 'admin';
  const staff = admin || role === 'manager';
  return { verCard: !!role, verRelatorio: staff, baixarPdf: staff, verPagina: staff, consultar: admin, administrar: admin };
}

// ── Estado do semáforo ───────────────────────────────────────────────────────
export type CorSemaforoTela = Semaforo | 'CINZA';

export interface EstadoSemaforo { cor: CorSemaforoTela; rotulo: string }

const ROTULO_COR: Record<Semaforo, string> = {
  VERDE: 'Crédito aprovado', AMARELO: 'Crédito com restrição', VERMELHO: 'Crédito reprovado a prazo (só à vista)',
};

/**
 * Cinza = sem análise OU análise vencida (mais de 30 dias): igual ao servidor, que não bloqueia nem confia em
 * relatório vencido. `simulado` só ganha uma marca no texto: nunca esconde a cor.
 */
export function estadoSemaforo(r: { veredito: Veredito; valido: boolean; simulado?: boolean } | null | undefined): EstadoSemaforo {
  if (!r) return { cor: 'CINZA', rotulo: 'Sem análise de crédito' };
  const sufixo = r.simulado ? ' (SIMULAÇÃO, dados fictícios)' : '';
  if (!r.valido) return { cor: 'CINZA', rotulo: `Análise vencida (mais de ${CACHE_DIAS_CREDITO} dias)${sufixo}` };
  return { cor: SEMAFORO[r.veredito], rotulo: ROTULO_COR[SEMAFORO[r.veredito]] + sufixo };
}

// ── Aviso e liberação no pedido ──────────────────────────────────────────────
export const prazoEhAVista = (prazoSal: string | null | undefined): boolean => normalizarPrazo(prazoSal) === 'AVISTA';

/** Espelha decidirBloqueioCredito (servidor): relatório válido REPROVADO e prazo do sal diferente de à vista. */
export function mostrarAvisoCreditoReprovado(e: {
  veredito: Veredito | null | undefined; valido: boolean | null | undefined; prazoSal: string | null | undefined;
}): boolean {
  return e.veredito === 'REPROVADO_A_PRAZO' && e.valido === true && !prazoEhAVista(e.prazoSal);
}

export interface CamposLiberacao {
  creditoLiberadoPor?: string | null; creditoLiberadoEm?: string | null; creditoLiberadoMotivo?: string | null;
}

/** Servidor trata "liberado" por creditoLiberadoEm preenchido. */
export const pedidoLiberado = (p: CamposLiberacao): boolean => !!p.creditoLiberadoEm;

export function dataHoraBR(valor: string | Date | null | undefined): string {
  if (!valor) return '--';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).replace(',', '');
}

export function dataBR(valor: string | Date | null | undefined): string {
  if (!valor) return '--';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** "Liberado por Fulano em 15/10/2026 11:32 — motivo". null se o pedido não foi liberado. */
export function textoLiberacao(p: CamposLiberacao): string | null {
  if (!pedidoLiberado(p)) return null;
  const motivo = (p.creditoLiberadoMotivo ?? '').trim();
  return `Liberado por ${p.creditoLiberadoPor?.trim() || 'administrador'} em ${dataHoraBR(p.creditoLiberadoEm)}${motivo ? ` — ${motivo}` : ''}`;
}

export function podeMostrarLiberar(e: { admin: boolean; avisoVisivel: boolean; liberado: boolean }): boolean {
  return e.admin && e.avisoVisivel && !e.liberado;
}

// ── Origem dos vínculos relatório x pedido ───────────────────────────────────
export function rotuloOrigemVinculo(origem: string | null | undefined): string {
  switch (origem) {
    case 'CONSULTA_NO_PEDIDO': return 'Consulta feita no pedido';
    case 'ENVIO_SMBI': return 'Vigente no envio ao SMBI';
    case 'MANUAL': return 'Vinculado manualmente';
    case null: case undefined: return 'Não vinculado';
    default: return 'Origem não identificada';
  }
}

// ── Consulta ─────────────────────────────────────────────────────────────────
export function vaiReaproveitar(
  ultimo: { valido: boolean; provedor?: string | null } | null | undefined,
  o: { forcarNova: boolean; provedorAtual: string | null | undefined },
): boolean {
  if (!ultimo || o.forcarNova || !ultimo.valido) return false;
  return !ultimo.provedor || !o.provedorAtual || ultimo.provedor === o.provedorAtual;
}

export function motivoConsultaValido(motivo: string): boolean {
  return motivo.trim().length >= 5 && motivo.trim().length <= 300;
}

export function textoCustoConsulta(simulado: boolean): string {
  return simulado
    ? 'Provedor simulado: sem custo, dados fictícios.'
    : `Esta consulta custa ${CUSTO_CONSULTA_REAIS.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e é cobrada da conta API Full.`;
}

/** Aviso amarelo "Saldo baixo": saldo conhecido abaixo de SALDO_BAIXO_REAIS (saldo desconhecido não avisa). */
export const saldoEstaBaixo = (saldo: number | null | undefined): boolean => saldo != null && saldo < SALDO_BAIXO_REAIS;
