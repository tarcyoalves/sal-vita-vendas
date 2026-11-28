// Travas de conteúdo do Sales AI: tudo que um cliente lê (e-mail de prospecção, resposta do
// vendedor virtual, linha de abertura escrita por IA) passa por aqui. Fonte das regras:
// ESTADO-DO-PROJETO.md, seções 1 e 4 (ANVISA, rótulo, precedentes de 07/08/2026).
//
// Esta lista é a camada barata e determinística. Ela NÃO basta sozinha (V3.1, 16.6): o vendedor
// virtual ainda passa por saída estruturada, dados críticos montados pelo servidor e checagem
// semântica. Na dúvida, bloqueia.

/** Remove acentos e baixa a caixa, para comparar termos sem depender de grafia. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Família semântica proibida. Cada item é uma expressão regular sobre o texto NORMALIZADO
 * (sem acento, minúsculo). O rótulo explica o motivo, para o painel e o registro.
 */
export const TERMOS_PROIBIDOS: ReadonlyArray<{ re: RegExp; motivo: string }> = [
  // Alegação de saúde / terapêutica (ESTADO-DO-PROJETO §1 regra 3; precedente ANVISA 07/08/2026)
  { re: /\bsaudave(l|is)\b|\bmais saude\b|\bfaz bem\b|\bbom para (a|o) (saude|coracao|pressao|corpo|organismo)\b/, motivo: 'alegação de saúde' },
  { re: /\bmenos sodio\b|\bbaixo (teor de )?sodio\b|\breduz(ido)? (o )?sodio\b|\bpouco sodio\b/, motivo: 'alegação sobre sódio' },
  { re: /\bpressao (alta|arterial)\b|\bhipertens/, motivo: 'alegação terapêutica' },
  { re: /\bcaimbra|\bfadiga\b|\brecuperacao (muscular|apos)|\bhidrata(cao|r|nte)\b|\beletrolit/, motivo: 'família semântica vetada pela ANVISA' },
  { re: /\breposicao (mineral|de minerais)\b|\bminerais essenciais\b|\bpara o (seu )?organismo\b|\benergia\b|\bimunidade\b/, motivo: 'família semântica vetada pela ANVISA' },
  { re: /\bprevin(e|ir)\b|\bcura\b|\btrata(mento)? de\b|\bdetox\b|\bdesintoxic/, motivo: 'promessa terapêutica' },
  { re: /\bmedicinal\b|\bremedio\b|\bterapeutic/, motivo: 'alegação terapêutica' },
  // Composição sem laudo (§1 regra 4; §4)
  { re: /\+\s*\d+\s*minerais|\b\d{2,}\s*\+?\s*minerais\b|\b(80|84)\b[^.]{0,20}minerais/, motivo: 'número de minerais sem laudo' },
  { re: /\brico em minerais\b|\bfonte de minerais\b/, motivo: 'alegação de composição' },
  // Aditivos (§1 regra 2): a embalagem declara dois
  { re: /\bsem (nenhum )?(aditivo|quimico|conservante)s?\b|\bzero aditivos?\b|\bnenhum (aditivo|quimico)\b|\blivre de (aditivos|quimicos)\b/, motivo: 'afirma ausência de aditivo (o rótulo declara dois)' },
  { re: /\b100\s*%\s*natural\b|\btotalmente natural\b|\bpuro e natural\b/, motivo: '"100% natural" vetado' },
  { re: /\biodo natural\b|\bnao empedra naturalmente\b/, motivo: 'contradiz o rótulo' },
  // Comparação de benefício com outro sal
  { re: /\bmelhor (que|do que) o sal (comum|refinado)\b|\bsal refinado (faz mal|e ruim|prejudica)/, motivo: 'comparação de benefício' },
];

export interface ResultadoConteudo {
  ok: boolean;
  achados: string[];
}

/** Verifica um texto que um cliente vai ler. Qualquer achado = bloquear. */
export function verificarTextoComercial(texto: string): ResultadoConteudo {
  const n = normalizarTexto(texto);
  const achados = TERMOS_PROIBIDOS.filter((t) => t.re.test(n)).map((t) => t.motivo);
  return { ok: achados.length === 0, achados: [...new Set(achados)] };
}

/**
 * Detecta valor monetário ou número com cara de preço/frete/prazo no texto livre do modelo.
 * Regra do vendedor virtual: número crítico só o servidor escreve (V3.1, 7.3 camada 1).
 */
export function contemValorCritico(texto: string): boolean {
  const n = normalizarTexto(texto);
  return /r\$\s*\d|\d+[.,]\d{2}\b|\b\d+\s*(reais|centavos)\b|\b\d+\s*(dias?|horas?)\s*(uteis|corridos)?\b|\b\d+\s*%/.test(n);
}

/**
 * Remove dados pessoais antes de mandar texto a um provedor de IA: sequências de 8+ dígitos
 * (telefone, CPF, CNPJ, CEP longo), e-mails. Mascarar não é anonimizar (V3.1, 16.6): também
 * reduza o contexto enviado ao mínimo.
 */
export function removerDadosPessoais(texto: string): string {
  return texto
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
    .replace(/\d(?:[\s.\-/()]*\d){7,}/g, '[número]');
}
