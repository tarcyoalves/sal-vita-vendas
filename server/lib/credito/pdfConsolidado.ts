// PDF CONSOLIDADO do documento ("Relatório de Análise de Crédito — Sal Vita"), desenhado para DECISÃO.
//
// Ordem (cada dado aparece UMA vez):
//   a) topo: título, razão social, CNPJ e as fontes com data/hora
//   b) painel de decisão: veredito (regras Sal Vita) + um CARTÃO por score de cada fonte (nunca somados nem em média)
//   c) matriz de comparação por fonte (a peça central) com a coluna "Leitura" ("Divergem" quando as fontes discordam)
//   d) pontos de atenção (regras Sal Vita)
//   e) detalhamento das ocorrências (uma tabela por tipo, com a coluna Fonte)
//   f) dados da empresa  g) sócios  h) consultas ao documento  i) comportamento comercial  j) texto final (LGPD)
// Rodapé: só "Página X de Y" (a confidencialidade sai uma vez, no texto final). Sem cabeçalho por página.
// Zero invenção: todo número vem da fonte ou é rotulado "regra Sal Vita". Contatos (telefone/e-mail) nunca são impressos.
import type { RelatorioConsolidado, ScoreDaFonte } from '../../../shared/credito';
import { linhasDaMatriz, type TomMatriz, type VisualMatriz } from '../../../shared/creditoMatriz';
import { CONSULTA_COMPLETA, nomeDoProduto } from '../../../shared/creditoCatalogo';
import { comportamentoDe, empresaExtrasDe } from './pdfAnexo';
import {
  AZUL, AZUL_CLARO, CINZA, COR_SEMAFORO, GRUPOS, LARG, LINHA, MX, TEXTO, dataHoraCurta, detalhesDoGrupo, desenharParte,
  formatarDocumento, frasePelaFonte, limparTexto, painelVeredito, pct, renderizar, resumirTexto, secaoComportamento, secaoEmpresa,
  secaoFinal, secaoPontosDeAtencao, secaoSocios, dataBR, type Celula, type Pagina,
} from './pdfBase';

const ALERTA_TEXTO = '#B45309';
const VERDE = { fg: '#1E8E3E', bg: '#E6F4EA' };
const VERMELHO = { fg: '#C62828', bg: '#FDE8E8' };
const CINZA_CEL = { fg: '#6B7280', bg: '#F3F4F6' };
const ALERTA_CEL = { fg: ALERTA_TEXTO, bg: '#FFF6DB' };
const NEUTRO_CEL = { fg: TEXTO, bg: '#EEF2FA' };

// ---------- a) topo ----------
function topo(p: Pagina, c: RelatorioConsolidado) {
  const { doc } = p;
  const r = c.fundido;
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('Relatório de Análise de Crédito — Sal Vita', MX, p.y, { width: LARG, lineBreak: false });
  p.y += 12;
  const nome = limparTexto(r.cadastro.razaoSocial ?? r.cadastro.nomeFantasia).trim();
  const documento = `${r.tipo} ${formatarDocumento(r.documento, r.tipo)}`;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(TEXTO).text(nome || documento, MX, p.y, { width: LARG });
  p.y = doc.y + 2;
  if (nome) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXTO).text(documento, MX, p.y, { width: LARG, lineBreak: false });
    p.y += 13;
  }
  const fontes = c.fontes.map((f) => `${limparTexto(f.produtoNome)} (${dataHoraCurta(f.consultadoEm)})`).join(' · ');
  doc.font('Helvetica').fontSize(9).fillColor(CINZA).text(`Fontes: ${fontes}`, MX, p.y, { width: LARG });
  p.y = doc.y + 2;
  if (!c.valido) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COR_SEMAFORO.VERMELHO)
      .text('Vencido: nenhuma das consultas tem menos de 30 dias.', MX, p.y, { width: LARG });
    p.y = doc.y + 2;
  }
  const faltam = CONSULTA_COMPLETA.filter((k) => !c.fontes.some((f) => f.produto === k));
  if (c.fontes.length < 2 && faltam.length) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ALERTA_TEXTO)
      .text(`Só uma fonte consultada: faltam os dados da outra (${faltam.map((k) => nomeDoProduto(k)).join(', ')}).`, MX, p.y, { width: LARG });
    p.y = doc.y + 2;
  }
  p.y += 6;
}

// ---------- b) cartões de score ----------
const ALTURA_CARTAO = 122;

function cartaoDeScore(p: Pagina, s: ScoreDaFonte, x: number, y: number, w: number) {
  const { doc } = p;
  const calc = s.calculado && s.valor !== null;
  doc.roundedRect(x, y, w, ALTURA_CARTAO, 6).fill(calc ? AZUL_CLARO : '#F3F4F6');
  const ix = x + 8;
  const iw = w - 16;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(CINZA).text(limparTexto(s.produtoNome).toUpperCase(), ix, y + 7, { width: iw, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXTO).text(limparTexto(s.rotulo ?? 'Score (0 a 1000)'), ix, y + 18, { width: iw, lineBreak: false, ellipsis: true });
  if (!calc) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(CINZA).text('não calculado', ix, y + 38, { width: iw, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(CINZA).text('A fonte não calculou este score.', ix, y + 58, { width: iw, height: 20 });
    return;
  }
  doc.font('Helvetica-Bold').fontSize(26).fillColor(AZUL).text(String(s.valor), ix, y + 30, { width: iw, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(TEXTO)
    .text(`Inadimplência: `, ix, y + 63, { continued: true, width: iw, lineBreak: false })
    .font('Helvetica-Bold').text(s.probabilidadeInadimplencia === null ? 'não informada' : pct(s.probabilidadeInadimplencia));
  if (s.faixa) doc.font('Helvetica').fontSize(8).fillColor(TEXTO).text(`Faixa: ${limparTexto(s.faixa)}`, ix, y + 74, { width: iw, lineBreak: false, ellipsis: true });
  // régua 0-1000 compacta com marcador
  const by = y + 90;
  const bh = 5;
  const px = (n: number) => ix + (n / 1000) * iw;
  doc.rect(px(0), by, px(400) - px(0), bh).fill(COR_SEMAFORO.VERMELHO);
  doc.rect(px(400), by, px(600) - px(400), bh).fill(COR_SEMAFORO.AMARELO);
  doc.rect(px(600), by, px(1000) - px(600), bh).fill(COR_SEMAFORO.VERDE);
  const mx = px(Math.min(1000, Math.max(0, s.valor as number)));
  doc.moveTo(mx, by - 2).lineTo(mx, by + bh + 2).lineWidth(1.6).strokeColor('#111827').stroke();
  doc.font('Helvetica').fontSize(6).fillColor(CINZA);
  for (const t of [0, 400, 600, 1000]) {
    doc.text(String(t), Math.min(Math.max(px(t) - 8, ix - 2), ix + iw - 14), by + bh + 3, { width: 16, align: 'center', lineBreak: false });
  }
  const leitura = resumirTexto(frasePelaFonte(s.texto), 90);
  if (leitura) doc.font('Helvetica').fontSize(6.5).fillColor(CINZA).text(leitura, ix, y + 105, { width: iw, height: 16, ellipsis: true });
}

function painelDeDecisao(p: Pagina, c: RelatorioConsolidado) {
  painelVeredito(p, c.veredito, c.motivos);
  // cartões lado a lado: até 3 por linha (2 quando são 4)
  const n = c.scores.length;
  const colunas = n <= 3 ? n : 2;
  const gap = 8;
  const w = (LARG - gap * (colunas - 1)) / colunas;
  p.garantir(ALTURA_CARTAO + 70);
  p.titulo('Scores informados pelas fontes');
  for (let i = 0; i < n; i += colunas) {
    p.garantir(ALTURA_CARTAO + 6);
    c.scores.slice(i, i + colunas).forEach((s, j) => cartaoDeScore(p, s, MX + j * (w + gap), p.y, w));
    p.y += ALTURA_CARTAO + 6;
  }
  p.paragrafo('Scores informados pelas fontes; não calculados pela Sal Vita. Cada fonte usa um modelo diferente: não são somados nem combinados.', { cor: CINZA, tam: 7.5 });
  if (c.divergenciaScore) p.paragrafo(`Divergência: ${c.divergenciaScore.replace(/^S/, 's')}`, { cor: ALERTA_TEXTO, tam: 8.5, negrito: true });
  if (c.scoreAltoComRestricao) {
    p.paragrafo('Atenção: algum score é alto, mas há restrições registradas. Para decidir, prevalecem as restrições, não o score.', { cor: ALERTA_TEXTO, tam: 8.5, negrito: true });
  }
}

// ---------- c) matriz de comparação ----------
interface CelMatriz { principal: string; sub?: string; fg: string; bg: string | null }

const CORES: Record<TomMatriz, { fg: string; bg: string }> = {
  verde: VERDE, vermelho: VERMELHO, cinza: CINZA_CEL, ambar: ALERTA_CEL, neutro: NEUTRO_CEL, texto: { fg: TEXTO, bg: '#FFFFFF' },
};
const comoCelula = (v: VisualMatriz): CelMatriz => ({ principal: v.principal, sub: v.sub ?? undefined, fg: CORES[v.tom].fg, bg: v.fundo ? CORES[v.tom].bg : null });

function matrizDeComparacao(p: Pagina, c: RelatorioConsolidado) {
  const { doc } = p;
  const nf = c.fontes.length;
  const wItem = 100;
  const wLeit = nf > 2 ? 100 : 118;
  const wF = (LARG - wItem - wLeit) / nf;
  const PAD = 4;
  const linhas = linhasDaMatriz(c).map((l) => ({ rotulo: l.rotulo, cels: l.celulas.map(comoCelula), leitura: comoCelula(l.leitura) }));
  const alturaTexto = (cel: CelMatriz, larg: number): number => {
    doc.font('Helvetica-Bold').fontSize(8.5);
    let h = doc.heightOfString(limparTexto(cel.principal), { width: larg - PAD * 2 });
    if (cel.sub) { doc.font('Helvetica').fontSize(7.5); h += 1 + doc.heightOfString(limparTexto(cel.sub), { width: larg - PAD * 2 }); }
    return h;
  };
  const alturas = linhas.map((l) => {
    doc.font('Helvetica-Bold').fontSize(8.5);
    const hItem = doc.heightOfString(limparTexto(l.rotulo), { width: wItem - PAD * 2 });
    return Math.max(hItem, ...l.cels.map((x) => alturaTexto(x, wF)), alturaTexto(l.leitura, wLeit)) + PAD * 2;
  });
  const hCab = 16;
  p.garantir(hCab + alturas.reduce((a, b) => a + b, 0) + 48);
  p.titulo('Comparação entre as fontes');

  // cabeçalho
  doc.rect(MX, p.y, LARG, hCab).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
  doc.text('Item', MX + PAD, p.y + 4.5, { width: wItem - PAD * 2, lineBreak: false });
  c.fontes.forEach((f, j) => doc.text(limparTexto(f.produtoNome), MX + wItem + j * wF + PAD, p.y + 4.5, { width: wF - PAD * 2, lineBreak: false, ellipsis: true }));
  doc.text('Leitura', MX + wItem + nf * wF + PAD, p.y + 4.5, { width: wLeit - PAD * 2, lineBreak: false });
  p.y += hCab;

  linhas.forEach((l, i) => {
    const h = alturas[i];
    const y0 = p.y;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXTO).text(limparTexto(l.rotulo), MX + PAD, y0 + PAD, { width: wItem - PAD * 2 });
    const desenhar = (cel: CelMatriz, x: number, w: number) => {
      if (cel.bg) doc.rect(x + 1.5, y0 + 1.5, w - 3, h - 3).fill(cel.bg);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(cel.fg).text(limparTexto(cel.principal), x + PAD, y0 + PAD, { width: w - PAD * 2 });
      if (cel.sub) doc.font('Helvetica').fontSize(7.5).fillColor(cel.fg).text(limparTexto(cel.sub), x + PAD, doc.y + 1, { width: w - PAD * 2 });
    };
    l.cels.forEach((cel, j) => desenhar(cel, MX + wItem + j * wF, wF));
    desenhar(l.leitura, MX + wItem + nf * wF, wLeit);
    doc.moveTo(MX, y0 + h).lineTo(MX + LARG, y0 + h).lineWidth(0.5).strokeColor(LINHA).stroke();
    p.y = y0 + h;
  });
  p.y += 3;
  p.paragrafo('Verde: a fonte consultou e nada consta. Vermelho: há ocorrências. Cinza: a fonte não consulta este item. "Divergem" = as fontes discordam; os números não são fundidos.', { cor: CINZA, tam: 7 });
}

// ---------- e) detalhamento das ocorrências ----------
function detalhamento(p: Pagina, c: RelatorioConsolidado, agora: Date) {
  const r = c.fundido;
  const comOcorrencia = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && (r.anotacoes[k].quantidade > 0 || r.anotacoes[k].itens.length > 0));
  if (!comOcorrencia.length) return;
  p.titulo('Detalhamento das ocorrências');
  for (const [k, nome, remover] of comOcorrencia) {
    const ocultar = [r.cadastro.razaoSocial, r.cadastro.nomeFantasia, r.documento, formatarDocumento(r.documento, r.tipo)];
    detalhesDoGrupo(p, r.anotacoes[k], nome.replace(/ \(.*\)$/, ''), remover, agora, {
      ocultar, ...(k === 'acoesJudiciais' ? { tituloDescricao: 'Ação', tituloLocal: 'Foro / vara' } : {}),
    });
  }
}

// ---------- h) consultas ao documento ----------
const mesAno = (aaaamm: string | null): string => {
  const m = aaaamm ? /^(\d{4})-(\d{2})/.exec(aaaamm) : null;
  return m ? `${m[2]}/${m[1]}` : '—';
};

function secaoConsultasDoDocumento(p: Pagina, c: RelatorioConsolidado) {
  const r = c.fundido;
  const comp = r.complementos;
  const janelas = comp?.consultasJanelas;
  const mensal = comp?.consultasPorMes ?? [];
  const segmentos = comp?.consultasPorSegmento ?? [];
  const totais = c.consultasPorFonte.filter((f) => f.total12 !== null);
  if (!janelas && !r.consultasRecentes.length && !mensal.length && !segmentos.length && !totais.length) return;
  p.titulo('Consultas ao documento');

  if (janelas) {
    const quem = c.consultasPorFonte.find((f) => f.c30?.origem === 'janela')?.produtoNome;
    const n = (v: number | null) => (v === null ? 'não informado' : String(v));
    p.garantir(70);
    p.subtitulo(`Contagem oficial por janela${quem ? ` (${limparTexto(quem)})` : ''}`);
    p.tabela(
      [{ titulo: 'Até 30 dias', largura: 1, alinhar: 'center' }, { titulo: '31 a 60 dias', largura: 1, alinhar: 'center' }, { titulo: '61 a 90 dias', largura: 1, alinhar: 'center' }, { titulo: 'Mais de 90 dias', largura: 1, alinhar: 'center' }],
      [[janelas.ate30, janelas.de31a60, janelas.de61a90, janelas.mais90].map((v): Celula => ({ texto: n(v), negrito: true }))],
    );
  }
  if (totais.length) {
    p.paragrafo('Total em 12 meses: ' + totais.map((f) => `${limparTexto(f.produtoNome)}: ${f.total12}`).join('   |   '), { negrito: true, tam: 8.5 });
  }
  if (r.consultasRecentes.length) {
    const maior = Math.max(0, ...totais.map((f) => f.total12 ?? 0));
    p.garantir(40 + Math.min(r.consultasRecentes.length, 12) * 15); // subtítulo + tabela curta juntos
    p.subtitulo('Últimas consultas' + (maior > r.consultasRecentes.length ? ` (a fonte listou ${r.consultasRecentes.length} de ${maior} no período)` : ''));
    const comQtd = r.consultasRecentes.some((x) => x.quantidade > 1);
    p.tabela(
      [{ titulo: 'Data', largura: 70 }, { titulo: 'Consultante', largura: comQtd ? 360 : 445 }, ...(comQtd ? [{ titulo: 'Quantidade', largura: 85, alinhar: 'right' as const }] : [])],
      r.consultasRecentes.map((x) => [{ texto: dataBR(x.data) }, { texto: x.consultante }, ...(comQtd ? [{ texto: String(x.quantidade) }] : [])]),
    );
  }
  if (mensal.length) {
    p.garantir(48 + mensal.length * 15);
    p.subtitulo('Consultas por mês');
    const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    p.tabela(
      [{ titulo: 'Ano', largura: 44 }, ...MES.map((m) => ({ titulo: m, largura: 38, alinhar: 'right' as const }))],
      mensal.map((l) => [{ texto: String(l.ano), negrito: true }, ...l.meses.map((v): Celula => ({ texto: v === null ? '-' : String(v) }))]),
      { compacta: true },
    );
  }
  if (segmentos.length) {
    p.garantir(40 + segmentos.length * 15);
    p.subtitulo('Consultas por segmento (mês, quantidade e atividade do consultante)');
    p.tabela(
      [{ titulo: 'Mês', largura: 60 }, { titulo: 'Segmento', largura: 385 }, { titulo: 'Quantidade', largura: 70, alinhar: 'right' }],
      segmentos.map((s) => [{ texto: mesAno(s.mes) }, { texto: s.segmento }, { texto: s.quantidade === null ? '—' : String(s.quantidade) }]),
    );
  }
}

// ---------- gerador ----------
/**
 * `brutos` = respostas cruas das fontes: só para a matriz de comportamento comercial e o porte/filiais (campos que o relatório
 * mapeado não carrega). Sem elas o PDF sai igual, apenas sem esses detalhes.
 */
export async function gerarPdfCreditoConsolidado(
  c: RelatorioConsolidado,
  meta: { consultadoPor: string | null },
  brutos: Array<{ produto: string; bruto: unknown }> = [],
): Promise<Buffer> {
  const r = c.fundido;
  return renderizar(r, { subject: `Análise de crédito ${formatarDocumento(r.documento, r.tipo)} (consolidado)` }, (p, agora) => {
    const pf = r.tipo === 'CPF';
    const seguro = <T,>(f: () => T | null): T | null => { try { return f(); } catch { return null; } };
    const doComport = brutos.find((b) => seguro(() => comportamentoDe(b.bruto, pf)));
    const todosExtras = brutos.map((b) => seguro(() => empresaExtrasDe(b.bruto)));
    const extras = {
      funcionarios: todosExtras.map((e) => e?.funcionarios ?? null).find(Boolean) ?? null,
      porte: todosExtras.map((e) => e?.porte ?? null).find(Boolean) ?? null,
      filiais: todosExtras.map((e) => e?.filiais ?? null).find(Boolean) ?? null,
    };
    const ctr = { omitidos: 0 };
    topo(p, c);
    painelDeDecisao(p, c);
    matrizDeComparacao(p, c);
    secaoPontosDeAtencao(p, r, agora, [], c.sinais, 'Pontos de atenção (regras da Sal Vita)');
    detalhamento(p, c, agora);
    secaoEmpresa(p, r, null, agora, extras);
    secaoSocios(p, r);
    secaoConsultasDoDocumento(p, c);
    const nomeComport = doComport ? c.fontes.find((f) => f.produto === doComport.produto)?.produtoNome : c.fontes.find((f) => f.produto === 'boavista')?.produtoNome;
    secaoComportamento(p, r, doComport?.bruto ?? null, (parte) => desenharParte(p, parte, ctr), nomeComport ? `Comportamento comercial (${limparTexto(nomeComport)})` : 'Comportamento comercial');
    secaoFinal(p, meta.consultadoPor);
  }, { rodapeCurto: true });
}
