// Rascunho de mensagem de abordagem do Radar de Cargas. Implementação: subagente "IA".
// A mensagem é enviada À MÃO pelo atendente (link wa.me) — nunca por automação.
//
// Conformidade (ESTADO-DO-PROJETO.md seção 4 + HANDOFF-HERMES.md seção 4/9): a IA só
// pode falar de "sal" e do tamanho do saco. Nada de alegação de saúde, nutriente,
// aditivo, "natural"/"puro", contagem de minerais ou promessa terapêutica. Preço,
// desconto, prazo e % nunca são inventados — só o que o atendente digitou em
// `freightNote` pode aparecer. Escassez só como fato verdadeiro ("espaço limitado
// nesta carga"), nunca como gatilho de urgência inventado.
import { completeWithFallback, type LlmMessage } from '../llm';

export interface RadarDraftInput {
  companyName: string;
  cityLabel: string; // "Dionísio Cerqueira - SC"
  segmentLabels: string[];
  originLabel: string; // cidade da carga principal, "Barracão - PR"
  bags: number; // saldo de sacos de 25 kg na carreta
  loadDate?: string; // YYYY-MM-DD, se o atendente informou
  freightNote?: string; // condição de frete digitada pelo atendente; a IA não inventa valor
  attendantName: string;
}

export interface RadarDraftResult {
  message: string;
  provider: string;
}

const MAX_MESSAGE_LENGTH = 700;

// Termos proibidos: a base vem de ESTADO-DO-PROJETO.md seção 4 (alegação de saúde,
// contagem de minerais, "natural"/"puro"/"aditivo", família semântica que a ANVISA
// já puniu — eletrólito, hidratação, energia, reposição mineral, terapêutico) mais os
// termos pedidos explicitamente para o guard do Radar.
const FORBIDDEN_TERMS = [
  // ESTADO seção 4 — alegações sobre o produto, minerais e aditivos
  'natural',
  'puro',
  'pureza',
  'mineral',
  'minerais',
  'aditivo',
  'sem aditivo',
  'zero aditivo',
  '100% natural',
  'não empedra naturalmente',
  'orgânico',
  'iodo natural',
  // ESTADO seção 4 — família que a ANVISA já puniu (precedente 07/08/2026)
  'eletrólito',
  'eletrólitos',
  'hidratação',
  'reposição mineral',
  'essencial para o organismo',
  'essenciais para o organismo',
  'terapêutic',
  'medicinal',
  'cura',
  'previne',
  'prevenção',
  // pedidos explicitamente para este guard
  'saúde',
  'saudável',
  'benefício',
  'benefícios',
  'iodo',
  'energia',
];

/** Remove aspas e cercas de markdown que a LLM às vezes devolve em volta do texto. */
function cleanModelOutput(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return text;
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/** Dígitos que o texto pode conter sem ser considerado "valor inventado". */
function allowedNumbers(input: Pick<RadarDraftInput, 'bags' | 'freightNote' | 'loadDate'>): Set<string> {
  const allowed = new Set<string>();
  allowed.add(String(input.bags));
  allowed.add('25'); // peso do saco — fato fixo, não é preço
  if (input.freightNote) {
    for (const n of extractNumbers(input.freightNote)) allowed.add(n);
  }
  if (input.loadDate) {
    const [y, m, d] = input.loadDate.split('-');
    for (const part of [y, m, d]) {
      if (!part) continue;
      allowed.add(part);
      allowed.add(String(Number(part))); // sem zero à esquerda ("05" → "5")
    }
  }
  return allowed;
}

/**
 * Guard de saída, puro e determinístico: decide se o texto que a LLM devolveu pode
 * ser usado como está, ou se precisa cair para o template fixo. Nunca deixa passar
 * preço/desconto/prazo inventado, contagem de sacos errada, termo proibido ou link.
 */
export function passesRadarMessageGuard(
  message: string,
  input: Pick<RadarDraftInput, 'bags' | 'freightNote' | 'loadDate'>,
): boolean {
  if (!message || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) return false;

  const lower = message.toLowerCase();

  if (FORBIDDEN_TERMS.some((term) => lower.includes(term))) return false;

  if (/https?:\/\/|www\.|\S+\.(com|com\.br|net|org)(\/\S*)?/i.test(message)) return false;

  const freightHasRs = /r\$/i.test(input.freightNote ?? '');
  if (/r\$/i.test(message) && !freightHasRs) return false;

  const freightHasPercent = (input.freightNote ?? '').includes('%');
  if (message.includes('%') && !freightHasPercent) return false;

  const allowed = allowedNumbers(input);
  const found = extractNumbers(message);
  if (found.some((n) => !allowed.has(n))) return false;

  const sacosMatch = lower.match(/(\d+)\s*sac/);
  if (sacosMatch && Number(sacosMatch[1]) !== input.bags) return false;

  return true;
}

function formatDateBr(loadDate: string): string {
  const [, m, d] = loadDate.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Template fixo, usado quando a IA não está configurada, falha, ou devolve algo que
 * não passa no guard. Precisa passar no próprio guard — testado.
 */
export function buildDeterministicRadarMessage(input: RadarDraftInput): string {
  const dateLine = input.loadDate ? ` no dia ${formatDateBr(input.loadDate)}` : '';
  const freightLine = input.freightNote ? ` ${input.freightNote.trim()}` : '';
  return (
    `Olá! Aqui é ${input.attendantName}, da Sal Vita. Vamos enviar uma carreta para a região de ` +
    `${input.originLabel}${dateLine}, e ainda sobra espaço para ${input.bags} sacos de sal de 25 kg ` +
    `nessa carga (espaço limitado nesta carga). Como vocês, da ${input.companyName}, ficam em ` +
    `${input.cityLabel}, dava pra incluir o pedido de vocês nessa carga e dividir o frete.${freightLine} ` +
    `Se fizer sentido, me avisa que já preparo um orçamento. Podemos conversar?`
  );
}

function buildPrompt(input: RadarDraftInput): LlmMessage[] {
  const facts = {
    atendente: input.attendantName,
    empresa: input.companyName,
    cidade_da_empresa: input.cityLabel,
    segmentos: input.segmentLabels,
    origem_da_carga: input.originLabel,
    sacos_disponiveis_25kg: input.bags,
    data_da_carga: input.loadDate ?? null,
    condicao_de_frete: input.freightNote ?? null,
  };

  const system = `Você escreve UMA mensagem curta de WhatsApp, em português do Brasil, para um vendedor da
Sal Vita (sal marinho de Mossoró/RN) mandar À MÃO para uma empresa que ainda não é cliente.
Use SOMENTE os fatos do bloco FATOS abaixo — nunca invente preço, desconto, percentual, prazo
ou qualquer característica do produto. Se "condicao_de_frete" for null, não fale de frete.
Se "data_da_carga" for null, não mencione data.

Regras obrigatórias:
- Primeira pessoa, como se fosse o próprio atendente escrevendo.
- No máximo 600 caracteres, sem links, no máximo 1 emoji (pode ser 0).
- Mencione que uma carreta vai para "origem_da_carga" com espaço para exatamente
  "sacos_disponiveis_25kg" sacos de 25 kg, e ofereça incluir o pedido da empresa dividindo o frete.
- Pode dizer que o espaço é limitado nessa carga (é verdade), mas não invente urgência além disso.
- NUNCA fale de saúde, benefício, nutriente, aditivo, "natural", "puro", pureza, quantidade de
  minerais, iodo, cura, prevenção ou qualquer alegação terapêutica. Fale só de "sal" e do saco de 25 kg.
- Termine perguntando se a empresa quer um orçamento.
- Responda só com o texto da mensagem, sem aspas, sem markdown, sem explicação.`;

  const user = `FATOS:\n${JSON.stringify(facts, null, 2)}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export async function draftRadarMessage(input: RadarDraftInput): Promise<RadarDraftResult> {
  const fallback = { message: buildDeterministicRadarMessage(input), provider: 'modelo-fixo' };

  let completion;
  try {
    completion = await completeWithFallback(buildPrompt(input), {
      temperature: 0.4,
      maxTokens: 220,
      label: 'RADAR_DRAFT',
    });
  } catch {
    return fallback;
  }

  const cleaned = cleanModelOutput(completion.text);
  if (!passesRadarMessageGuard(cleaned, input)) return fallback;

  return { message: cleaned, provider: completion.provider };
}
