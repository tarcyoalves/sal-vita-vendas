// Extrai termos limpos de busca a partir de um título de lead do CRM Lembretes.
// Títulos de tarefas no CRM frequentemente trazem: CNPJ + Razão Social + Nome do Contato + Cidade + UF
// Ex: "10400015000109 - BRAFERTIL BRASIL FERTILIZANTES LTDA - ITABORAÍ - RJ"
// Esta função extrai os termos que realmente podem ser encontrados como nome do contato no WhatsApp Web.

const DESCARTAR = new Set([
  'ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 'industria', 'comercio', 'fertilizantes',
  'panificacao', 'distribuidora', 'transportes', 'alimentos', 'supermercado',
  'ba', 'rj', 'sp', 'mg', 'rn', 'ce', 'pe', 'pb', 'go', 'pr', 'rs', 'sc', 'es', 'df', 'to', 'se', 'al', 'pi', 'ma', 'am', 'pa', 'mt', 'ms', 'ro', 'ac', 'ap', 'rr',
  'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'no', 'na',
]);

export function extrairTermosLead(titulo: string): string[] {
  if (!titulo || typeof titulo !== 'string') return [];

  // 1. Remove CNPJ formatado ou 14 dígitos consecutivos
  let limpo = titulo
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '')
    .replace(/\b\d{14}\b/g, '')
    .replace(/CNPJ:?\s*/gi, '')
    .trim();

  // 2. Segmenta por hífen, barra ou pipe
  const segmentos = limpo
    .split(/\s*[-/|]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const termos: string[] = [];
  const adicionar = (t: string) => {
    const v = t.trim();
    if (v.length >= 3 && !termos.includes(v) && !/^\d+$/.test(v)) {
      termos.push(v);
    }
  };

  for (const seg of segmentos) {
    const palavras = seg.split(/\s+/).filter((p) => p.length > 0);
    const uteis = palavras.filter((p) => !DESCARTAR.has(p.toLowerCase()));
    if (uteis.length > 0) {
      adicionar(uteis.join(' '));
      // Se houver mais de uma palavra, também tenta a primeira palavra significativa (ex: "BRAFERTIL" de "BRAFERTIL BRASIL")
      if (uteis.length > 1 && uteis[0].length >= 3) {
        adicionar(uteis[0]);
      }
    }
  }

  // Se nenhum segmento sobreviveu, usa o texto limpo básico
  if (termos.length === 0 && limpo.length >= 3) {
    adicionar(limpo);
  }

  return termos;
}
