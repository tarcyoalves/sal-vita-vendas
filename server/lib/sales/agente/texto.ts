// Leitura determinística do texto do visitante (sem IA): CEP, quantidade de caixas, perfil do
// negócio e perguntas sensíveis. Código decide o que é crítico; o modelo só conversa.
import { normalizarTexto } from '../conteudo';
import type { PerfilAgente } from './tipos';

// ── CEP ──────────────────────────────────────────────────────────────────────────────────────
const CEP_RE = /(?<!\d)(\d{5})[-.\s]?(\d{3})(?!\d)/;

export function normalizarCep(bruto: unknown): string | null {
  if (typeof bruto !== 'string' && typeof bruto !== 'number') return null;
  const d = String(bruto).replace(/\D/g, '');
  if (d.length !== 8 || /^0+$/.test(d)) return null;
  return d;
}

export function extrairCep(texto: string): string | null {
  const m = CEP_RE.exec(texto);
  return m ? normalizarCep(m[1] + m[2]) : null;
}

/** Troca o CEP por [CEP]: o modelo não precisa ver o número, o servidor o entrega à ferramenta de frete. */
export function ocultarCep(texto: string): string {
  return texto.replace(new RegExp(CEP_RE.source, 'g'), '[CEP]');
}

export function mascararCep(cep: string): string {
  return `${cep.slice(0, 2)}***-${cep.slice(5)}`;
}

// ── Quantidade de caixas ─────────────────────────────────────────────────────────────────────
const NUMEROS_POR_EXTENSO: Record<string, number> = {
  dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, cem: 100,
};

/** Maior quantidade de caixas citada pelo visitante (ou null). Usada para encaminhar pedido grande por código. */
export function extrairQuantidadeCaixas(texto: string): number | null {
  const n = normalizarTexto(texto);
  let max: number | null = null;
  for (const m of n.matchAll(/(\d{1,6})\s*(?:caixas?|cx)\b/g)) {
    const v = parseInt(m[1], 10);
    if (v > 0 && (max === null || v > max)) max = v;
  }
  for (const m of n.matchAll(/\b([a-z]+)\s+caixas?\b/g)) {
    const v = NUMEROS_POR_EXTENSO[m[1]];
    if (v && (max === null || v > max)) max = v;
  }
  return max;
}

// ── Perfil do negócio ────────────────────────────────────────────────────────────────────────
/**
 * Detecta se o visitante compra para revender ou para usar. Frase explícita vence o tipo de negócio.
 * Mini mercado, empório, loja de suplementos, açougue e hortifruti → revenda; restaurante e churrascaria → consumo.
 * Peixaria e afins sem frase explícita ficam 'indefinido' (o agente pergunta).
 */
export function detectarPerfil(texto: string): PerfilAgente {
  const n = normalizarTexto(texto);
  if (/\b(revend\w*|para vender|pra vender|vender avulso|colocar na (minha )?(loja|prateleira)|distribuidor\w*|atacadista)\b/.test(n)) return 'revenda';
  if (/\b(uso proprio|uso pessoal|consumo proprio|para (usar|consumir)|pra (usar|consumir)|para (a )?minha (casa|cozinha)|pra minha casa)\b/.test(n)) return 'consumo';
  if (/\b(restaurante|churrascaria|churrasqueira|lanchonete|pizzaria|bar e restaurante|hamburgueria|cozinha industrial|buffet|rotisseria|padaria|espetaria|steakhouse)\b/.test(n)) return 'consumo';
  if (/\b(mini ?mercado\w*|mercadinho|mercearia|supermercado|emporio|loja\w*|suplement\w*|natureba|naturais|acougue|casa de carnes?|hortifruti|quitanda|sacolao|armazem|distribuidora)\b/.test(n)) return 'revenda';
  return 'indefinido';
}

// ── Perguntas sensíveis (saúde, composição, certificação) ────────────────────────────────────
// O vendedor virtual NÃO conversa sobre isso: responde com texto fixo e oferece uma pessoa.
// Lojas de suplementação trazem o maior risco (eletrólitos, câimbra, hidratação, reposição mineral, sódio).
const SENSIVEL_RE = new RegExp([
  'saude', 'saudavel', 'pressao', 'hipertens', 'diabet', 'colesterol', 'coracao', 'cardi', 'rins\\b', 'renal', 'doenca', 'cancer', 'inflama',
  'eletrolit', 'hidrat', 'caimbra', 'cambra', 'desidrat', 'fadiga', 'cansaco', 'imunidade', 'energia',
  'treino', 'treina', 'academia', 'atleta', 'esportista', 'performance', 'musculo', 'emagrec', 'dieta', 'detox',
  'sodio', 'potassio', 'magnesio', 'calcio\\b', 'mineral', 'minerais', 'reposicao', 'repoe', 'repor ',
  'aditivo', 'conservante', 'quimic', 'antiumectante', 'ferrocianeto', 'iodo', 'iodad', 'refinad',
  '100\\s*%?\\s*natural', '\\b(e|eh|ser|sao|totalmente|puramente)\\s+natural', 'natural mesmo', 'organico',
  'anvisa', 'laudo', 'certific', 'registro no', 'beneficio', 'bom para (o|a|quem)', 'bom pra (o|a|quem)', 'faz bem', 'previne', 'cura\\b', 'tratamento',
  'indicar? (pr[ao]|para)s? (meus|minhas)? ?(clientes|alunos|pacientes)', 'recomendar (pr[ao]|para)',
].join('|'));

export function perguntaSensivel(texto: string): boolean {
  return SENSIVEL_RE.test(normalizarTexto(texto));
}

/**
 * Promessa comercial que só o servidor/uma pessoa pode fazer: desconto, brinde, estoque, prazo garantido,
 * lucro, ou declarar um canal "melhor" que outro. Rede determinística de apoio à checagem semântica.
 */
const PROMESSA_RE = /\b(descont\w*|promocao|promocoes|cupom|cupons|gratis|gratuito|brinde\w*|off\b|estoque\w*|pronta entrega|entrega garantida|prazo garantido|chega amanha|chegara em|lucro\w*|lucrar|lucrativ\w*|ganhar dinheiro|retorno garantido|mais barat\w*|mais em conta|melhor (preco|opcao|custo|canal|compra)|compensa mais|vale mais a pena)\b/;

export function promessaComercial(texto: string): boolean {
  return PROMESSA_RE.test(normalizarTexto(texto));
}

// ── Texto do visitante é dado ────────────────────────────────────────────────────────────────
export const TAG_VISITANTE = 'mensagem_visitante';

/** Remove marcadores que imitariam o delimitador e tags de "sistema", limita o tamanho. */
export function higienizarVisitante(texto: string, max = 800): string {
  return texto
    .replace(/<\/?\s*mensagem_visitante\s*>/gi, ' ')
    .replace(/<\/?\s*(system|sistema|assistant|tool)[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
