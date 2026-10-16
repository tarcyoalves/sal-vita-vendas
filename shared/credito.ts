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
  itens: Array<{
    data: string | null; descricao: string; valor: number | null; local: string | null; credor?: string | null;
    /** Só no relatório consolidado: fonte(s) que trouxeram a ocorrência ("Serasa Premium" ou "A + B"). */
    fonte?: string;
    /** Demais campos não vazios da ocorrência na fonte (rótulo legível -> valor), para o detalhe sob o item. */
    extras?: Record<string, string>;
  }>;
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
  /** Movimentação comercial (quando a fonte informa). Opcional: relatórios antigos não têm. */
  comportamento?: {
    ultimaCompraEm: string | null;          // última compra captada no mercado
    relacionamentoMaisAntigoEm: string | null;
    fontesConsultadas: number | null;       // fornecedores que informaram
    pagamentoPontualPct: number | null;     // % de pagamentos em dia
  };
  /** Extras que só algumas fontes trazem (Serasa Premium, Define Risco, Boa Vista). Opcional e aditivo. */
  complementos?: {
    faturamentoPresumidoFaixa?: string | null;
    veiculos?: Array<{ marcaModelo: string; placa?: string | null }>;
    consultas12Meses?: number | null;
  };
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
/** Saldo da conta API Full abaixo disto acende o aviso amarelo "Saldo baixo" no painel (16/10/2026). */
export const SALDO_BAIXO_REAIS = 15;

const temAlgo = (g: GrupoAnotacao) => g.consultado && g.quantidade > 0;

// ── Pontos de atenção do dono (15/10/2026) ──────────────────────────────────
// Tempo de empresa, excesso de consultas recentes, entrada/troca recente de sócios, movimentação de compras
// e restrições "atenuadas" (pequenas, antigas ou de órgão público como ANTT) — estas pedem análise com calma,
// não reprovação automática.
export const LIMITES_SINAIS = {
  empresaNovaAlertaMeses: 12, empresaNovaAtencaoMeses: 36, empresaConsolidadaAnos: 10,
  consultasJanelaDias: 30, consultasAtencao: 3, consultasAlerta: 5,
  socioRecenteAlertaMeses: 6, socioRecenteAtencaoMeses: 12,
  semComprasAtencaoDias: 180, comprasRecentesDias: 90,
  restricaoPequenaReais: 1000, restricaoAntigaMeses: 24,
} as const;

/** Credores de órgão público/autarquia: restrição costuma ser multa/taxa, não calote comercial. */
const ORGAOS_PUBLICOS = /\b(antt|dnit|detran|ibama|receita|fazenda|pgfn|procuradoria|prefeitura|municipio|estado d[eo]|uniao|inss|crea|crq|crmv|conselho regional|anvisa|inmetro|agencia nacional)\b/;

const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const mesesEntre = (de: string | null | undefined, agora: Date): number | null => {
  if (!de) return null;
  const d = new Date(de); if (!Number.isFinite(d.getTime())) return null;
  return (agora.getTime() - d.getTime()) / (30.44 * 86_400_000);
};

export type Item = GrupoAnotacao['itens'][number];
/** Motivo pelo qual uma ocorrência merece análise com calma (ou null se é restrição "cheia"). */
export function atenuacaoDoItem(item: Item, agora: Date = new Date()): string | null {
  const texto = sem(`${item.credor ?? ''} ${item.descricao} ${item.local ?? ''}`);
  if (ORGAOS_PUBLICOS.test(texto)) return 'órgão público';
  const idade = mesesEntre(item.data, agora);
  if (idade !== null && idade >= LIMITES_SINAIS.restricaoAntigaMeses) return `antiga (${Math.floor(idade / 12)} ano(s))`;
  if (item.valor !== null && item.valor <= LIMITES_SINAIS.restricaoPequenaReais) return 'valor pequeno';
  return null;
}
/** Grupo com ocorrências em que TODAS são atenuadas (e os itens batem com a quantidade). */
function grupoTodoAtenuado(g: GrupoAnotacao, agora: Date): boolean {
  return g.itens.length > 0 && g.itens.length >= g.quantidade && g.itens.every((i) => atenuacaoDoItem(i, agora) !== null);
}

export type NivelSinal = 'ALERTA' | 'ATENCAO' | 'POSITIVO';
export interface SinalCredito { codigo: string; nivel: NivelSinal; titulo: string; detalhe: string }

type DadosSinais = Partial<Pick<RelatorioCredito, 'cadastro' | 'socios' | 'consultasRecentes' | 'comportamento'>> & Pick<RelatorioCredito, 'anotacoes'>;

export function analisarSinais(r: DadosSinais, agora: Date = new Date()): SinalCredito[] {
  const L = LIMITES_SINAIS; const out: SinalCredito[] = [];
  // 1. Tempo de existência
  const idade = mesesEntre(r.cadastro?.fundacao, agora);
  if (idade !== null) {
    const anos = Math.floor(idade / 12);
    if (idade < L.empresaNovaAlertaMeses) out.push({ codigo: 'EMPRESA_NOVA', nivel: 'ALERTA', titulo: 'Empresa com menos de 1 ano', detalhe: `Fundada há ${Math.max(0, Math.floor(idade))} mês(es).` });
    else if (idade < L.empresaNovaAtencaoMeses) out.push({ codigo: 'EMPRESA_JOVEM', nivel: 'ATENCAO', titulo: 'Empresa com menos de 3 anos', detalhe: `Fundada há ${anos} ano(s).` });
    else if (anos >= L.empresaConsolidadaAnos) out.push({ codigo: 'EMPRESA_CONSOLIDADA', nivel: 'POSITIVO', titulo: 'Empresa consolidada', detalhe: `${anos} anos de existência.` });
  }
  // 2. Consultas recentes ao documento (busca de crédito acima do normal)
  if (r.consultasRecentes) {
    const n = r.consultasRecentes.filter((c) => { const m = mesesEntre(c.data, agora); return m !== null && m * 30.44 <= L.consultasJanelaDias; })
      .reduce((s, c) => s + (c.quantidade || 1), 0);
    if (n >= L.consultasAlerta) out.push({ codigo: 'MUITAS_CONSULTAS', nivel: 'ALERTA', titulo: 'Muitas consultas recentes', detalhe: `${n} consulta(s) nos últimos ${L.consultasJanelaDias} dias — pode estar buscando crédito acima do normal.` });
    else if (n >= L.consultasAtencao) out.push({ codigo: 'CONSULTAS_ACIMA', nivel: 'ATENCAO', titulo: 'Consultas recentes acima do comum', detalhe: `${n} consulta(s) nos últimos ${L.consultasJanelaDias} dias.` });
  }
  // 3. Entrada/troca recente de sócios ou administradores
  if (r.socios?.length) {
    const recentes = r.socios.map((s) => ({ s, m: mesesEntre(s.entrada, agora) })).filter((x) => x.m !== null && x.m < L.socioRecenteAtencaoMeses);
    if (recentes.length) {
      const pior = Math.min(...recentes.map((x) => x.m as number));
      const nomes = recentes.map((x) => x.s.nome).join(', ');
      out.push({ codigo: 'SOCIO_RECENTE', nivel: pior < L.socioRecenteAlertaMeses ? 'ALERTA' : 'ATENCAO', titulo: 'Entrada ou troca recente de sócio/administrador', detalhe: `${nomes} — há menos de ${pior < L.socioRecenteAlertaMeses ? 6 : 12} meses.` });
    }
  }
  // 4. Movimentação de compras
  const c = r.comportamento;
  if (c) {
    const dias = (() => { const m = mesesEntre(c.ultimaCompraEm, agora); return m === null ? null : m * 30.44; })();
    if (dias === null) out.push({ codigo: 'SEM_MOVIMENTACAO_INFORMADA', nivel: 'ATENCAO', titulo: 'Sem movimentação de compras informada', detalhe: 'A fonte não registrou compras no mercado.' });
    else if (dias > L.semComprasAtencaoDias) out.push({ codigo: 'SEM_COMPRAS_RECENTES', nivel: 'ATENCAO', titulo: 'Sem compras recentes no mercado', detalhe: `Última compra há ${Math.floor(dias)} dias.` });
    else if (dias <= L.comprasRecentesDias) out.push({ codigo: 'COMPRANDO_NORMALMENTE', nivel: 'POSITIVO', titulo: 'Comprando normalmente no mercado', detalhe: `Última compra há ${Math.floor(dias)} dias${c.pagamentoPontualPct !== null ? `; ${c.pagamentoPontualPct}% dos pagamentos em dia` : ''}.` });
  }
  // 5. Restrições atenuadas (estudar com calma)
  for (const [nome, g] of [['Protestos', r.anotacoes.protestos], ['Pendências financeiras', r.anotacoes.pendenciasFinanceiras]] as const) {
    if (!temAlgo(g)) continue;
    const at = g.itens.map((i) => atenuacaoDoItem(i, agora)).filter((x): x is string => !!x);
    if (at.length) out.push({ codigo: 'RESTRICAO_ATENUADA', nivel: 'ATENCAO', titulo: `${nome}: estudar com calma`, detalhe: `${at.length} de ${g.quantidade} ocorrência(s) são ${[...new Set(at.map((x) => x.replace(/ \(.*\)$/, '')))].join(', ')} — pode ser problema antigo com o cliente operando normalmente.` });
  }
  return out;
}

/**
 * Veredito determinístico (não é a "opinião" do provedor):
 * - REPROVADO_A_PRAZO: score < 400, cheque sem fundo, falência/recuperação, protesto ou pendências > R$ 5.000 —
 *   EXCETO quando todos os protestos/pendências são atenuados (pequenos, antigos ou de órgão público): aí vira
 *   COM_RESTRICAO "estudar com calma".
 * - COM_RESTRICAO: score < 600, pendência, ação judicial, score ausente, restrição atenuada, ou qualquer sinal de
 *   ALERTA (empresa < 1 ano, muitas consultas recentes, sócio novo < 6 meses) → análise manual.
 * - APROVADO: o resto.
 */
export function calcularVeredito(r: DadosSinais & Pick<RelatorioCredito, 'score'>, agora: Date = new Date()): { veredito: Veredito; motivos: string[] } {
  const a = r.anotacoes; const s = r.score.valor; const motivos: string[] = []; const atencao: string[] = [];
  if (s !== null && s < LIMITES_CREDITO.scoreReprova) motivos.push(`Score ${s} abaixo de ${LIMITES_CREDITO.scoreReprova}`);
  if (temAlgo(a.protestos)) {
    if (grupoTodoAtenuado(a.protestos, agora)) atencao.push(`${a.protestos.quantidade} protesto(s) pequeno(s)/antigo(s)/de órgão público — estudar com calma`);
    else motivos.push(`${a.protestos.quantidade} protesto(s)`);
  }
  if (temAlgo(a.chequesSemFundo)) motivos.push(`${a.chequesSemFundo.quantidade} cheque(s) sem fundo`);
  if (temAlgo(a.falenciaRecuperacao)) motivos.push('Falência ou recuperação judicial');
  const pend = a.pendenciasFinanceiras;
  if (temAlgo(pend) && pend.valorTotal !== null && pend.valorTotal > LIMITES_CREDITO.pendenciaReprovaReais && !grupoTodoAtenuado(pend, agora)) {
    motivos.push(`Pendências financeiras somam R$ ${pend.valorTotal.toFixed(2).replace('.', ',')} (acima de R$ ${LIMITES_CREDITO.pendenciaReprovaReais})`);
  }
  if (motivos.length) return { veredito: 'REPROVADO_A_PRAZO', motivos };
  motivos.push(...atencao);
  if (s === null) motivos.push('Score não informado pela fonte');
  else if (s < LIMITES_CREDITO.scoreRestricao) motivos.push(`Score ${s} abaixo de ${LIMITES_CREDITO.scoreRestricao}`);
  if (temAlgo(pend)) motivos.push(`${pend.quantidade} pendência(s) financeira(s)${grupoTodoAtenuado(pend, agora) ? ' — pequenas/antigas/de órgão público' : ''}`);
  if (temAlgo(a.acoesJudiciais)) motivos.push(`${a.acoesJudiciais.quantidade} ação(ões) judicial(is)`);
  for (const sinal of analisarSinais(r, agora)) if (sinal.nivel === 'ALERTA') motivos.push(`${sinal.titulo} — análise manual`);
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

const GRAVIDADE: Record<Veredito, number> = { APROVADO: 0, COM_RESTRICAO: 1, REPROVADO_A_PRAZO: 2 };

/** O PIOR veredito da lista (REPROVADO_A_PRAZO > COM_RESTRICAO > APROVADO); null se vazia. */
export function piorVeredito(vereditos: readonly Veredito[]): Veredito | null {
  let pior: Veredito | null = null;
  for (const v of vereditos) if (pior === null || GRAVIDADE[v] > GRAVIDADE[pior]) pior = v;
  return pior;
}

// ── Relatório consolidado do documento (16/10/2026) ──────────────────────────
// Combina os relatórios VÁLIDOS mais recentes de cada produto do MESMO documento, SEM inventar nada: cada dado vem de
// uma fonte e, quando as fontes discordam, a divergência é mostrada (nunca escondida). Scores NUNCA são fundidos num
// número único (modelos diferentes): ficam lado a lado, um por fonte.
export interface ItemParaConsolidar { relatorio: RelatorioCredito; produto: string; produtoNome: string; consultadoEm: string }

export interface ScoreDaFonte {
  produto: string; produtoNome: string;
  valor: number | null; probabilidadeInadimplencia: number | null; faixa: string | null; texto: string | null;
  /** false = a fonte não calculou o score ("Serasa Premium: score não calculado"). */
  calculado: boolean;
}
export interface FonteConsolidada { produto: string; produtoNome: string; consultadoEm: string; custoReais: number | null }
export type ChaveGrupoAnotacao = keyof RelatorioCredito['anotacoes'];
export const ROTULO_GRUPO: Record<ChaveGrupoAnotacao, string> = {
  protestos: 'Protestos', pendenciasFinanceiras: 'Pendências financeiras', chequesSemFundo: 'Cheques sem fundo',
  acoesJudiciais: 'Ações judiciais', falenciaRecuperacao: 'Falência / Recuperação judicial',
};

export interface RelatorioConsolidado {
  documento: string;
  tipo: TipoDocumento;
  /** Data da consulta mais recente entre as fontes. */
  consultadoEm: string;
  /** false = nenhuma fonte tem menos de 30 dias (a tela mostra "vencido"). */
  valido: boolean;
  simulado: boolean;
  scores: ScoreDaFonte[];
  fontes: FonteConsolidada[];
  /** Relatório fundido (cadastro, sócios, anotações, consultas, comportamento). `score` = o PIOR score calculado, só para as regras. */
  fundido: RelatorioCredito;
  /** Por grupo com quantidades diferentes entre as fontes: "Consulta simples: 0 · Serasa Premium: 10". */
  divergenciaPorGrupo: Partial<Record<ChaveGrupoAnotacao, string>>;
  /** Scores muito distantes entre fontes (null se não há). */
  divergenciaScore: string | null;
  /** Todas as divergências em frases (scores, quantidades, ocorrência que só uma fonte cobre). */
  divergencias: string[];
  veredito: Veredito;
  motivos: string[];
  sinais: SinalCredito[];
}

/** Diferença de score entre fontes a partir da qual avisamos (cada fonte tem modelo próprio). */
export const LIMITE_DIVERGENCIA_SCORE = 200;
/** Preferência de fonte para campos cadastrais (primeiro valor não nulo). Outras fontes vêm depois. */
export const PREFERENCIA_CADASTRO = ['serasa_premium', 'boavista', 'define_risco'] as const;

const norm = (t: string | null | undefined) => sem(t ?? '').replace(/\s+/g, ' ').trim();
const ordemPreferencia = (produto: string) => {
  const i = (PREFERENCIA_CADASTRO as readonly string[]).indexOf(produto);
  return i === -1 ? 99 : i;
};
const tempo = (iso: string) => new Date(iso).getTime();

/** Quais relatórios entram: o mais recente de cada produto; só os válidos (<30 dias) se houver; sem simulados se houver reais. */
export function escolherParaConsolidar<T extends { produto: string; consultadoEm: string; relatorio: RelatorioCredito }>(
  itens: readonly T[], agora: Date = new Date(),
): { itens: T[]; valido: boolean } {
  const reais = itens.filter((i) => i.relatorio.fonte.provedor !== 'simulado');
  const base = reais.length ? reais : itens;
  const maisRecente = new Map<string, T>();
  for (const i of base) {
    const atual = maisRecente.get(i.produto);
    if (!atual || tempo(i.consultadoEm) > tempo(atual.consultadoEm)) maisRecente.set(i.produto, i);
  }
  const todos = [...maisRecente.values()];
  const validos = todos.filter((i) => relatorioValido(i.consultadoEm, agora));
  return validos.length ? { itens: validos, valido: true } : { itens: todos, valido: false };
}

const mesmoTexto = (a: string, b: string) => a === '' || b === '' || a === b || a.includes(b) || b.includes(a);
/** Mesma ocorrência vista por duas fontes: mesma data, mesmo valor e credor/local compatíveis (ou vazios). */
function mesmaOcorrencia(a: Item, b: Item): boolean {
  if ((a.data ?? '') !== (b.data ?? '')) return false;
  if ((a.valor === null) !== (b.valor === null)) return false;
  if (a.valor !== null && b.valor !== null && Math.abs(a.valor - b.valor) > 0.005) return false;
  return mesmoTexto(norm(a.credor ?? a.local), norm(b.credor ?? b.local));
}

const qtdEfetiva = (g: GrupoAnotacao) => Math.max(g.quantidade, g.itens.length);

/** `fontes` na ordem de PREFERÊNCIA (quem vence em campo repetido); `exibicao` = nomes na ordem em que aparecem para o usuário. */
function juntarGrupo(fontes: Array<{ nome: string; grupo: GrupoAnotacao }>, exibicao: readonly string[]) {
  const pos = (nome: string) => exibicao.indexOf(nome);
  const porFonte = fontes.map((f) => ({ nome: f.nome, consultado: f.grupo.consultado, quantidade: f.grupo.consultado ? qtdEfetiva(f.grupo) : 0 }))
    .sort((a, b) => pos(a.nome) - pos(b.nome));
  const consultaram = fontes.filter((f) => f.grupo.consultado);
  if (!consultaram.length) return { grupo: { consultado: false, quantidade: 0, valorTotal: null, itens: [] } as GrupoAnotacao, porFonte };
  // União deduplicada ENTRE fontes: itens da mesma fonte nunca se fundem entre si (duas duplicatas iguais são duas).
  const uniao: Array<{ item: Item; origens: string[] }> = [];
  for (const f of consultaram) {
    const casados = new Set<number>();
    for (const it of f.grupo.itens) {
      const idx = uniao.findIndex((u, i) => !casados.has(i) && !u.origens.includes(f.nome) && mesmaOcorrencia(u.item, it));
      if (idx >= 0) {
        const u = uniao[idx];
        casados.add(idx); u.origens.push(f.nome);
        u.item = { ...u.item, credor: u.item.credor || it.credor, local: u.item.local || it.local, extras: { ...(it.extras ?? {}), ...(u.item.extras ?? {}) } };
      } else uniao.push({ item: it, origens: [f.nome] });
    }
  }
  const itens: Item[] = uniao.map((u) => ({ ...u.item, fonte: [...u.origens].sort((a, b) => pos(a) - pos(b)).join(' + ') }));
  const maior = consultaram.reduce((a, b) => (qtdEfetiva(b.grupo) > qtdEfetiva(a.grupo) ? b : a));
  // Quantidade = a MAIOR entre as fontes (nunca a soma). Se a união listar mais ocorrências distintas que isso, vale a lista.
  const quantidade = Math.max(qtdEfetiva(maior.grupo), itens.length);
  return { grupo: { consultado: true, quantidade, valorTotal: maior.grupo.valorTotal, itens } as GrupoAnotacao, porFonte };
}

const primeiro = <T,>(valores: Array<T | null | undefined>): T | null => {
  for (const v of valores) if (v !== null && v !== undefined) return v;
  return null;
};

/**
 * Consolida os relatórios do mesmo documento. Veredito = o PIOR entre o de cada relatório (mesma regra de `ultimo` e
 * `semaforos`) e o do relatório fundido (anotações unidas + pior score). Lança erro se `entrada` for vazia.
 */
export function consolidarRelatorios(entrada: readonly ItemParaConsolidar[], agora: Date = new Date()): RelatorioConsolidado {
  const { itens: escolhidos, valido } = escolherParaConsolidar(entrada, agora);
  if (!escolhidos.length) throw new Error('Sem relatórios para consolidar');
  // ordem de preferência das fontes para campos cadastrais; o resto pelo mais recente
  const ordem = [...escolhidos].sort((a, b) => ordemPreferencia(a.produto) - ordemPreferencia(b.produto) || tempo(b.consultadoEm) - tempo(a.consultadoEm));
  const maisRecente = [...escolhidos].sort((a, b) => tempo(b.consultadoEm) - tempo(a.consultadoEm))[0];
  const rel = ordem.map((i) => i.relatorio);

  const scores: ScoreDaFonte[] = escolhidos.map((i) => ({
    produto: i.produto, produtoNome: i.produtoNome, valor: i.relatorio.score.valor,
    probabilidadeInadimplencia: i.relatorio.score.probabilidadeInadimplencia, faixa: i.relatorio.score.faixa,
    texto: i.relatorio.score.textoInterpretacao, calculado: i.relatorio.score.valor !== null,
  }));
  const fontes: FonteConsolidada[] = escolhidos.map((i) => ({
    produto: i.produto, produtoNome: i.produtoNome, consultadoEm: i.consultadoEm, custoReais: i.relatorio.fonte.custoReais,
  }));

  const campos = Object.keys(rel[0].cadastro) as Array<keyof RelatorioCredito['cadastro']>;
  const cadastro = Object.fromEntries(campos.map((c) => [c, primeiro(rel.map((r) => r.cadastro[c]))])) as RelatorioCredito['cadastro'];
  const socios = rel.find((r) => r.socios.length > 0)?.socios ?? [];

  const consultas = new Map<string, RelatorioCredito['consultasRecentes'][number]>();
  for (const r of rel) {
    for (const c of r.consultasRecentes) {
      const k = `${c.data}|${norm(c.consultante)}`;
      const x = consultas.get(k);
      if (!x) consultas.set(k, { ...c }); else x.quantidade = Math.max(x.quantidade, c.quantidade);
    }
  }
  const consultasRecentes = [...consultas.values()].sort((a, b) => b.data.localeCompare(a.data));

  const comportamentos = rel.map((r) => r.comportamento).filter((c): c is NonNullable<RelatorioCredito['comportamento']> => !!c);
  const comportamento = comportamentos.length ? {
    ultimaCompraEm: primeiro(comportamentos.map((c) => c.ultimaCompraEm)),
    relacionamentoMaisAntigoEm: primeiro(comportamentos.map((c) => c.relacionamentoMaisAntigoEm)),
    fontesConsultadas: primeiro(comportamentos.map((c) => c.fontesConsultadas)),
    pagamentoPontualPct: primeiro(comportamentos.map((c) => c.pagamentoPontualPct)),
  } : undefined;

  const complementos: NonNullable<RelatorioCredito['complementos']> = {};
  const faixaFat = primeiro(rel.map((r) => r.complementos?.faturamentoPresumidoFaixa));
  if (faixaFat !== null) complementos.faturamentoPresumidoFaixa = faixaFat;
  const veiculos = rel.find((r) => r.complementos?.veiculos?.length)?.complementos?.veiculos;
  if (veiculos) complementos.veiculos = veiculos;
  const totais = rel.map((r) => r.complementos?.consultas12Meses).filter((n): n is number => typeof n === 'number');
  if (totais.length) complementos.consultas12Meses = Math.max(...totais);

  const chaves = Object.keys(ROTULO_GRUPO) as ChaveGrupoAnotacao[];
  const anotacoes = {} as RelatorioCredito['anotacoes'];
  const divergenciaPorGrupo: Partial<Record<ChaveGrupoAnotacao, string>> = {};
  const divergencias: string[] = [];
  for (const k of chaves) {
    const { grupo, porFonte } = juntarGrupo(ordem.map((i) => ({ nome: i.produtoNome, grupo: i.relatorio.anotacoes[k] })), escolhidos.map((i) => i.produtoNome));
    anotacoes[k] = grupo;
    const consultaram = porFonte.filter((f) => f.consultado);
    if (consultaram.length > 1 && new Set(consultaram.map((f) => f.quantidade)).size > 1) {
      const texto = consultaram.map((f) => `${f.nome}: ${f.quantidade}`).join(' · ');
      divergenciaPorGrupo[k] = texto;
      divergencias.push(`${ROTULO_GRUPO[k]}: as fontes discordam na quantidade (${texto}).`);
    }
    const comOcorrencia = consultaram.filter((f) => f.quantidade > 0);
    const naoCobrem = porFonte.filter((f) => !f.consultado);
    if (comOcorrencia.length && naoCobrem.length) {
      divergencias.push(`${ROTULO_GRUPO[k]}: só ${comOcorrencia.map((f) => f.nome).join(' e ')} informa${comOcorrencia.length > 1 ? 'm' : ''} este item (${naoCobrem.map((f) => f.nome).join(', ')} não consulta${naoCobrem.length > 1 ? 'm' : ''}).`);
    }
  }

  const calculados = scores.filter((s): s is ScoreDaFonte & { valor: number } => s.valor !== null);
  let divergenciaScore: string | null = null;
  if (calculados.length > 1) {
    const vs = calculados.map((s) => s.valor);
    if (Math.max(...vs) - Math.min(...vs) >= LIMITE_DIVERGENCIA_SCORE) {
      divergenciaScore = `Scores muito distantes entre as fontes (${calculados.map((s) => `${s.produtoNome}: ${s.valor}`).join(' · ')}); cada fonte usa um modelo próprio.`;
      divergencias.unshift(divergenciaScore);
    }
  }

  const simulado = escolhidos.every((i) => i.relatorio.fonte.provedor === 'simulado');
  const custos = fontes.map((f) => f.custoReais);
  const pior = calculados.length ? calculados.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;
  const fundido: RelatorioCredito = {
    documento: rel[0].documento, tipo: rel[0].tipo, consultadoEm: maisRecente.consultadoEm,
    fonte: {
      provedor: simulado ? 'simulado' : 'consolidado', produto: fontes.map((f) => f.produtoNome).join(' + '),
      custoReais: custos.every((c) => c !== null) ? custos.reduce<number>((s, c) => s + (c ?? 0), 0) : null,
    },
    score: pior
      ? { valor: pior.valor, probabilidadeInadimplencia: pior.probabilidadeInadimplencia, faixa: pior.faixa, textoInterpretacao: pior.texto }
      : { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
    cadastro, socios, consultasRecentes,
    ...(comportamento ? { comportamento } : {}),
    ...(Object.keys(complementos).length ? { complementos } : {}),
    anotacoes,
  };

  const dataRef = new Date(maisRecente.consultadoEm);
  const individuais = escolhidos.map((i) => calcularVeredito(i.relatorio, new Date(i.consultadoEm)));
  const doFundido = calcularVeredito(fundido, dataRef);
  const veredito = piorVeredito([...individuais.map((v) => v.veredito), doFundido.veredito]) as Veredito;
  const motivos: string[] = [];
  // Motivos do relatório fundido; os de um relatório individual só entram quando ele sozinho é mais grave que o fundido
  // (evita "3 protesto(s)" e "2 protesto(s)" lado a lado). "Score não informado pela fonte" é genérico: vira
  // "<fonte>: score não calculado" logo abaixo.
  const individuaisMaisGraves = individuais.filter((v) => v.veredito === veredito && veredito !== doFundido.veredito);
  for (const m of [...doFundido.motivos, ...individuaisMaisGraves.flatMap((v) => v.motivos)]) {
    if (m !== 'Score não informado pela fonte' && !motivos.includes(m)) motivos.push(m);
  }
  for (const s of scores) if (!s.calculado) motivos.push(`${s.produtoNome}: score não calculado`);
  return {
    documento: fundido.documento, tipo: fundido.tipo, consultadoEm: maisRecente.consultadoEm, valido, simulado, scores, fontes, fundido,
    divergenciaPorGrupo, divergenciaScore, divergencias, veredito, motivos, sinais: analisarSinais(fundido, dataRef),
  };
}
