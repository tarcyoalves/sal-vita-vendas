// Ajustes (0.4.0): a FONTE ÚNICA dos ritmos, limites, horários, freio, filtros e textos.
//
// - Os PADRÕES são os valores de sempre da extensão (constantes.ts) = perfil "Cauteloso".
// - Os LIMITES ABSOLUTOS (`LIMITES`) são embutidos: a tela não deixa passar deles e a leitura do banco
//   também os impõe (backup importado, registro adulterado…). Mudar um limite aqui é decisão do dono.
// - Nada aqui liga o modo automático nem toca nas travas de envio (token, conferências, só no
//   automático autorizado, sem Enter simulado). Esta tela só escolhe RITMO e LIMITES.
// - Reduz risco; NÃO garante que o número não será bloqueado.

import { z } from 'zod';
import {
  AUTO,
  DIAS_SEM_REPETIR,
  HORARIO_PERMITIDO,
  INTERVALO_MAX_SEG,
  INTERVALO_MIN_SEG,
  PROBLEMAS_SEGUIDOS_PARA_PAUSAR,
  TAMANHO_MAX_TEXTO,
  TETO_AUTO_MAXIMO,
  TETO_DIARIO_MAXIMO,
  TETO_DIARIO_PADRAO,
} from './constantes';
import { diferencaDias, hojeNoFuso } from './datas';
import type { ConfigPolitica } from './politica';
import { validarModelo } from './texto';

// ── Limites absolutos ────────────────────────────────────────────────────────

export const LIMITES = {
  /** Intervalo entre contatos: nunca abaixo de 30 s (manual e automático). */
  intervaloMinSeg: 30,
  intervaloMaxSeg: 3600,
  tetoMin: 1,
  tetoManual: TETO_DIARIO_MAXIMO,
  tetoAuto: TETO_AUTO_MAXIMO,
  /** Contagem antes do envio automático: nunca abaixo de 5 s. */
  contagemMinSeg: 5,
  contagemMaxSeg: 60,
  pausaACadaMin: 3,
  pausaACadaMax: 100,
  pausaMinutosMin: 1,
  pausaMinutosMax: 120,
  problemasMin: 1,
  problemasMax: 10,
  digitandoMinSeg: 5,
  digitandoMaxSeg: 300,
  /** Janelas de envio dentro de 6h–22h (fuso de Fortaleza). */
  horaMin: 6,
  horaMax: 22,
  tamanhoTextoMin: 50,
  tamanhoTextoMax: TAMANHO_MAX_TEXTO,
  /** Nunca reenviar a quem recebeu campanha há menos de 14 dias. */
  diasSemRepetirMin: DIAS_SEM_REPETIR,
  diasSemRepetirMax: 365,
  maxModelos: 20,
  maxNomeModelo: 60,
  maxTermoFiltro: 200,
} as const;

export const FUSO_AJUSTES = 'America/Fortaleza';

// ── Esquema ──────────────────────────────────────────────────────────────────

const num = z.number().finite();

const faixaSchema = z.object({ minSeg: num, maxSeg: num });
const janelaSchema = z.object({ dia: num, ligado: z.boolean(), inicio: num, fim: num });
const modeloSchema = z.object({ id: z.string(), nome: z.string(), texto: z.string(), variacoes: z.array(z.string()) });

const ritmoSchema = z.object({
  manual: faixaSchema,
  auto: faixaSchema,
  pausaLonga: z.object({ ligada: z.boolean(), aCadaEnvios: num, minMin: num, maxMin: num }),
  contagemSeg: num,
});
const limitesSchema = z.object({
  tetoManual: num,
  tetoAuto: num,
  rampa: z.object({ ligada: z.boolean(), dia1a7: num, dia8a14: num, depois: num }),
});
const horariosSchema = z.array(janelaSchema);
const freioSchema = z.object({ problemasManual: num, problemasAuto: num, pausarEmAviso: z.boolean(), esperaDigitandoSeg: num });
const filtrosSchema = z.object({ termo: z.string(), naoContem: z.string(), excluirContatadosHaDias: num });
const textoSchema = z.object({ tamanhoMax: num, modeloPadraoId: z.string().nullable(), modelos: z.array(modeloSchema) });

export const ajustesSchema = z.object({
  versao: z.literal(1),
  ritmo: ritmoSchema,
  limites: limitesSchema,
  horarios: horariosSchema,
  freio: freioSchema,
  filtros: filtrosSchema,
  texto: textoSchema,
});

export type Ajustes = z.infer<typeof ajustesSchema>;
export type JanelaDia = z.infer<typeof janelaSchema>;
export type ModeloSalvo = z.infer<typeof modeloSchema>;
export type GrupoAjustes = 'ritmo' | 'limites' | 'horarios' | 'freio' | 'filtros' | 'texto';
export const GRUPOS: ReadonlyArray<GrupoAjustes> = ['ritmo', 'limites', 'horarios', 'freio', 'filtros', 'texto'];

// ── Padrões (= comportamento da 0.3.x) ───────────────────────────────────────

export const JANELAS_PADRAO: ReadonlyArray<JanelaDia> = HORARIO_PERMITIDO.map((f, dia) => ({
  dia,
  ligado: f !== null,
  inicio: f?.inicio ?? 8,
  fim: f?.fim ?? 18,
}));

export const MODELOS_PADRAO: ReadonlyArray<ModeloSalvo> = [
  {
    id: 'm-reativacao',
    nome: 'Reativação com saudação',
    texto: '{saudacao}, {primeiroNome}, tudo bem? Como estão de sal por aí?',
    variacoes: [
      '{saudacao}, {primeiroNome}! Faz um tempo que não nos falamos. Está precisando repor o sal?',
      '{saudacao}, {primeiroNome}, tudo certo? Passando para saber se o estoque de sal está em dia.',
    ],
  },
  {
    id: 'm-simples',
    nome: 'Simples e direto',
    texto: 'Olá, {primeiroNome}, tudo bem? Posso te ajudar com o sal deste mês?',
    variacoes: [],
  },
];

export const AJUSTES_PADRAO: Ajustes = {
  versao: 1,
  ritmo: {
    manual: { minSeg: INTERVALO_MIN_SEG, maxSeg: INTERVALO_MAX_SEG },
    auto: { minSeg: AUTO.intervaloMinSeg, maxSeg: AUTO.intervaloMaxSeg },
    pausaLonga: {
      ligada: true,
      aCadaEnvios: AUTO.enviosAtePausaLonga,
      minMin: AUTO.pausaLongaMinSeg / 60,
      maxMin: AUTO.pausaLongaMaxSeg / 60,
    },
    contagemSeg: AUTO.contagemSeg,
  },
  limites: {
    tetoManual: TETO_DIARIO_PADRAO,
    tetoAuto: AUTO.tetoDiario,
    rampa: { ligada: false, dia1a7: 10, dia8a14: 20, depois: 30 },
  },
  horarios: JANELAS_PADRAO.map((j) => ({ ...j })),
  freio: {
    problemasManual: PROBLEMAS_SEGUIDOS_PARA_PAUSAR,
    problemasAuto: AUTO.problemasParaDesligar,
    pausarEmAviso: true,
    esperaDigitandoSeg: AUTO.novaTentativaDigitandoMs / 1000,
  },
  filtros: { termo: 'CLIENTE', naoContem: '', excluirContatadosHaDias: DIAS_SEM_REPETIR },
  texto: {
    tamanhoMax: TAMANHO_MAX_TEXTO,
    modeloPadraoId: null,
    modelos: MODELOS_PADRAO.map((m) => ({ ...m, variacoes: [...m.variacoes] })),
  },
};

export function copiarAjustes(a: Ajustes): Ajustes {
  return structuredClone(a);
}

// ── Perfis ───────────────────────────────────────────────────────────────────

export type IdPerfil = 'cauteloso' | 'equilibrado' | 'rapido';

export interface Perfil {
  id: IdPerfil;
  nome: string;
  descricao: string;
  ritmo: Pick<Ajustes['ritmo'], 'manual' | 'auto' | 'pausaLonga'>;
  tetoManual: number;
  tetoAuto: number;
}

export const PERFIS: ReadonlyArray<Perfil> = [
  {
    id: 'cauteloso',
    nome: 'Cauteloso',
    descricao: 'Os valores de sempre da extensão: intervalo de 60–120 s (manual) e 90–180 s (automático), pausa longa de 10–20 min a cada 10 envios, teto de 30 por dia.',
    ritmo: { manual: { ...AJUSTES_PADRAO.ritmo.manual }, auto: { ...AJUSTES_PADRAO.ritmo.auto }, pausaLonga: { ...AJUSTES_PADRAO.ritmo.pausaLonga } },
    tetoManual: TETO_DIARIO_PADRAO,
    tetoAuto: AUTO.tetoDiario,
  },
  {
    id: 'equilibrado',
    nome: 'Equilibrado',
    descricao: 'Intervalo de 60–120 s nos dois modos, pausa longa de 5–10 min a cada 15 envios, teto de 30 por dia.',
    ritmo: {
      manual: { minSeg: 60, maxSeg: 120 },
      auto: { minSeg: 60, maxSeg: 120 },
      pausaLonga: { ligada: true, aCadaEnvios: 15, minMin: 5, maxMin: 10 },
    },
    tetoManual: 30,
    tetoAuto: 30,
  },
  {
    id: 'rapido',
    nome: 'Rápido',
    descricao: 'Intervalo de 45–90 s nos dois modos, sem pausa longa, teto de 30 por dia. É o ritmo com mais risco de bloqueio.',
    ritmo: {
      manual: { minSeg: 45, maxSeg: 90 },
      auto: { minSeg: 45, maxSeg: 90 },
      pausaLonga: { ligada: false, aCadaEnvios: 10, minMin: 10, maxMin: 20 },
    },
    tetoManual: 30,
    tetoAuto: 30,
  },
];

/** Aplica um perfil só ao ritmo e aos tetos; horários, freio, filtros e textos ficam como estão. */
export function aplicarPerfil(a: Ajustes, id: IdPerfil): Ajustes {
  const p = PERFIS.find((x) => x.id === id);
  if (!p) return a;
  return {
    ...a,
    ritmo: { ...a.ritmo, manual: { ...p.ritmo.manual }, auto: { ...p.ritmo.auto }, pausaLonga: { ...p.ritmo.pausaLonga } },
    limites: { ...a.limites, tetoManual: p.tetoManual, tetoAuto: p.tetoAuto, rampa: { ...a.limites.rampa, ligada: false } },
  };
}

function assinaturaPerfil(r: Perfil['ritmo'], tetoManual: number, tetoAuto: number, rampaLigada: boolean): string {
  const p = r.pausaLonga;
  return JSON.stringify([r.manual.minSeg, r.manual.maxSeg, r.auto.minSeg, r.auto.maxSeg, p.ligada ? [p.aCadaEnvios, p.minMin, p.maxMin] : null, tetoManual, tetoAuto, rampaLigada]);
}

/** Qual perfil os valores atuais reproduzem exatamente; `personalizado` se nenhum. */
export function detectarPerfil(a: Ajustes): IdPerfil | 'personalizado' {
  const atual = assinaturaPerfil(a.ritmo, a.limites.tetoManual, a.limites.tetoAuto, a.limites.rampa.ligada);
  for (const p of PERFIS) {
    if (assinaturaPerfil(p.ritmo, p.tetoManual, p.tetoAuto, false) === atual) return p.id;
  }
  return 'personalizado';
}

// ── Acesso por caminho (restaurar campo/grupo) ───────────────────────────────

export function obter(a: Ajustes, caminho: string): unknown {
  let atual: unknown = a;
  for (const k of caminho.split('.')) {
    if (typeof atual !== 'object' || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[k];
  }
  return atual;
}

export function definir(a: Ajustes, caminho: string, valor: unknown): Ajustes {
  const partes = caminho.split('.');
  const rec = (no: unknown, i: number): unknown => {
    if (i === partes.length) return valor;
    const k = partes[i];
    if (Array.isArray(no)) {
      const copia: unknown[] = [...no];
      copia[Number(k)] = rec(no[Number(k)], i + 1);
      return copia;
    }
    const obj: Record<string, unknown> = typeof no === 'object' && no !== null ? { ...(no as Record<string, unknown>) } : {};
    obj[k] = rec(obj[k], i + 1);
    return obj;
  };
  return rec(a, 0) as Ajustes;
}

export function restaurarCampo(a: Ajustes, caminho: string): Ajustes {
  return definir(a, caminho, structuredClone(obter(AJUSTES_PADRAO, caminho)));
}

export function restaurarGrupo(a: Ajustes, grupo: GrupoAjustes): Ajustes {
  return restaurarCampo(a, grupo);
}

export function restaurarTudo(): Ajustes {
  return copiarAjustes(AJUSTES_PADRAO);
}

export function ehPadrao(a: Ajustes, caminho: string): boolean {
  return JSON.stringify(obter(a, caminho)) === JSON.stringify(obter(AJUSTES_PADRAO, caminho));
}

// ── Validação (tela) ─────────────────────────────────────────────────────────

export interface ErroAjuste {
  campo: string;
  mensagem: string;
}

function inteiroEntre(erros: ErroAjuste[], campo: string, rotulo: string, v: number, min: number, max: number, unidade: string): void {
  if (!Number.isInteger(v)) erros.push({ campo, mensagem: `${rotulo}: use um número inteiro.` });
  else if (v < min || v > max) erros.push({ campo, mensagem: `${rotulo}: deve ficar entre ${min} e ${max} ${unidade}.` });
}

function faixa(erros: ErroAjuste[], base: string, rotulo: string, f: { minSeg: number; maxSeg: number }): void {
  inteiroEntre(erros, `${base}.minSeg`, `${rotulo} (mínimo)`, f.minSeg, LIMITES.intervaloMinSeg, LIMITES.intervaloMaxSeg, 's');
  inteiroEntre(erros, `${base}.maxSeg`, `${rotulo} (máximo)`, f.maxSeg, LIMITES.intervaloMinSeg, LIMITES.intervaloMaxSeg, 's');
  if (f.minSeg > f.maxSeg) erros.push({ campo: `${base}.maxSeg`, mensagem: `${rotulo}: o mínimo (${f.minSeg} s) não pode passar do máximo (${f.maxSeg} s).` });
}

export function validarAjustes(a: Ajustes): ErroAjuste[] {
  const e: ErroAjuste[] = [];
  const { ritmo, limites, freio, filtros, texto } = a;

  faixa(e, 'ritmo.manual', 'Intervalo no manual', ritmo.manual);
  faixa(e, 'ritmo.auto', 'Intervalo no automático', ritmo.auto);
  inteiroEntre(e, 'ritmo.contagemSeg', 'Contagem antes do envio automático', ritmo.contagemSeg, LIMITES.contagemMinSeg, LIMITES.contagemMaxSeg, 's');
  const p = ritmo.pausaLonga;
  inteiroEntre(e, 'ritmo.pausaLonga.aCadaEnvios', 'Pausa longa a cada', p.aCadaEnvios, LIMITES.pausaACadaMin, LIMITES.pausaACadaMax, 'envios');
  inteiroEntre(e, 'ritmo.pausaLonga.minMin', 'Pausa longa (mínimo)', p.minMin, LIMITES.pausaMinutosMin, LIMITES.pausaMinutosMax, 'min');
  inteiroEntre(e, 'ritmo.pausaLonga.maxMin', 'Pausa longa (máximo)', p.maxMin, LIMITES.pausaMinutosMin, LIMITES.pausaMinutosMax, 'min');
  if (p.minMin > p.maxMin) e.push({ campo: 'ritmo.pausaLonga.maxMin', mensagem: `Pausa longa: o mínimo (${p.minMin} min) não pode passar do máximo (${p.maxMin} min).` });

  inteiroEntre(e, 'limites.tetoManual', 'Teto diário no manual', limites.tetoManual, LIMITES.tetoMin, LIMITES.tetoManual, 'mensagens');
  inteiroEntre(e, 'limites.tetoAuto', 'Teto diário no automático', limites.tetoAuto, LIMITES.tetoMin, LIMITES.tetoAuto, 'mensagens');
  if (limites.rampa.ligada) {
    inteiroEntre(e, 'limites.rampa.dia1a7', 'Rampa, dias 1 a 7', limites.rampa.dia1a7, LIMITES.tetoMin, LIMITES.tetoManual, 'mensagens');
    inteiroEntre(e, 'limites.rampa.dia8a14', 'Rampa, dias 8 a 14', limites.rampa.dia8a14, LIMITES.tetoMin, LIMITES.tetoManual, 'mensagens');
    inteiroEntre(e, 'limites.rampa.depois', 'Rampa, depois do dia 14', limites.rampa.depois, LIMITES.tetoMin, LIMITES.tetoManual, 'mensagens');
  }

  const dias = new Set<number>();
  a.horarios.forEach((j, i) => {
    const nome = NOMES_DIA[j.dia] ?? `dia ${j.dia}`;
    dias.add(j.dia);
    if (!Number.isInteger(j.dia) || j.dia < 0 || j.dia > 6) e.push({ campo: `horarios.${i}.dia`, mensagem: `Horários: dia inválido (${j.dia}).` });
    if (!j.ligado) return;
    inteiroEntre(e, `horarios.${i}.inicio`, `Início de ${nome}`, j.inicio, LIMITES.horaMin, LIMITES.horaMax - 1, 'h');
    inteiroEntre(e, `horarios.${i}.fim`, `Fim de ${nome}`, j.fim, LIMITES.horaMin + 1, LIMITES.horaMax, 'h');
    if (j.inicio >= j.fim) e.push({ campo: `horarios.${i}.fim`, mensagem: `${nome}: o início (${j.inicio}h) precisa ser antes do fim (${j.fim}h).` });
  });
  if (dias.size !== 7) e.push({ campo: 'horarios', mensagem: 'Horários: precisa haver exatamente uma linha para cada dia da semana.' });

  inteiroEntre(e, 'freio.problemasManual', 'Problemas seguidos para pausar (manual)', freio.problemasManual, LIMITES.problemasMin, LIMITES.problemasMax, 'problemas');
  inteiroEntre(e, 'freio.problemasAuto', 'Problemas seguidos para pausar (automático)', freio.problemasAuto, LIMITES.problemasMin, LIMITES.problemasMax, 'problemas');
  inteiroEntre(e, 'freio.esperaDigitandoSeg', 'Espera quando você está digitando', freio.esperaDigitandoSeg, LIMITES.digitandoMinSeg, LIMITES.digitandoMaxSeg, 's');

  inteiroEntre(e, 'filtros.excluirContatadosHaDias', 'Excluir recém-contatados', filtros.excluirContatadosHaDias, LIMITES.diasSemRepetirMin, LIMITES.diasSemRepetirMax, 'dias');
  if (filtros.termo.length > LIMITES.maxTermoFiltro) e.push({ campo: 'filtros.termo', mensagem: 'Termo de busca longo demais.' });
  if (filtros.naoContem.length > LIMITES.maxTermoFiltro) e.push({ campo: 'filtros.naoContem', mensagem: 'Lista "nome não contém" longa demais.' });

  inteiroEntre(e, 'texto.tamanhoMax', 'Tamanho máximo da mensagem', texto.tamanhoMax, LIMITES.tamanhoTextoMin, LIMITES.tamanhoTextoMax, 'caracteres');
  if (texto.modelos.length > LIMITES.maxModelos) e.push({ campo: 'texto.modelos', mensagem: `No máximo ${LIMITES.maxModelos} modelos salvos.` });
  const nomes = new Set<string>();
  const ids = new Set<string>();
  texto.modelos.forEach((m, i) => {
    const nome = m.nome.trim();
    if (nome === '') e.push({ campo: `texto.modelos.${i}.nome`, mensagem: `Modelo ${i + 1}: dê um nome.` });
    else if (nome.length > LIMITES.maxNomeModelo) e.push({ campo: `texto.modelos.${i}.nome`, mensagem: `Modelo "${nome}": nome longo demais.` });
    else if (nomes.has(nome.toLowerCase())) e.push({ campo: `texto.modelos.${i}.nome`, mensagem: `Já existe um modelo chamado "${nome}".` });
    nomes.add(nome.toLowerCase());
    if (ids.has(m.id) || m.id === '') e.push({ campo: `texto.modelos.${i}.id`, mensagem: `Modelo ${i + 1}: identificador repetido.` });
    ids.add(m.id);
    if (m.variacoes.length > 3) e.push({ campo: `texto.modelos.${i}.variacoes`, mensagem: `Modelo "${nome}": no máximo 3 variações.` });
    const rotulo = nome || `Modelo ${i + 1}`;
    for (const err of validarModelo(m.texto, { tamanhoMax: texto.tamanhoMax })) e.push({ campo: `texto.modelos.${i}.texto`, mensagem: `${rotulo}: ${err}` });
    m.variacoes.forEach((v, j) => {
      if (v.trim() === '') return;
      for (const err of validarModelo(v, { tamanhoMax: texto.tamanhoMax })) e.push({ campo: `texto.modelos.${i}.variacoes.${j}`, mensagem: `${rotulo}, variação ${j + 1}: ${err}` });
    });
  });
  if (texto.modeloPadraoId !== null && !ids.has(texto.modeloPadraoId)) {
    e.push({ campo: 'texto.modeloPadraoId', mensagem: 'O modelo padrão escolhido não existe mais.' });
  }
  return e;
}

export const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ── Leitura tolerante (banco / backup antigo) ────────────────────────────────

function mesclar(base: unknown, extra: unknown): unknown {
  if (Array.isArray(base) || Array.isArray(extra)) return extra === undefined ? base : extra;
  if (typeof base === 'object' && base !== null && typeof extra === 'object' && extra !== null) {
    const saida: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(extra as Record<string, unknown>)) saida[k] = mesclar(saida[k], v);
    return saida;
  }
  return extra === undefined ? base : extra;
}

const limitar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(v)));

/** Impõe os limites absolutos e a coerência (min ≤ max). Nunca afrouxa nada. */
export function limitarAjustes(a: Ajustes): Ajustes {
  const L = LIMITES;
  const f = (x: { minSeg: number; maxSeg: number }) => {
    const minSeg = limitar(x.minSeg, L.intervaloMinSeg, L.intervaloMaxSeg);
    return { minSeg, maxSeg: Math.max(minSeg, limitar(x.maxSeg, L.intervaloMinSeg, L.intervaloMaxSeg)) };
  };
  const pl = a.ritmo.pausaLonga;
  const pausaMin = limitar(pl.minMin, L.pausaMinutosMin, L.pausaMinutosMax);
  const horarios: JanelaDia[] = [];
  for (let dia = 0; dia <= 6; dia += 1) {
    const j = a.horarios.find((x) => x.dia === dia) ?? JANELAS_PADRAO[dia];
    const inicio = limitar(j.inicio, L.horaMin, L.horaMax - 1);
    horarios.push({ dia, ligado: j.ligado, inicio, fim: Math.max(inicio + 1, limitar(j.fim, L.horaMin + 1, L.horaMax)) });
  }
  const ids = new Set<string>();
  const modelos = a.texto.modelos
    .filter((m) => m.id !== '' && !ids.has(m.id) && ids.add(m.id))
    .slice(0, L.maxModelos)
    .map((m) => ({ id: m.id, nome: m.nome.slice(0, L.maxNomeModelo), texto: m.texto, variacoes: m.variacoes.slice(0, 3) }));
  return {
    versao: 1,
    ritmo: {
      manual: f(a.ritmo.manual),
      auto: f(a.ritmo.auto),
      pausaLonga: {
        ligada: pl.ligada,
        aCadaEnvios: limitar(pl.aCadaEnvios, L.pausaACadaMin, L.pausaACadaMax),
        minMin: pausaMin,
        maxMin: Math.max(pausaMin, limitar(pl.maxMin, L.pausaMinutosMin, L.pausaMinutosMax)),
      },
      contagemSeg: limitar(a.ritmo.contagemSeg, L.contagemMinSeg, L.contagemMaxSeg),
    },
    limites: {
      tetoManual: limitar(a.limites.tetoManual, L.tetoMin, L.tetoManual),
      tetoAuto: limitar(a.limites.tetoAuto, L.tetoMin, L.tetoAuto),
      rampa: {
        ligada: a.limites.rampa.ligada,
        dia1a7: limitar(a.limites.rampa.dia1a7, L.tetoMin, L.tetoManual),
        dia8a14: limitar(a.limites.rampa.dia8a14, L.tetoMin, L.tetoManual),
        depois: limitar(a.limites.rampa.depois, L.tetoMin, L.tetoManual),
      },
    },
    horarios,
    freio: {
      problemasManual: limitar(a.freio.problemasManual, L.problemasMin, L.problemasMax),
      problemasAuto: limitar(a.freio.problemasAuto, L.problemasMin, L.problemasMax),
      pausarEmAviso: a.freio.pausarEmAviso,
      esperaDigitandoSeg: limitar(a.freio.esperaDigitandoSeg, L.digitandoMinSeg, L.digitandoMaxSeg),
    },
    filtros: {
      termo: a.filtros.termo.slice(0, L.maxTermoFiltro),
      naoContem: a.filtros.naoContem.slice(0, L.maxTermoFiltro),
      excluirContatadosHaDias: limitar(a.filtros.excluirContatadosHaDias, L.diasSemRepetirMin, L.diasSemRepetirMax),
    },
    texto: {
      tamanhoMax: limitar(a.texto.tamanhoMax, L.tamanhoTextoMin, L.tamanhoTextoMax),
      modeloPadraoId: a.texto.modeloPadraoId !== null && ids.has(a.texto.modeloPadraoId) ? a.texto.modeloPadraoId : null,
      modelos,
    },
  };
}

/**
 * Lê qualquer coisa (registro do banco, backup) e devolve ajustes completos e dentro dos limites:
 * seção ausente ou inválida volta ao padrão; valores fora dos limites são cortados.
 */
export function normalizarAjustes(bruto: unknown): Ajustes {
  const entrada = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const sec = <K extends GrupoAjustes>(k: K, schema: z.ZodType<Ajustes[K]>): Ajustes[K] => {
    const r = schema.safeParse(mesclar(AJUSTES_PADRAO[k], entrada[k]));
    return r.success ? r.data : structuredClone(AJUSTES_PADRAO[k]);
  };
  return limitarAjustes({
    versao: 1,
    ritmo: sec('ritmo', ritmoSchema),
    limites: sec('limites', limitesSchema),
    horarios: sec('horarios', horariosSchema),
    freio: sec('freio', freioSchema),
    filtros: sec('filtros', filtrosSchema),
    texto: sec('texto', textoSchema),
  });
}

/**
 * Migração 0.3.x → 0.4.0: quem nunca salvou Ajustes recebe os padrões, mas com o teto e o intervalo
 * que já tinha na política antiga — o comportamento não muda. O automático herdava o manual com
 * os pisos 30 / 90–180 s.
 */
export function ajustesDeLegado(legado: Pick<ConfigPolitica, 'tetoDiario' | 'intervaloMinSeg' | 'intervaloMaxSeg'>): Ajustes {
  const a = copiarAjustes(AJUSTES_PADRAO);
  a.limites.tetoManual = legado.tetoDiario;
  a.limites.tetoAuto = Math.min(legado.tetoDiario, AUTO.tetoDiario);
  a.ritmo.manual = { minSeg: legado.intervaloMinSeg, maxSeg: legado.intervaloMaxSeg };
  a.ritmo.auto = { minSeg: Math.max(legado.intervaloMinSeg, AUTO.intervaloMinSeg), maxSeg: Math.max(legado.intervaloMaxSeg, AUTO.intervaloMaxSeg) };
  return normalizarAjustes(a);
}

// ── Valores efetivos (o que a política e o executor usam) ────────────────────

/** Política do modo manual a partir dos Ajustes. */
export function configManual(a: Ajustes, numeroComMaisDe30Dias: boolean): ConfigPolitica {
  return { tetoDiario: a.limites.tetoManual, intervaloMinSeg: a.ritmo.manual.minSeg, intervaloMaxSeg: a.ritmo.manual.maxSeg, numeroComMaisDe30Dias };
}

/** Dia de uso (1 = dia do primeiro envio registrado; sem envios, 1), calendário de Fortaleza. */
export function diaDeUso(envios: ReadonlyArray<{ enviadoEm: string }>, agora: Date): number {
  let primeiro: string | null = null;
  for (const e of envios) {
    const dia = hojeNoFuso(new Date(e.enviadoEm));
    if (primeiro === null || dia < primeiro) primeiro = dia;
  }
  if (primeiro === null) return 1;
  return Math.max(1, diferencaDias(hojeNoFuso(agora), primeiro) + 1);
}

/** Teto da rampa para o dia de uso (Infinity se a rampa está desligada). */
export function tetoDaRampa(a: Ajustes, dia: number): number {
  const r = a.limites.rampa;
  if (!r.ligada) return Number.POSITIVE_INFINITY;
  if (dia <= 7) return r.dia1a7;
  if (dia <= 14) return r.dia8a14;
  return r.depois;
}

/**
 * Política efetiva de AGORA no modo escolhido: intervalo e teto do modo, o teto cortado pela
 * rampa (se ligada) e sempre pelos limites absolutos.
 */
export function configEfetiva(
  a: Ajustes,
  numeroComMaisDe30Dias: boolean,
  automatico: boolean,
  envios: ReadonlyArray<{ enviadoEm: string }>,
  agora: Date,
): ConfigPolitica {
  const faixaModo = automatico ? a.ritmo.auto : a.ritmo.manual;
  const tetoModo = automatico ? Math.min(a.limites.tetoAuto, LIMITES.tetoAuto) : Math.min(a.limites.tetoManual, LIMITES.tetoManual);
  const teto = Math.max(1, Math.min(tetoModo, tetoDaRampa(a, diaDeUso(envios, agora))));
  return { tetoDiario: teto, intervaloMinSeg: faixaModo.minSeg, intervaloMaxSeg: faixaModo.maxSeg, numeroComMaisDe30Dias };
}

/** Parâmetros da espera do automático (segundos) lidos dos Ajustes. */
export function ritmoAuto(a: Ajustes): {
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  pausaLonga: boolean;
  aCadaEnvios: number;
  pausaMinSeg: number;
  pausaMaxSeg: number;
} {
  const p = a.ritmo.pausaLonga;
  return {
    intervaloMinSeg: a.ritmo.auto.minSeg,
    intervaloMaxSeg: a.ritmo.auto.maxSeg,
    pausaLonga: p.ligada,
    aCadaEnvios: p.aCadaEnvios,
    pausaMinSeg: p.minMin * 60,
    pausaMaxSeg: p.maxMin * 60,
  };
}

// ── Indicador de risco ───────────────────────────────────────────────────────

export type NivelRisco = 'baixo' | 'medio' | 'alto';

export interface Risco {
  nivel: NivelRisco;
  pontos: number;
  motivos: string[];
}

/**
 * Regra simples e transparente: quanto mais rápido o ritmo e quanto mais mensagens por dia, maior o
 * risco; sem pausa longa (automático), sem pausar no aviso ou com freio frouxo, também. É uma
 * estimativa para comparar configurações — NÃO prevê nem garante nada sobre o bloqueio do número.
 */
export function avaliarRisco(a: Ajustes, modo: 'manual' | 'auto'): Risco {
  const motivos: string[] = [];
  let pontos = 0;
  const f = modo === 'auto' ? a.ritmo.auto : a.ritmo.manual;
  const media = (f.minSeg + f.maxSeg) / 2;
  const vel = media >= 150 ? 0 : media >= 120 ? 1 : media >= 90 ? 2 : media >= 60 ? 3 : 4;
  pontos += vel;
  motivos.push(`Intervalo médio de ${Math.round(media)} s: ${vel === 0 ? 'lento (menos risco)' : vel >= 3 ? 'rápido (mais risco)' : 'moderado'}.`);

  const teto = modo === 'auto' ? a.limites.tetoAuto : a.limites.tetoManual;
  const maior = a.limites.rampa.ligada ? Math.min(teto, Math.max(a.limites.rampa.dia1a7, a.limites.rampa.dia8a14, a.limites.rampa.depois)) : teto;
  const vol = maior <= 20 ? 0 : maior <= 30 ? 1 : maior <= 45 ? 2 : 3;
  pontos += vol;
  motivos.push(`Até ${maior} mensagens por dia: ${vol === 0 ? 'volume baixo' : vol === 1 ? 'volume moderado' : 'volume alto (mais risco)'}.`);

  if (modo === 'auto') {
    const p = a.ritmo.pausaLonga;
    const pausa = !p.ligada ? 2 : p.aCadaEnvios > 12 || p.maxMin < 8 ? 1 : 0;
    pontos += pausa;
    motivos.push(!p.ligada ? 'Sem pausa longa: envios em sequência sem descanso (mais risco).' : `Pausa longa de ${p.minMin}–${p.maxMin} min a cada ${p.aCadaEnvios} envios.`);
  }
  if (!a.freio.pausarEmAviso) {
    pontos += 1;
    motivos.push('Não pausar ao ver aviso do WhatsApp na espera (mais risco).');
  }
  const problemas = modo === 'auto' ? a.freio.problemasAuto : a.freio.problemasManual;
  if (problemas > 3) {
    pontos += 1;
    motivos.push(`Freio só depois de ${problemas} problemas seguidos (mais risco).`);
  }
  const nivel: NivelRisco = pontos <= 3 ? 'baixo' : pontos <= 5 ? 'medio' : 'alto';
  return { nivel, pontos, motivos };
}

export const EXPLICACAO_RISCO =
  'Quanto mais rápido o ritmo e quanto mais mensagens por dia, maior o risco de o WhatsApp estranhar o número. ' +
  'O indicador é só uma comparação entre configurações: baixo não significa seguro, e nenhum ajuste garante que o número não será bloqueado.';
