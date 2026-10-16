// PDF do relatório de crédito ("Relatório de Análise de Crédito — Sal Vita").
// Layout PRÓPRIO da Sal Vita (azul #0C3680). Não usa nome, logo, cores-assinatura nem leiaute de bureau algum:
// o provedor aparece apenas na linha "Fonte:" do topo da 1ª página.
//
// SEM REDUNDÂNCIA: cada dado aparece uma vez. Ordem: topo -> veredito/score/pontos de atenção -> anotações negativas ->
// dados da empresa -> sócios -> consultas -> comportamento comercial -> (só se sobrar) outras informações da fonte.
//
// Biblioteca: pdfkit (JS puro, sem binário nativo nem Chromium). Importamos o build "browser" do pdfkit POR CAMINHO,
// de propósito: o build "node" carrega as métricas das fontes padrão (Helvetica) em tempo de execução com
// createRequire('#standard-fonts/...'), o que QUEBRA depois que o esbuild empacota api/bundle.js. O build "browser"
// traz as fontes embutidas no próprio arquivo e funciona igual em Node, no teste e no bundle serverless.
import type { RelatorioCredito, Veredito } from '../../../shared/credito';
import { entradasDeScore } from '../../../shared/credito';
import { consultasPorJanelaTexto, faixaExibivel, segmentoLegivel } from '../../../shared/creditoRotulos';
import { nomeDoProduto } from '../../../shared/creditoCatalogo';
import { consultasPorMes, montarAnexo, registrosDaParte, type Anexo } from './pdfAnexo';
import {
  AZUL, AZUL_CLARO, CINZA, COR_SEMAFORO, GRUPOS, LARG, MAX_PAGINAS_PDF, MX, TEXTO, brl, dataBR, dataHoraBR, desenharParte, detalhesDoGrupo,
  formatarDocumento, frasePelaFonte, limparTexto, painelVeredito, pct, renderizar, resumirTexto, secaoComportamento, secaoEmpresa,
  secaoFinal, secaoPontosDeAtencao, secaoSocios, txt, type Coluna, type Pagina,
} from './pdfBase';

// Compatibilidade: quem já importava daqui continua importando daqui.
export {
  FAIXA_SIMULACAO, MAX_PAGINAS_PDF, formatarDocumento, frasePelaFonte, limparTexto, mascararDocumento, naturezaJuridicaTexto, resumirTexto,
} from './pdfBase';
export { gerarPdfCreditoConsolidado } from './pdfConsolidado';

// ---------- seções ----------
/** 1 (topo da 1ª página, uma vez só) e 2 (veredito, motivos, score com régua). */
function secaoResumo(p: Pagina, r: RelatorioCredito, meta: { veredito: Veredito; motivos: string[] }) {
  const { doc } = p;

  // identificação: título pequeno, razão social grande e uma linha com documento, data/hora e fonte
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('Relatório de Análise de Crédito — Sal Vita', MX, p.y, { width: LARG, lineBreak: false });
  p.y += 12;
  const nome = limparTexto(r.cadastro.razaoSocial ?? r.cadastro.nomeFantasia).trim();
  const documento = `${r.tipo} ${formatarDocumento(r.documento, r.tipo)}`;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(TEXTO).text(nome || documento, MX, p.y, { width: LARG });
  p.y = doc.y + 2;
  const linha = [nome ? documento : '', `Consulta em ${dataHoraBR(r.consultadoEm)}`, `Fonte: ${fonteDosDados(r)}`].filter(Boolean).join('   |   ');
  doc.font('Helvetica').fontSize(9).fillColor(CINZA).text(linha, MX, p.y, { width: LARG });
  p.y = doc.y + 8;

  painelVeredito(p, meta.veredito, meta.motivos);

  // score + régua 0-1000
  p.garantir(100);
  const sy = p.y;
  const v = r.score.valor;
  doc.roundedRect(MX, sy, 150, 76, 6).fill(AZUL_CLARO);
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('SCORE (0 A 1000)', MX + 10, sy + 8, { width: 130, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(v === null ? 14 : 34).fillColor(AZUL)
    .text(v === null ? 'Não informado' : String(v), MX + 10, sy + (v === null ? 28 : 20), { width: 130, lineBreak: false });
  const faixa = faixaExibivel(r.score.faixa);
  if (faixa) {
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO).text(`Faixa: ${txt(faixa)}`, MX + 10, sy + 60, { width: 130, lineBreak: false });
  }

  const rx = MX + 170;
  const rw = LARG - 170;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXTO).text('Probabilidade de inadimplência', rx, sy + 2, { width: rw, lineBreak: false });
  const prob = r.score.probabilidadeInadimplencia;
  doc.font('Helvetica-Bold').fontSize(prob === null ? 10 : 14).fillColor(AZUL).text(prob === null ? 'Não informada' : pct(prob), rx, sy + (prob === null ? 17 : 14), { width: rw, lineBreak: false });
  const by = sy + 46;
  const bh = 12;
  const x = (n: number) => rx + (n / 1000) * rw;
  doc.rect(x(0), by, x(400) - x(0), bh).fill(COR_SEMAFORO.VERMELHO);
  doc.rect(x(400), by, x(600) - x(400), bh).fill(COR_SEMAFORO.AMARELO);
  doc.rect(x(600), by, x(1000) - x(600), bh).fill(COR_SEMAFORO.VERDE);
  doc.font('Helvetica').fontSize(7).fillColor(CINZA);
  for (const t of [0, 400, 600, 1000]) {
    const lx = Math.min(Math.max(x(t) - 10, rx - 4), rx + rw - 16);
    doc.text(String(t), lx, by + bh + 3, { width: 20, align: 'center', lineBreak: false });
  }
  doc.text('Alto risco', x(0) + 2, by - 10, { width: x(400) - x(0), lineBreak: false });
  doc.text('Atenção', x(400) + 2, by - 10, { width: x(600) - x(400), lineBreak: false });
  doc.text('Baixo risco', x(600) + 2, by - 10, { width: x(1000) - x(600), lineBreak: false });
  if (v !== null) {
    const mx = x(Math.min(1000, Math.max(0, v)));
    doc.moveTo(mx, by - 2).lineTo(mx, by + bh + 2).lineWidth(2).strokeColor('#111827').stroke();
    doc.polygon([mx - 5, by - 7], [mx + 5, by - 7], [mx, by - 1]).fill('#111827');
  }
  p.y = sy + 84;

  const leitura = resumirTexto(frasePelaFonte(r.score.textoInterpretacao));
  p.paragrafo('Score e probabilidade informados pela fonte; não são calculados pela Sal Vita.', { cor: CINZA, tam: 8 });
  if (meta.veredito === 'REPROVADO_A_PRAZO' && (r.score.valor ?? 0) >= 600) {
    p.paragrafo('Atenção: o score da fonte é alto, mas o relatório registra restrições. Para decidir, prevalecem as restrições, não o score.', { cor: '#B45309', tam: 8.5 });
  }
  if (leitura) p.paragrafo(leitura, { cor: CINZA, tam: 8 });
  // a MESMA fonte pode trazer mais de um score (ex.: Serasa Premium): cada um é impresso, nunca somado nem misturado
  for (const o of entradasDeScore(r.score).slice(1)) {
    const detalhe = o.valor === null ? 'não calculado' : `${o.valor} · probabilidade ${pct(o.probabilidadeInadimplencia)}${o.faixa ? ` · faixa ${txt(o.faixa)}` : ''}`;
    p.paragrafo(`Outro score da mesma fonte${o.rotulo ? ` (${o.rotulo})` : ''}: ${detalhe}.`, { cor: TEXTO, tam: 8.5, negrito: true });
  }
}

// ---------- 3. anotações negativas ----------
function secaoAnotacoes(p: Pagina, r: RelatorioCredito, agora: Date, anexo: Anexo | null) {
  p.titulo('Anotações negativas');
  const comOcorrencia = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && (r.anotacoes[k].quantidade > 0 || r.anotacoes[k].itens.length > 0));
  const zerados: string[] = [];
  const bruto = anexo?.semOcorrencias ?? [];
  for (const [k, nome, , rep] of GRUPOS) {
    const g = r.anotacoes[k];
    if (!g.consultado || g.quantidade > 0 || g.itens.length > 0) continue;
    const dele = rep ? bruto.filter((n) => rep.test(n)) : [];
    if (dele.length) zerados.push(...dele);
    else zerados.push(nome.replace(/ \(.*\)$/, ''));
  }
  for (const n of bruto) {
    const g = GRUPOS.find(([, , , rep]) => rep?.test(n));
    if (!g || comOcorrencia.includes(g)) zerados.push(n);
  }
  const naoInformados = GRUPOS.filter(([k]) => !r.anotacoes[k].consultado).map(([, nome]) => nome.replace(/ \(.*\)$/, ''));

  if (comOcorrencia.length) {
    p.tabela(
      [{ titulo: 'Item', largura: 270 }, { titulo: 'Quantidade', largura: 90, alinhar: 'right' }, { titulo: 'Valor total', largura: 155, alinhar: 'right' }],
      comOcorrencia.map(([k, nome]) => {
        const g = r.anotacoes[k];
        return [{ texto: nome, negrito: true, cor: COR_SEMAFORO.VERMELHO }, { texto: String(Math.max(g.quantidade, g.itens.length)) }, { texto: g.valorTotal !== null ? brl(g.valorTotal) : '—' }];
      }),
    );
  }
  if (zerados.length) p.paragrafo('Sem ocorrências em: ' + [...new Set(zerados)].join(', ') + '.', { cor: COR_SEMAFORO.VERDE, tam: 8.5, negrito: true });
  if (naoInformados.length) p.paragrafo('Não informado pela fonte: ' + naoInformados.join(', ') + '.', { cor: CINZA, tam: 8.5 });
  for (const a of anexo?.alertas ?? []) p.paragrafo('Alerta da fonte: ' + a, { cor: '#B45309', tam: 8.5, negrito: true });

  for (const [k, nome, remover] of comOcorrencia) {
    detalhesDoGrupo(p, r.anotacoes[k], nome.replace(/ \(.*\)$/, ''), remover, agora, { tituloDescricao: k === 'acoesJudiciais' ? 'Ação' : 'Descrição' });
  }
}

// ---------- 6. consultas ao documento ----------
const mesAnoDe = (aaaamm: string | null): string => {
  const m = aaaamm ? /^(\d{4})-(\d{2})/.exec(aaaamm) : null;
  return m ? `${m[2]}/${m[1]}` : '—';
};

function secaoConsultas(p: Pagina, r: RelatorioCredito, bruto: unknown) {
  const mensal = consultasPorMes(bruto);
  const total = r.complementos?.consultas12Meses;
  const janelas = r.complementos?.consultasJanelas;
  const segmentos = r.complementos?.consultasPorSegmento ?? [];
  if (!r.consultasRecentes.length && !mensal && !janelas && !segmentos.length && (total === null || total === undefined)) return;
  p.titulo('Consultas ao documento');
  if (janelas) p.paragrafo('Consultas por janela (contagem da fonte): ' + consultasPorJanelaTexto(janelas), { negrito: true, tam: 8.5 });
  if (typeof total === 'number') {
    const listadas = r.consultasRecentes.length;
    p.paragrafo(`Total em 12 meses: ${total}` + (listadas > 0 && listadas < total ? ` (a fonte listou ${listadas} de ${total})` : ''), { negrito: true, tam: 8.5 });
  }
  if (r.consultasRecentes.length) {
    const comQtd = r.consultasRecentes.some((c) => c.quantidade > 1);
    const colunas: Coluna[] = [{ titulo: 'Data', largura: 70 }, { titulo: 'Consultante', largura: comQtd ? 360 : 445 }];
    if (comQtd) colunas.push({ titulo: 'Quantidade', largura: 85, alinhar: 'right' });
    p.tabela(colunas, r.consultasRecentes.map((c) => [{ texto: dataBR(c.data) }, { texto: txt(c.consultante) }, ...(comQtd ? [{ texto: String(c.quantidade) }] : [])]));
  }
  if (segmentos.length) {
    p.garantir(40 + segmentos.length * 15);
    p.subtitulo('Consultas por mês e segmento');
    p.tabela(
      [{ titulo: 'Mês/ano', largura: 60 }, { titulo: 'Quantidade', largura: 70, alinhar: 'right' }, { titulo: 'Segmento do consultante', largura: 385 }],
      segmentos.map((x) => [{ texto: mesAnoDe(x.mes) }, { texto: x.quantidade === null ? '—' : String(x.quantidade) }, { texto: segmentoLegivel(x.segmento) }]),
    );
  }
  if (mensal) {
    p.subtitulo('Consultas por mês');
    p.tabela(
      mensal.colunas.map((titulo, i) => ({ titulo, largura: i === 0 ? 44 : 38, alinhar: i === 0 ? 'left' as const : 'right' as const })),
      mensal.linhas.map((l) => l.map((texto, i) => ({ texto, negrito: i === 0 }))),
      { compacta: true },
    );
  }
}

// ---------- 8. anexo: só o que o corpo não mostrou ----------
function secaoAnexo(p: Pagina, anexo: Anexo) {
  p.titulo('Outras informações da fonte', false);
  p.paragrafo('Dados da resposta da fonte que não aparecem nas seções anteriores. Campos vazios omitidos; CPF mascarado.', { cor: CINZA, tam: 8 });
  const ctr = { omitidos: 0 };
  for (const bloco of anexo.blocos) {
    if (p.estourou()) { ctr.omitidos += bloco.partes.reduce((a, parte) => a + registrosDaParte(parte), 0); continue; }
    try {
      p.bloco(bloco.titulo);
      for (const parte of bloco.partes) {
        if (p.estourou()) { ctr.omitidos += registrosDaParte(parte); continue; }
        desenharParte(p, parte, ctr);
      }
    } catch {
      p.paragrafo('Bloco não renderizado.', { cor: COR_SEMAFORO.VERMELHO, tam: 8.5 });
    }
  }
  if (ctr.omitidos > 0) {
    p.paragrafo(`Anexo truncado: ${ctr.omitidos} registros omitidos (limite de ${MAX_PAGINAS_PDF} páginas no PDF).`, { cor: COR_SEMAFORO.VERMELHO, negrito: true, tam: 9 });
  }
}

/** Nome do provedor/produto para o topo: nunca expõe o nome interno do provedor nem marca de bureau. */
function fonteDosDados(r: RelatorioCredito): string {
  const provedor = r.fonte.provedor === 'boavista_apifull' ? 'API Full' : r.fonte.provedor === 'simulado' ? 'Simulado' : r.fonte.provedor;
  return `${limparTexto(provedor)}/${limparTexto(nomeDoProduto(r.fonte.produto, r.fonte.provedor))}`;
}
export async function gerarPdfCredito(
  relatorioGravado: RelatorioCredito,
  meta: { veredito: Veredito; motivos: string[]; consultadoPor: string | null; /** coluna `produto` do registro (chave do catálogo): tem prioridade sobre fonte.produto */ produto?: string | null },
  /** Resposta crua do provedor (credit_reports.payload_bruto). Sem ela (ex.: simulado) não há anexo. */
  bruto?: unknown,
): Promise<Buffer> {
  // A coluna `produto` do registro manda; sem ela vale o nome gravado no relatório ("Serasa Premium" ou chave).
  const relatorio: RelatorioCredito = meta.produto
    ? { ...relatorioGravado, fonte: { ...relatorioGravado.fonte, produto: nomeDoProduto(meta.produto, relatorioGravado.fonte.provedor) } }
    : relatorioGravado;
  return renderizar(relatorio, { subject: `Análise de crédito ${formatarDocumento(relatorio.documento, relatorio.tipo)}` }, (p, agora) => {
    // o anexo é complementar: nunca derruba o PDF principal
    let anexo: Anexo | null = null;
    try { anexo = montarAnexo(bruto, { pessoaFisica: relatorio.tipo === 'CPF' }); } catch (e) {
      console.error('[credito] anexo do pdf falhou:', e instanceof Error ? e.message : 'erro');
    }
    const ctr = { omitidos: 0 };
    secaoResumo(p, relatorio, meta);
    secaoPontosDeAtencao(p, relatorio, agora, anexo?.avisos ?? []);
    secaoAnotacoes(p, relatorio, agora, anexo);
    secaoEmpresa(p, relatorio, bruto, agora);
    secaoSocios(p, relatorio);
    secaoConsultas(p, relatorio, bruto);
    secaoComportamento(p, relatorio, bruto, (parte) => desenharParte(p, parte, ctr));
    secaoFinal(p, meta.consultadoPor);
    if (anexo?.blocos.length) {
      try { secaoAnexo(p, anexo); } catch (e) {
        console.error('[credito] anexo do pdf falhou:', e instanceof Error ? e.message : 'erro');
      }
    }
  });
}
