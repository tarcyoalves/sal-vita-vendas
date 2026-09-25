// Rascunho de mensagem de abordagem do Radar de Cargas. Implementação: subagente "IA".
// A mensagem é enviada À MÃO pelo atendente (link wa.me) — nunca por automação.
export interface RadarDraftInput {
  companyName: string;
  cityLabel: string;        // "Dionísio Cerqueira - SC"
  segmentLabels: string[];
  originLabel: string;      // cidade da carga principal, "Barracão - PR"
  bags: number;             // saldo de sacos de 25 kg na carreta
  loadDate?: string;        // YYYY-MM-DD, se o atendente informou
  freightNote?: string;     // condição de frete digitada pelo atendente; a IA não inventa valor
  attendantName: string;
}

export async function draftRadarMessage(_input: RadarDraftInput): Promise<{ message: string; provider: string }> {
  throw new Error('draftRadarMessage: não implementado');
}
