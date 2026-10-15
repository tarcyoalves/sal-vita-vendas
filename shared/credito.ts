// Análise de crédito (CRM Lembretes). Contrato ÚNICO entre provedor (servidor), regra de veredito, tela e PDF.
// O provedor real (Boa Vista via API Full) devolve o formato dele; o adaptador do servidor converte para
// `RelatorioCredito`. Nenhum campo aqui é inventado: campo que o provedor não trouxer fica null / lista vazia,
// e a tela/PDF mostram "Não informado pela fonte" (nunca "Nada consta" sem a fonte ter dito isso).

export type TipoDocumento = 'CNPJ' | 'CPF';
export type Veredito = 'APROVADO' | 'COM_RESTRICAO' | 'REPROVADO_A_PRAZO';
export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO';

/** Um grupo de anotações negativas (protestos, PEFIN, cheques...). `consultado=false`: a fonte não cobre o item. */
export interface GrupoAnotacao {
  consultado: boolean;
  quantidade: number;
  valorTotal: number | null;
  itens: Array<{ data: string | null; descricao: string; valor: number | null; local: string | null }>;
}

export interface RelatorioCredito {
  documento: string; // só dígitos
  tipo: TipoDocumento;
  consultadoEm: string; // ISO
  fonte: { provedor: string; produto: string; custoReais: number | null };
  score: {
    valor: number | null; // 0..1000
    probabilidadeInadimplencia: number | null; // %
    faixa: string | null;
    textoInterpretacao: string | null;
  };
  cadastro: {
    razaoSocial: string | null; nomeFantasia: string | null; situacao: string | null; situacaoEm: string | null;
    fundacao: string | null; naturezaJuridica: string | null; capitalSocial: number | null;
    cnaePrincipal: string | null; atividade: string | null; opcaoTributaria: string | null;
    inscricaoEstadual: string | null; endereco: string | null; municipio: string | null; uf: string | null;
    telefone: string | null; numeroFiliais: number | null;
  };
  socios: Array<{ documento: string | null; nome: string; entrada: string | null; participacao: number | null; cargo: string | null }>;
  consultasRecentes: Array<{ data: string; consultante: string; quantidade: number }>;
  anotacoes: {
    protestos: GrupoAnotacao;
    pendenciasFinanceiras: GrupoAnotacao; // PEFIN/REFIN/débitos comerciais
    chequesSemFundo: GrupoAnotacao;
    acoesJudiciais: GrupoAnotacao;
    falenciaRecuperacao: GrupoAnotacao;
  };
}

export const LIMITES_CREDITO = { scoreReprova: 400, scoreRestricao: 600, pendenciaReprovaReais: 5000 } as const;
export const CACHE_DIAS_CREDITO = 30;

const temAlgo = (g: GrupoAnotacao) => g.consultado && g.quantidade > 0;

/**
 * Veredito determinístico (não é a "opinião" do provedor):
 * - REPROVADO_A_PRAZO: score < 400, protesto, cheque sem fundo, falência/recuperação ou pendências financeiras
 *   somando mais de R$ 5.000 → só à vista.
 * - COM_RESTRICAO: score < 600, pendência financeira, ação judicial, ou score ausente.
 * - APROVADO: o resto.
 */
export function calcularVeredito(r: Pick<RelatorioCredito, 'score' | 'anotacoes'>): { veredito: Veredito; motivos: string[] } {
  const a = r.anotacoes; const s = r.score.valor; const motivos: string[] = [];
  if (s !== null && s < LIMITES_CREDITO.scoreReprova) motivos.push(`Score ${s} abaixo de ${LIMITES_CREDITO.scoreReprova}`);
  if (temAlgo(a.protestos)) motivos.push(`${a.protestos.quantidade} protesto(s)`);
  if (temAlgo(a.chequesSemFundo)) motivos.push(`${a.chequesSemFundo.quantidade} cheque(s) sem fundo`);
  if (temAlgo(a.falenciaRecuperacao)) motivos.push('Falência ou recuperação judicial');
  const pend = a.pendenciasFinanceiras;
  if (temAlgo(pend) && pend.valorTotal !== null && pend.valorTotal > LIMITES_CREDITO.pendenciaReprovaReais) {
    motivos.push(`Pendências financeiras somam R$ ${pend.valorTotal.toFixed(2).replace('.', ',')} (acima de R$ ${LIMITES_CREDITO.pendenciaReprovaReais})`);
  }
  if (motivos.length) return { veredito: 'REPROVADO_A_PRAZO', motivos };
  if (s === null) motivos.push('Score não informado pela fonte');
  else if (s < LIMITES_CREDITO.scoreRestricao) motivos.push(`Score ${s} abaixo de ${LIMITES_CREDITO.scoreRestricao}`);
  if (temAlgo(a.pendenciasFinanceiras)) motivos.push(`${a.pendenciasFinanceiras.quantidade} pendência(s) financeira(s)`);
  if (temAlgo(a.acoesJudiciais)) motivos.push(`${a.acoesJudiciais.quantidade} ação(ões) judicial(is)`);
  return motivos.length ? { veredito: 'COM_RESTRICAO', motivos } : { veredito: 'APROVADO', motivos: [] };
}

export const SEMAFORO: Record<Veredito, Semaforo> = { APROVADO: 'VERDE', COM_RESTRICAO: 'AMARELO', REPROVADO_A_PRAZO: 'VERMELHO' };
export const ROTULO_VEREDITO: Record<Veredito, string> = {
  APROVADO: 'Aprovado', COM_RESTRICAO: 'Com restrição', REPROVADO_A_PRAZO: 'Reprovado a prazo (só à vista)',
};

/** Validade do cache: consulta paga mais nova que isto é reaproveitada (não gasta crédito). */
export function relatorioValido(consultadoEm: string | Date, agora: Date = new Date()): boolean {
  const t = new Date(consultadoEm).getTime();
  return Number.isFinite(t) && agora.getTime() - t < CACHE_DIAS_CREDITO * 86_400_000;
}
