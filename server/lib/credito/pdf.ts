// PDF do relatório de crédito ("Relatório de Análise de Crédito — Sal Vita").
// Layout PRÓPRIO da Sal Vita (azul #0C3680). Não usa nome, logo, cores-assinatura nem leiaute de bureau algum:
// o provedor aparece apenas no campo "Fonte dos dados".
//
// Biblioteca: pdfkit (JS puro, sem binário nativo nem Chromium). Importamos o build "browser" do pdfkit POR CAMINHO,
// de propósito: o build "node" carrega as métricas das fontes padrão (Helvetica) em tempo de execução com
// createRequire('#standard-fonts/...'), o que QUEBRA depois que o esbuild empacota api/bundle.js. O build "browser"
// traz as fontes embutidas no próprio arquivo e funciona igual em Node, no teste e no bundle serverless.
import type PDFDocumentCtor from 'pdfkit';
import type { GrupoAnotacao, RelatorioCredito, Veredito } from '../../../shared/credito';
import { ROTULO_VEREDITO, SEMAFORO, analisarSinais, atenuacaoDoItem, type NivelSinal } from '../../../shared/credito';
import { ROTULO_NIVEL_SINAL, ordenarSinais } from '../../../shared/creditoSinais';
import { nomeDoProduto } from '../../../shared/creditoCatalogo';
import { consultasPorMes, montarAnexo, registrosDaParte, type Anexo } from './pdfAnexo';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument: typeof PDFDocumentCtor = require('../../../node_modules/pdfkit/js/pdfkit.browser.js');

type Doc = InstanceType<typeof PDFDocumentCtor>;

const AZUL = '#0C3680';
const AZUL_CLARO = '#E8EEF8';
const TEXTO = '#1F2937';
const CINZA = '#6B7280';
const LINHA = '#D1D5DB';
const ZEBRA = '#F7F9FC';
const COR_SEMAFORO = { VERDE: '#1E8E3E', AMARELO: '#E0A100', VERMELHO: '#C62828' } as const;
const FUNDO_SEMAFORO = { VERDE: '#E6F4EA', AMARELO: '#FFF6DB', VERMELHO: '#FDE8E8' } as const;

const W = 595.28;
const H = 841.89;
const MX = 40;
const TOPO = 72; // abaixo do cabeçalho
const BASE = 56; // reserva do rodapé
const LARG = W - MX * 2;
const LIMITE_Y = H - BASE;
/** Teto de páginas do PDF inteiro: o anexo é cortado (com aviso) ao atingi-lo. */
export const MAX_PAGINAS_PDF = 80;

export const FAIXA_SIMULACAO = 'SIMULAÇÃO — DADOS FICTÍCIOS, NÃO USAR PARA DECISÃO';

// ---------- formatação pt-BR ----------
const FUSO = 'America/Sao_Paulo';

/** Mantém só o que a Helvetica (WinAnsi) desenha; o resto vira "?" para nunca sair lixo no PDF. */
export function limparTexto(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/[^\u0009\u000A -ÿ—•€]/g, '?');
}

const brl = (n: number | null): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (n: number | null): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';

function partesData(d: Date) {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { dia: g('day'), mes: g('month'), ano: g('year'), hora: g('hour'), min: g('minute') };
}

/** ISO (data ou data/hora) -> dd/mm/aaaa. Texto que não seja ISO é devolvido como veio. */
function dataBR(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(v);
  if (m) {
    // data pura (sem hora): não passa por fuso para não "voltar um dia"
    if (v.length === 10) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(v);
    if (Number.isFinite(d.getTime())) {
      const p = partesData(d);
      return `${p.dia}/${p.mes}/${p.ano}`;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return limparTexto(v);
}

function dataHoraBR(v: string): string {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return limparTexto(v);
  const p = partesData(d);
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.min}`;
}

export function formatarDocumento(doc: string, tipo: 'CNPJ' | 'CPF'): string {
  const d = (doc || '').replace(/\D/g, '');
  if (tipo === 'CNPJ' && d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (tipo === 'CPF' && d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '—';
}

/** CPF 11 dígitos -> ***.468.126-** (LGPD). CNPJ de sócio PJ aparece formatado inteiro. */
export function mascararDocumento(doc: string | null): string {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return formatarDocumento(d, 'CNPJ');
  return '***';
}

const txt = (s: string | null | undefined): string => {
  const v = limparTexto(s).trim();
  return v ? v : '—';
};

// ---------- tabela ----------
interface Celula { texto: string; cor?: string; negrito?: boolean }
interface Coluna { titulo: string; largura: number; alinhar?: 'left' | 'right' | 'center' }

/** Quebra palavras maiores que a largura da coluna (CNPJ colado, URL...) para nada vazar da margem. */
function quebrarLongas(doc: Doc, texto: string, largura: number): string {
  return texto
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok) || doc.widthOfString(tok) <= largura) return tok;
      let out = '';
      let atual = '';
      for (const ch of tok) {
        if (doc.widthOfString(atual + ch) > largura) { out += atual + '\n'; atual = ch; } else atual += ch;
      }
      return out + atual;
    })
    .join('');
}

class Pagina {
  y = TOPO;
  constructor(readonly doc: Doc) {}

  nova() { this.doc.addPage(); this.y = TOPO; }
  garantir(h: number) { if (this.y + h > LIMITE_Y) this.nova(); }

  titulo(t: string, maiusculas = true) {
    this.garantir(110); // título + cabeçalho + algumas linhas: nunca um título/tabela órfã no fim da página
    const { doc } = this;
    this.y += 8;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL).text(maiusculas ? limparTexto(t).toUpperCase() : limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 16;
    doc.moveTo(MX, this.y).lineTo(MX + LARG, this.y).lineWidth(1.2).strokeColor(AZUL).stroke();
    this.y += 8;
  }

  subtitulo(t: string) {
    this.garantir(50);
    this.doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXTO).text(limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 15;
  }

  paragrafo(t: string, opts: { cor?: string; tam?: number; negrito?: boolean } = {}) {
    const { doc } = this;
    const tam = opts.tam ?? 9;
    doc.font(opts.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam);
    const s = quebrarLongas(doc, limparTexto(t), LARG);
    const h = doc.heightOfString(s, { width: LARG });
    this.garantir(h + 4);
    doc.fillColor(opts.cor ?? TEXTO).text(s, MX, this.y, { width: LARG });
    this.y += h + 6;
  }

  /** Título de bloco do anexo (mantém a capitalização portuguesa, ao contrário de `titulo`). */
  bloco(t: string) {
    this.garantir(80);
    const { doc } = this;
    this.y += 6;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL).text(limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 14;
    doc.moveTo(MX, this.y).lineTo(MX + LARG, this.y).lineWidth(0.6).strokeColor(AZUL).stroke();
    this.y += 6;
  }

  /** O PDF já tem o máximo de páginas? (só o anexo consulta isto) */
  estourou(): boolean { return this.doc.bufferedPageRange().count >= MAX_PAGINAS_PDF; }

  /**
   * Desenha a tabela. `detalhes[i]` é uma linha de texto menor sob a linha i (campos extras da fonte).
   * Com `limitar`, para ao atingir o teto de páginas e devolve quantas linhas deixou de desenhar.
   */
  tabela(colunas: Coluna[], linhas: Celula[][], opts: { detalhes?: Array<string | undefined>; limitar?: boolean } = {}): number {
    const { doc } = this;
    const PAD = 4;
    const tam = 8.5;
    const total = colunas.reduce((a, c) => a + c.largura, 0);
    const escala = LARG / total;
    const cols = colunas.map((c) => ({ ...c, largura: c.largura * escala }));

    const cabecalho = () => {
      doc.font('Helvetica-Bold').fontSize(8);
      const titulos = cols.map((c) => quebrarLongas(doc, limparTexto(c.titulo), c.largura - PAD * 2));
      const hTexto = Math.max(...titulos.map((t, j) => doc.heightOfString(t, { width: cols[j].largura - PAD * 2 })));
      const h = Math.max(18, hTexto + 9);
      this.garantir(h + 22);
      doc.rect(MX, this.y, LARG, h).fill(AZUL);
      let x = MX;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      cols.forEach((c, j) => {
        doc.text(titulos[j], x + PAD, this.y + 5, { width: c.largura - PAD * 2, align: c.alinhar ?? 'left' });
        x += c.largura;
      });
      this.y += h;
    };

    cabecalho();
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      // mede cada célula já com as palavras longas quebradas
      const prep = linha.map((cel, j) => {
        const c = cols[j];
        doc.font(cel.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam);
        let s = quebrarLongas(doc, limparTexto(cel.texto) || '—', c.largura - PAD * 2);
        if (s.length > 900) s = s.slice(0, 897) + '...';
        const h = doc.heightOfString(s, { width: c.largura - PAD * 2 });
        return { s, h, cel, c };
      });
      let det = opts.detalhes?.[i] ? limparTexto(opts.detalhes[i]) : '';
      let alturaDet = 0;
      if (det) {
        doc.font('Helvetica').fontSize(7.5);
        det = quebrarLongas(doc, det.length > 900 ? det.slice(0, 897) + '...' : det, LARG - PAD * 2 - 8);
        alturaDet = doc.heightOfString(det, { width: LARG - PAD * 2 - 8 }) + 3;
      }
      const alturaLinha = Math.max(...prep.map((p) => p.h)) + PAD * 2 + alturaDet;
      if (this.y + alturaLinha > LIMITE_Y) {
        if (opts.limitar && this.estourou()) return linhas.length - i;
        this.nova();
        cabecalho();
      }
      if (i % 2 === 1) doc.rect(MX, this.y, LARG, alturaLinha).fill(ZEBRA);
      let x = MX;
      for (const p of prep) {
        doc.font(p.cel.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam).fillColor(p.cel.cor ?? TEXTO)
          .text(p.s, x + PAD, this.y + PAD, { width: p.c.largura - PAD * 2, align: p.c.alinhar ?? 'left' });
        x += p.c.largura;
      }
      if (det) {
        doc.font('Helvetica').fontSize(7.5).fillColor(CINZA)
          .text(det, MX + PAD + 8, this.y + alturaLinha - alturaDet - PAD + 3, { width: LARG - PAD * 2 - 8 });
      }
      doc.moveTo(MX, this.y + alturaLinha).lineTo(MX + LARG, this.y + alturaLinha).lineWidth(0.5).strokeColor(LINHA).stroke();
      this.y += alturaLinha;
    }
    this.y += 10;
    return 0;
  }
}

// ---------- seções ----------
function secaoResumo(p: Pagina, r: RelatorioCredito, meta: { veredito: Veredito; motivos: string[] }) {
  const { doc } = p;
  const sem = SEMAFORO[meta.veredito];
  const cor = COR_SEMAFORO[sem];

  // identificação
  doc.font('Helvetica-Bold').fontSize(15).fillColor(TEXTO)
    .text(txt(r.cadastro.razaoSocial ?? r.cadastro.nomeFantasia), MX, p.y, { width: LARG });
  p.y = doc.y + 2;
  doc.font('Helvetica').fontSize(10).fillColor(CINZA)
    .text(`${r.tipo}: ${formatarDocumento(r.documento, r.tipo)}   |   Consulta em ${dataHoraBR(r.consultadoEm)}`, MX, p.y, { width: LARG });
  p.y = doc.y + 10;

  // painel do veredito
  const motivos = meta.motivos.length ? meta.motivos : ['Nenhum fator de restrição encontrado nas regras da Sal Vita.'];
  doc.font('Helvetica').fontSize(9);
  const larguraTexto = LARG - 100;
  const alturaMotivos = motivos.reduce((a, m) => a + doc.heightOfString('•  ' + limparTexto(m), { width: larguraTexto }) + 2, 0);
  const alturaPainel = Math.max(86, 44 + alturaMotivos + 12);
  p.garantir(alturaPainel + 10);
  const y0 = p.y;
  doc.roundedRect(MX, y0, LARG, alturaPainel, 6).fill(FUNDO_SEMAFORO[sem]);
  doc.roundedRect(MX, y0, 5, alturaPainel, 2).fill(cor);

  // semáforo (3 luzes, só a do veredito acesa)
  const cx = MX + 38;
  const luzes: Array<['VERMELHO' | 'AMARELO' | 'VERDE', number]> = [['VERMELHO', 0], ['AMARELO', 1], ['VERDE', 2]];
  const alturaCaixa = 66;
  const topoCaixa = y0 + (alturaPainel - alturaCaixa) / 2;
  doc.roundedRect(cx - 14, topoCaixa, 28, alturaCaixa, 8).fill('#374151');
  for (const [nome, i] of luzes) {
    doc.circle(cx, topoCaixa + 12 + i * 21, 8).fill(nome === sem ? COR_SEMAFORO[nome] : '#6B7280');
  }

  const tx = MX + 76;
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('VEREDITO DE CRÉDITO', tx, y0 + 12, { width: larguraTexto, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(cor).text(limparTexto(ROTULO_VEREDITO[meta.veredito]), tx, y0 + 23, { width: larguraTexto, lineBreak: false });
  let ym = y0 + 52;
  doc.font('Helvetica').fontSize(9).fillColor(TEXTO);
  for (const m of motivos) {
    const t = '•  ' + limparTexto(m);
    doc.text(t, tx, ym, { width: larguraTexto });
    ym += doc.heightOfString(t, { width: larguraTexto }) + 2;
  }
  p.y = y0 + alturaPainel + 14;

  // score + régua 0-1000
  p.garantir(120);
  const sy = p.y;
  const v = r.score.valor;
  doc.roundedRect(MX, sy, 150, 84, 6).fill(AZUL_CLARO);
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('SCORE (0 A 1000)', MX + 10, sy + 9, { width: 130, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(v === null ? 14 : 38).fillColor(AZUL)
    .text(v === null ? 'Não informado' : String(v), MX + 10, sy + (v === null ? 30 : 22), { width: 130, lineBreak: false });
  if (r.score.faixa) {
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO).text(`Faixa: ${txt(r.score.faixa)}`, MX + 10, sy + 66, { width: 130, lineBreak: false });
  }

  const rx = MX + 170;
  const rw = LARG - 170;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXTO).text('Probabilidade de inadimplência', rx, sy + 4, { width: rw, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text(pct(r.score.probabilidadeInadimplencia), rx, sy + 17, { width: rw, lineBreak: false });
  const by = sy + 52;
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
  p.y = sy + 96;

  if (r.score.textoInterpretacao) {
    p.paragrafo('Interpretação da fonte: ' + r.score.textoInterpretacao, { cor: CINZA, tam: 8.5 });
  }
}

const GRUPOS: Array<[keyof RelatorioCredito['anotacoes'], string]> = [
  ['protestos', 'Protestos'],
  ['pendenciasFinanceiras', 'Pendências financeiras (PEFIN/REFIN)'],
  ['chequesSemFundo', 'Cheques sem fundo'],
  ['acoesJudiciais', 'Ações judiciais'],
  ['falenciaRecuperacao', 'Falência / Recuperação judicial'],
];

function situacao(g: GrupoAnotacao): Celula {
  if (!g.consultado) return { texto: 'Não informado pela fonte', cor: CINZA };
  if (g.quantidade > 0) return { texto: 'Consta', cor: COR_SEMAFORO.VERMELHO, negrito: true };
  return { texto: 'Nada consta', cor: COR_SEMAFORO.VERDE, negrito: true };
}

function secaoAnotacoes(p: Pagina, r: RelatorioCredito, agora: Date) {
  p.titulo('Anotações negativas');
  p.tabela(
    [
      { titulo: 'Item', largura: 200 },
      { titulo: 'Quantidade', largura: 70, alinhar: 'right' },
      { titulo: 'Valor total', largura: 100, alinhar: 'right' },
      { titulo: 'Situação', largura: 145 },
    ],
    GRUPOS.map(([k, nome]) => {
      const g = r.anotacoes[k];
      return [
        { texto: nome, negrito: true },
        { texto: g.consultado ? String(g.quantidade) : '—' },
        { texto: g.consultado && g.quantidade > 0 ? brl(g.valorTotal) : '—' },
        situacao(g),
      ];
    }),
  );

  const comItens = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && (r.anotacoes[k].itens.length > 0 || r.anotacoes[k].quantidade > 0));
  if (comItens.length) {
    p.titulo('Detalhamento das anotações');
    for (const [k, nome] of comItens) {
      const g = r.anotacoes[k];
      p.subtitulo(`${nome} - ${g.quantidade} ocorrência(s)${g.valorTotal !== null ? ', total ' + brl(g.valorTotal) : ''}`);
      if (g.itens.length < g.quantidade) {
        p.paragrafo(`A fonte listou ${g.itens.length} de ${g.quantidade} ocorrências.`, { cor: '#B45309', tam: 8.5, negrito: true });
      }
      if (!g.itens.length) continue;
      const comCredor = g.itens.some((it) => !!it.credor);
      const obs = g.itens.map((it) => atenuacaoDoItem(it, agora));
      const comObs = obs.some((o) => !!o);
      const colunas: Coluna[] = [{ titulo: 'Data', largura: 58 }, { titulo: 'Descrição', largura: comCredor || comObs ? 150 : 223 }];
      if (comCredor) colunas.push({ titulo: 'Credor', largura: 100 });
      colunas.push({ titulo: 'Local', largura: comCredor || comObs ? 100 : 130 });
      if (comObs) colunas.push({ titulo: 'Observação', largura: 80 });
      colunas.push({ titulo: 'Valor', largura: 80, alinhar: 'right' });
      p.tabela(
        colunas,
        g.itens.map((it, i) => {
          const linha: Celula[] = [{ texto: dataBR(it.data) }, { texto: txt(it.descricao) }];
          if (comCredor) linha.push({ texto: txt(it.credor) });
          linha.push({ texto: txt(it.local) });
          if (comObs) linha.push({ texto: obs[i] ? `Estudar com calma: ${obs[i]}` : '—', cor: obs[i] ? COR_SEMAFORO.AMARELO : CINZA });
          linha.push({ texto: brl(it.valor) });
          return linha;
        }),
        {
          detalhes: g.itens.map((it) => it.extras && Object.keys(it.extras).length
            ? Object.entries(it.extras).map(([ch, v]) => `${ch}: ${v}`).join('   |   ') : undefined),
        },
      );
    }
  }
}

const COR_NIVEL: Record<NivelSinal, string> = { ALERTA: COR_SEMAFORO.VERMELHO, ATENCAO: '#B45309', POSITIVO: COR_SEMAFORO.VERDE };

function secaoPontosDeAtencao(p: Pagina, r: RelatorioCredito, agora: Date) {
  const sinais = ordenarSinais(analisarSinais(r, agora));
  p.titulo('Pontos de atenção');
  if (!sinais.length) { p.paragrafo('Nenhum ponto de atenção identificado pelas regras da Sal Vita.', { cor: CINZA }); return; }
  p.tabela(
    [{ titulo: 'Nível', largura: 60 }, { titulo: 'Ponto', largura: 190 }, { titulo: 'Detalhe', largura: 265 }],
    sinais.map((s) => [
      { texto: ROTULO_NIVEL_SINAL[s.nivel].toUpperCase(), cor: COR_NIVEL[s.nivel], negrito: true },
      { texto: s.titulo, negrito: true },
      { texto: s.detalhe },
    ]),
  );
}

function secaoMovimentacao(p: Pagina, r: RelatorioCredito) {
  const c = r.comportamento;
  if (!c) return;
  p.titulo('Movimentação comercial');
  p.tabela(
    [{ titulo: 'Campo', largura: 200 }, { titulo: 'Informação', largura: 315 }],
    ([
      ['Última compra no mercado', dataBR(c.ultimaCompraEm)],
      ['Relacionamento comercial mais antigo', dataBR(c.relacionamentoMaisAntigoEm)],
      ['Fornecedores que informaram', c.fontesConsultadas === null ? '—' : String(c.fontesConsultadas)],
      ['Pagamentos em dia', pct(c.pagamentoPontualPct)],
    ] as Array<[string, string]>).map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]),
  );
}

function secaoComplementos(p: Pagina, r: RelatorioCredito) {
  const c = r.complementos;
  if (!c) return;
  p.titulo('Complementos da fonte');
  const veic = c.veiculos?.length ? c.veiculos.map((v) => [v.marcaModelo, v.placa].filter(Boolean).join(' ')).join('; ') : '—';
  p.tabela(
    [{ titulo: 'Campo', largura: 200 }, { titulo: 'Informação', largura: 315 }],
    ([
      ['Faturamento presumido (faixa)', txt(c.faturamentoPresumidoFaixa)],
      ['Consultas nos últimos 12 meses', c.consultas12Meses == null ? '—' : String(c.consultas12Meses)],
      ['Veículos da empresa', veic],
    ] as Array<[string, string]>).map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]),
  );
}

function secaoCadastro(p: Pagina, r: RelatorioCredito) {
  const c = r.cadastro;
  p.titulo('Dados cadastrais');
  const pares: Array<[string, string]> = [
    ['Razão social', txt(c.razaoSocial)],
    ['Nome fantasia', txt(c.nomeFantasia)],
    [r.tipo, formatarDocumento(r.documento, r.tipo)],
    ['Situação cadastral', txt(c.situacao)],
    ['Situação em', dataBR(c.situacaoEm)],
    ['Fundação', dataBR(c.fundacao)],
    ['Natureza jurídica', txt(c.naturezaJuridica)],
    ['Capital social', c.capitalSocial === null ? '—' : brl(c.capitalSocial)],
    ['CNAE principal', txt(c.cnaePrincipal)],
    ['Atividade', txt(c.atividade)],
    ['Opção tributária', txt(c.opcaoTributaria)],
    ['Inscrição estadual', txt(c.inscricaoEstadual)],
    ['Endereço', txt(c.endereco)],
    ['Município', txt(c.municipio)],
    ['UF', txt(c.uf)],
    ['Telefone', txt(c.telefone)],
    ['Número de filiais', c.numeroFiliais === null ? '—' : String(c.numeroFiliais)],
  ];
  p.tabela(
    [{ titulo: 'Campo', largura: 150 }, { titulo: 'Informação', largura: 365 }],
    pares.map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]),
  );
}

function secaoSocios(p: Pagina, r: RelatorioCredito) {
  p.titulo('Quadro societário e administradores');
  if (!r.socios.length) { p.paragrafo('Nenhum sócio ou administrador informado pela fonte.', { cor: CINZA }); return; }
  p.tabela(
    [
      { titulo: 'Nome', largura: 170 },
      { titulo: 'CPF/CNPJ', largura: 95 },
      { titulo: 'Cargo', largura: 105 },
      { titulo: 'Entrada', largura: 65 },
      { titulo: 'Particip.', largura: 55, alinhar: 'right' },
    ],
    r.socios.map((s) => [
      { texto: txt(s.nome) },
      { texto: mascararDocumento(s.documento) },
      { texto: txt(s.cargo) },
      { texto: dataBR(s.entrada) },
      { texto: pct(s.participacao), },
    ]),
  );
}

function secaoConsultas(p: Pagina, r: RelatorioCredito, bruto: unknown) {
  p.titulo('Consultas recentes ao documento');
  if (!r.consultasRecentes.length) p.paragrafo('Nenhuma consulta recente informada pela fonte.', { cor: CINZA });
  else {
    const total = r.complementos?.consultas12Meses;
    if (typeof total === 'number' && total > r.consultasRecentes.length) {
      p.paragrafo(`A fonte listou ${r.consultasRecentes.length} de ${total} consultas.`, { cor: '#B45309', tam: 8.5, negrito: true });
    }
    p.tabela(
      [
        { titulo: 'Data', largura: 80 },
        { titulo: 'Consultante', largura: 345 },
        { titulo: 'Quantidade', largura: 90, alinhar: 'right' },
      ],
      r.consultasRecentes.map((c) => [{ texto: dataBR(c.data) }, { texto: txt(c.consultante) }, { texto: String(c.quantidade) }]),
    );
  }
  const mensal = consultasPorMes(bruto);
  if (mensal) {
    p.subtitulo('Consultas por mês');
    p.tabela(
      mensal.colunas.map((titulo, i) => ({ titulo, largura: i === 0 ? 44 : 38, alinhar: i === 0 ? 'left' as const : 'right' as const })),
      mensal.linhas.map((l) => l.map((texto, i) => ({ texto, negrito: i === 0 }))),
    );
  }
}

// ---------- anexo: resposta completa do provedor ----------
function secaoAnexo(p: Pagina, anexo: Anexo) {
  p.nova();
  p.titulo('Anexo — Dados completos da resposta do provedor', false);
  p.paragrafo(
    'Reprodução automática de tudo o que o provedor devolveu nesta consulta, bloco a bloco. Campos vazios são omitidos, ' +
    'CPF aparece mascarado e telefone/e-mail de pessoa física, parcialmente. As seções anteriores resumem apenas parte destes dados.',
    { cor: CINZA, tam: 8.5 },
  );
  if (anexo.entregues.length) p.paragrafo('Blocos entregues pela fonte: ' + anexo.entregues.join(', '), { tam: 8.5 });
  if (anexo.parametros.length) {
    p.subtitulo('Parâmetros da consulta');
    p.tabela([{ titulo: 'Campo', largura: 150 }, { titulo: 'Valor', largura: 365 }], anexo.parametros.map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]));
  }

  let omitidos = 0;
  for (const bloco of anexo.blocos) {
    if (p.estourou()) { omitidos += bloco.partes.reduce((a, parte) => a + registrosDaParte(parte), 0); continue; }
    try {
      p.bloco(bloco.titulo);
      if (!bloco.partes.length) { p.paragrafo('Bloco sem informações preenchidas.', { cor: CINZA, tam: 8.5 }); continue; }
      for (const parte of bloco.partes) {
        if (p.estourou()) { omitidos += registrosDaParte(parte); continue; }
        switch (parte.t) {
          case 'sub': p.subtitulo(parte.texto); break;
          case 'aviso': p.paragrafo(parte.texto, { cor: COR_SEMAFORO.VERMELHO, tam: 8.5 }); break;
          case 'campos':
            omitidos += p.tabela([{ titulo: 'Campo', largura: 150 }, { titulo: 'Valor', largura: 365 }],
              parte.pares.map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]), { limitar: true });
            break;
          case 'tabela': {
            if (parte.continuacao) p.paragrafo('(continuação: demais colunas dos mesmos registros)', { cor: CINZA, tam: 7.5 });
            const falt = p.tabela(parte.colunas.map((titulo, i) => ({ titulo, largura: parte.pesos[i] })),
              parte.linhas.map((l) => l.map((texto, i) => ({ texto, negrito: i === 0 && parte.colunas.length > 2 }))), { limitar: true });
            if (!parte.continuacao) omitidos += falt;
            break;
          }
          case 'lista':
            for (let i = 0; i < parte.itens.length; i++) {
              if (p.estourou()) { omitidos += parte.itens.length - i; break; }
              p.paragrafo('•  ' + parte.itens[i], { tam: 8.5 });
            }
            break;
        }
      }
    } catch {
      p.paragrafo('Bloco não renderizado.', { cor: COR_SEMAFORO.VERMELHO, tam: 8.5 });
    }
  }
  if (omitidos > 0) {
    p.paragrafo(`Anexo truncado: ${omitidos} registros omitidos (limite de ${MAX_PAGINAS_PDF} páginas no PDF).`, { cor: COR_SEMAFORO.VERMELHO, negrito: true, tam: 9 });
  }
  if (anexo.linkOriginal) p.paragrafo('PDF original do provedor: ' + anexo.linkOriginal, { tam: 8.5 });
}

function secaoFinal(p: Pagina, consultadoPor: string | null) {
  const { doc } = p;
  const texto =
    'Documento confidencial, de uso interno da Sal Vita, destinado exclusivamente à análise de concessão de crédito. ' +
    'As informações têm origem na fonte indicada neste relatório e refletem a situação na data e hora da consulta; ' +
    'não constituem garantia de pagamento. A decisão de conceder ou negar crédito é da Sal Vita, que pode considerar ' +
    'também outros elementos. Proibida a divulgação ou o repasse a terceiros (LGPD - Lei 13.709/2018).';
  doc.font('Helvetica').fontSize(8.5);
  const h = doc.heightOfString(texto, { width: LARG - 20 }) + 46;
  p.garantir(h + 10);
  const y0 = p.y + 6;
  doc.roundedRect(MX, y0, LARG, h, 5).fill(AZUL_CLARO);
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO).text(texto, MX + 10, y0 + 10, { width: LARG - 20 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL)
    .text(`Consultado por ${limparTexto(consultadoPor) || 'usuário não identificado'}`, MX + 10, y0 + h - 22, { width: LARG - 20, lineBreak: false });
  p.y = y0 + h + 6;
}

/** Nome do provedor/produto para o cabeçalho: nunca expõe o nome interno do provedor nem marca de bureau. */
function fonteDosDados(r: RelatorioCredito): string {
  const provedor = r.fonte.provedor === 'boavista_apifull' ? 'API Full' : r.fonte.provedor === 'simulado' ? 'Simulado' : r.fonte.provedor;
  return `${limparTexto(provedor)}/${limparTexto(nomeDoProduto(r.fonte.produto, r.fonte.provedor))}`;
}

function cabecalhoRodape(doc: Doc, r: RelatorioCredito, i: number, total: number) {
  // escreve dentro da margem inferior sem disparar quebra automática de página
  const margens = doc.page.margins;
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

  doc.rect(0, 0, W, 44).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
    .text('Relatório de Análise de Crédito — Sal Vita', MX, 12, { width: 360, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#DCE6F7')
    .text(`Fonte dos dados: ${fonteDosDados(r)}`, MX, 29, { width: 360, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#FFFFFF')
    .text(`Consulta: ${dataHoraBR(r.consultadoEm)}`, W - MX - 170, 14, { width: 170, align: 'right', lineBreak: false });
  doc.text(`${r.tipo} ${formatarDocumento(r.documento, r.tipo)}`, W - MX - 170, 28, { width: 170, align: 'right', lineBreak: false });

  if (r.fonte.provedor === 'simulado') {
    // Faixa em TODAS as páginas, logo abaixo do cabeçalho azul (a área útil começa em TOPO=72).
    doc.rect(0, 44, W, 22).fill(COR_SEMAFORO.VERMELHO);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
      .text(FAIXA_SIMULACAO, MX, 51, { width: LARG, align: 'center', lineBreak: false });
  }

  const fy = H - 38;
  doc.moveTo(MX, fy).lineTo(W - MX, fy).lineWidth(0.5).strokeColor(LINHA).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(CINZA)
    .text('Confidencial — uso interno da Sal Vita para decisão de crédito', MX, fy + 6, { width: 380, lineBreak: false });
  doc.text(`Página ${i + 1} de ${total}`, W - MX - 100, fy + 6, { width: 100, align: 'right', lineBreak: false });
  doc.text(`Consulta em ${dataHoraBR(r.consultadoEm)}`, MX, fy + 17, { width: 380, lineBreak: false });

  doc.page.margins = margens;
}

export async function gerarPdfCredito(
  relatorio: RelatorioCredito,
  meta: { veredito: Veredito; motivos: string[]; consultadoPor: string | null },
  /** Resposta crua do provedor (credit_reports.payload_bruto). Sem ela (ex.: simulado) não há anexo. */
  bruto?: unknown,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: TOPO, bottom: BASE, left: MX, right: MX },
    bufferPages: true,
    // Só os testes desligam a compressão, para conferir o texto do PDF sem decodificar.
    compress: process.env.CREDITO_PDF_SEM_COMPRESSAO !== '1',
    info: {
      Title: 'Relatório de Análise de Crédito — Sal Vita',
      Author: 'Sal Vita',
      Subject: `Análise de crédito ${formatarDocumento(relatorio.documento, relatorio.tipo)}`,
      Keywords: 'confidencial',
    },
  });

  const partes: Buffer[] = [];
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  try {
    const p = new Pagina(doc);
    const dataConsulta = new Date(relatorio.consultadoEm);
    const agora = Number.isFinite(dataConsulta.getTime()) ? dataConsulta : new Date();
    secaoResumo(p, relatorio, meta);
    secaoPontosDeAtencao(p, relatorio, agora);
    secaoAnotacoes(p, relatorio, agora);
    secaoCadastro(p, relatorio);
    secaoMovimentacao(p, relatorio);
    secaoComplementos(p, relatorio);
    secaoSocios(p, relatorio);
    secaoConsultas(p, relatorio, bruto);
    secaoFinal(p, meta.consultadoPor);
    try {
      const anexo = montarAnexo(bruto, { pessoaFisica: relatorio.tipo === 'CPF' });
      if (anexo) secaoAnexo(p, anexo);
    } catch (e) {
      // o anexo é complementar: nunca derruba o PDF principal
      console.error('[credito] anexo do pdf falhou:', e instanceof Error ? e.message : 'erro');
    }

    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(start + i);
      cabecalhoRodape(doc, relatorio, i, count);
    }
    doc.end();
  } catch (e) {
    doc.end();
    await pronto.catch(() => undefined);
    throw e;
  }
  return pronto;
}
