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
import type PDFDocumentCtor from 'pdfkit';
import type { RelatorioCredito, Veredito } from '../../../shared/credito';
import { ROTULO_VEREDITO, SEMAFORO, analisarSinais, atenuacaoDoItem, type NivelSinal } from '../../../shared/credito';
import { ROTULO_NIVEL_SINAL, ordenarSinais } from '../../../shared/creditoSinais';
import { naturezaJuridicaTexto } from '../../../shared/creditoRotulos';
import { nomeDoProduto } from '../../../shared/creditoCatalogo';
import { comportamentoDe, consultasPorMes, empresaExtrasDe, montarAnexo, registrosDaParte, type Anexo, type Parte } from './pdfAnexo';

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
const TOPO = 40; // sem cabeçalho azul (o título e os dados do documento estão no corpo da 1ª página)
const TOPO_SIMULADO = 40;
const BASE = 50; // reserva do rodapé
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
    this.garantir(90); // título + cabeçalho + algumas linhas: nunca um título/tabela órfã no fim da página
    const { doc } = this;
    this.y += 6;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(AZUL).text(maiusculas ? limparTexto(t).toUpperCase() : limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 14;
    doc.moveTo(MX, this.y).lineTo(MX + LARG, this.y).lineWidth(1.2).strokeColor(AZUL).stroke();
    this.y += 6;
  }

  subtitulo(t: string) {
    this.garantir(46);
    this.doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXTO).text(limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 13;
  }

  paragrafo(t: string, opts: { cor?: string; tam?: number; negrito?: boolean } = {}) {
    const { doc } = this;
    const tam = opts.tam ?? 9;
    doc.font(opts.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam);
    const s = quebrarLongas(doc, limparTexto(t), LARG);
    const h = doc.heightOfString(s, { width: LARG });
    this.garantir(h + 4);
    doc.fillColor(opts.cor ?? TEXTO).text(s, MX, this.y, { width: LARG });
    this.y += h + 4;
  }

  /** Título de bloco do anexo (mantém a capitalização portuguesa, ao contrário de `titulo`). */
  bloco(t: string) {
    this.garantir(70);
    const { doc } = this;
    this.y += 4;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(AZUL).text(limparTexto(t), MX, this.y, { width: LARG, lineBreak: false });
    this.y += 13;
    doc.moveTo(MX, this.y).lineTo(MX + LARG, this.y).lineWidth(0.6).strokeColor(AZUL).stroke();
    this.y += 5;
  }

  /** O PDF já tem o máximo de páginas? (só o anexo consulta isto) */
  estourou(): boolean { return this.doc.bufferedPageRange().count >= MAX_PAGINAS_PDF; }

  /** Pares rótulo/valor em DUAS colunas (campo `largo` ocupa a linha inteira). Campo sem valor nem chega aqui. */
  pares(titulo: string, campos: Array<{ k: string; v: string; largo?: boolean }>) {
    const { doc } = this;
    const ROT = 88;
    const GAP = 14;
    const col = (LARG - GAP) / 2;
    type Campo = { k: string; v: string };
    const medir = (c: Campo, larg: number) => {
      doc.font('Helvetica-Bold').fontSize(7.5);
      const k = quebrarLongas(doc, limparTexto(c.k), ROT - 6);
      const hk = doc.heightOfString(k, { width: ROT - 6 });
      doc.font('Helvetica').fontSize(8.5);
      const v = quebrarLongas(doc, limparTexto(c.v), larg - ROT);
      return { k, v, h: Math.max(hk, doc.heightOfString(v, { width: larg - ROT })) + 3 };
    };
    const linhas: Array<{ cs: Campo[]; largo: boolean }> = [];
    let aberta: { cs: Campo[]; largo: boolean } | null = null;
    for (const c of campos) {
      if (c.largo) { aberta = null; linhas.push({ cs: [c], largo: true }); continue; }
      if (!aberta) { aberta = { cs: [], largo: false }; linhas.push(aberta); }
      aberta.cs.push(c);
      if (aberta.cs.length === 2) aberta = null;
    }
    const medidas = linhas.map((l) => {
      const ms = l.cs.map((c) => medir(c, l.largo ? LARG : col));
      return { ms, h: Math.max(...ms.map((m) => m.h)), larg: l.largo ? LARG : col };
    });
    // o bloco é curto: título e todos os campos juntos na mesma página
    this.garantir(40 + medidas.reduce((a, m) => a + m.h, 0));
    this.titulo(titulo);
    medidas.forEach(({ ms, h, larg }) => {
      this.garantir(h + 2);
      ms.forEach((m, j) => {
        const x = MX + j * (col + GAP);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(CINZA).text(m.k, x + 2, this.y + 1, { width: ROT - 6 });
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO).text(m.v, x + ROT, this.y, { width: larg - ROT });
      });
      this.y += h;
    });
    this.y += 6;
  }

  /**
   * Desenha a tabela. `detalhes[i]` é uma linha de texto menor sob a linha i (campos extras da fonte).
   * Com `limitar`, para ao atingir o teto de páginas e devolve quantas linhas deixou de desenhar.
   */
  tabela(colunas: Coluna[], linhas: Celula[][], opts: { detalhes?: Array<string | undefined>; limitar?: boolean; semCabecalho?: boolean; compacta?: boolean } = {}): number {
    const { doc } = this;
    const PAD = opts.compacta ? 2 : 3; // matriz mensal: 12 colunas estreitas
    const tam = opts.compacta ? 8 : 8;
    const tamCab = opts.compacta ? 7 : 7.5;
    const total = colunas.reduce((a, c) => a + c.largura, 0);
    const escala = LARG / total;
    const cols = colunas.map((c) => ({ ...c, largura: c.largura * escala }));

    const cabecalho = () => {
      doc.font('Helvetica-Bold').fontSize(tamCab);
      const titulos = cols.map((c) => quebrarLongas(doc, limparTexto(c.titulo), c.largura - PAD * 2));
      const hTexto = Math.max(...titulos.map((t, j) => doc.heightOfString(t, { width: cols[j].largura - PAD * 2 })));
      const h = Math.max(15, hTexto + 7);
      this.garantir(h + 22);
      doc.rect(MX, this.y, LARG, h).fill(AZUL);
      let x = MX;
      doc.font('Helvetica-Bold').fontSize(tamCab).fillColor('#FFFFFF');
      cols.forEach((c, j) => {
        doc.text(titulos[j], x + PAD, this.y + 4, { width: c.largura - PAD * 2, align: c.alinhar ?? 'left' });
        x += c.largura;
      });
      this.y += h;
    };

    if (!opts.semCabecalho) cabecalho();
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
        doc.font('Helvetica').fontSize(7);
        det = quebrarLongas(doc, det.length > 900 ? det.slice(0, 897) + '...' : det, LARG - PAD * 2 - 8);
        alturaDet = doc.heightOfString(det, { width: LARG - PAD * 2 - 8 }) + 2;
      }
      const alturaLinha = Math.max(...prep.map((p) => p.h)) + PAD * 2 + alturaDet;
      // na última página permitida sobra espaço para o aviso de truncamento (senão ele abriria a página 81)
      const reserva = opts.limitar && this.estourou() ? 34 : 0;
      if (this.y + alturaLinha > LIMITE_Y - reserva) {
        if (opts.limitar && this.estourou()) return linhas.length - i;
        this.nova();
        if (!opts.semCabecalho) cabecalho();
      }
      if (i % 2 === 1) doc.rect(MX, this.y, LARG, alturaLinha).fill(ZEBRA);
      let x = MX;
      for (const p of prep) {
        doc.font(p.cel.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam).fillColor(p.cel.cor ?? TEXTO)
          .text(p.s, x + PAD, this.y + PAD, { width: p.c.largura - PAD * 2, align: p.c.alinhar ?? 'left' });
        x += p.c.largura;
      }
      if (det) {
        doc.font('Helvetica').fontSize(7).fillColor(CINZA)
          .text(det, MX + PAD + 8, this.y + alturaLinha - alturaDet - PAD + 2, { width: LARG - PAD * 2 - 8 });
      }
      doc.moveTo(MX, this.y + alturaLinha).lineTo(MX + LARG, this.y + alturaLinha).lineWidth(0.5).strokeColor(LINHA).stroke();
      this.y += alturaLinha;
    }
    this.y += 8;
    return 0;
  }
}

const ACENTO_FRASE: Record<string, string> = { provavel: 'provável', debitos: 'débitos', proximos: 'próximos', ate: 'até', nao: 'não', e: 'é' };
/** Texto todo em MAIÚSCULAS (como a fonte manda) vira frase normal: minúsculas, 1ª letra maiúscula, acentos comuns. */
export function frasePelaFonte(t: string | null | undefined): string {
  // A fonte às vezes cola o número na palavra seguinte ("QUE 13APRESENTEM"): separa dígito e letra.
  const s = (t ?? '').replace(/(\d)([A-Za-zÀ-ú])/g, '$1 $2').trim();
  const letras = s.replace(/[^A-Za-zÀ-ú]/g, '');
  if (letras.length < 8 || letras !== letras.toUpperCase()) return s;
  const palavras = s.toLowerCase().split(/(\s+)/).map((w) => ACENTO_FRASE[w] ?? w);
  const f = palavras.join('');
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** Resume o texto da fonte numa linha curta: espaços normalizados, corte na última frase/palavra, "..." no fim. */
export function resumirTexto(t: string | null | undefined, max = 130): string {
  const s = limparTexto(t).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const frase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('; '));
  if (frase > 20) return corte.slice(0, frase + 1);
  const palavra = corte.lastIndexOf(' ');
  return corte.slice(0, palavra > max * 0.5 ? palavra : max).replace(/[\s,;:.-]+$/, '') + '...';
}

/** Linha de texto dentro do corpo: "Rótulo: valor", sem campo vazio. */
const ok = (v: string | null | undefined): v is string => !!v && v.trim() !== '' && v.trim() !== '—';

// ---------- seções ----------
/** 1 (topo da 1ª página, uma vez só) e 2 (veredito, motivos, score com régua). */
function secaoResumo(p: Pagina, r: RelatorioCredito, meta: { veredito: Veredito; motivos: string[] }) {
  const { doc } = p;
  const sem = SEMAFORO[meta.veredito];
  const cor = COR_SEMAFORO[sem];

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

  // painel do veredito
  const motivos = meta.motivos.length ? meta.motivos : ['Nenhum fator de restrição encontrado nas regras da Sal Vita.'];
  doc.font('Helvetica').fontSize(9);
  const larguraTexto = LARG - 100;
  const alturaMotivos = motivos.reduce((a, m) => a + doc.heightOfString('•  ' + limparTexto(m), { width: larguraTexto }) + 2, 0);
  const alturaPainel = Math.max(78, 42 + alturaMotivos + 8);
  p.garantir(alturaPainel + 10);
  const y0 = p.y;
  doc.roundedRect(MX, y0, LARG, alturaPainel, 6).fill(FUNDO_SEMAFORO[sem]);
  doc.roundedRect(MX, y0, 5, alturaPainel, 2).fill(cor);

  // semáforo (3 luzes, só a do veredito acesa)
  const cx = MX + 38;
  const luzes: Array<['VERMELHO' | 'AMARELO' | 'VERDE', number]> = [['VERMELHO', 0], ['AMARELO', 1], ['VERDE', 2]];
  const alturaCaixa = 62;
  const topoCaixa = y0 + (alturaPainel - alturaCaixa) / 2;
  doc.roundedRect(cx - 13, topoCaixa, 26, alturaCaixa, 8).fill('#374151');
  for (const [nomeLuz, i] of luzes) {
    doc.circle(cx, topoCaixa + 11 + i * 20, 7.5).fill(nomeLuz === sem ? COR_SEMAFORO[nomeLuz] : '#6B7280');
  }

  const tx = MX + 76;
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('VEREDITO DE CRÉDITO', tx, y0 + 10, { width: larguraTexto, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(19).fillColor(cor).text(limparTexto(ROTULO_VEREDITO[meta.veredito]), tx, y0 + 21, { width: larguraTexto, lineBreak: false });
  let ym = y0 + 47;
  doc.font('Helvetica').fontSize(9).fillColor(TEXTO);
  for (const m of motivos) {
    const t = '•  ' + limparTexto(m);
    doc.text(t, tx, ym, { width: larguraTexto });
    ym += doc.heightOfString(t, { width: larguraTexto }) + 2;
  }
  p.y = y0 + alturaPainel + 10;

  // score + régua 0-1000
  p.garantir(100);
  const sy = p.y;
  const v = r.score.valor;
  doc.roundedRect(MX, sy, 150, 76, 6).fill(AZUL_CLARO);
  doc.font('Helvetica').fontSize(8).fillColor(CINZA).text('SCORE (0 A 1000)', MX + 10, sy + 8, { width: 130, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(v === null ? 14 : 34).fillColor(AZUL)
    .text(v === null ? 'Não informado' : String(v), MX + 10, sy + (v === null ? 28 : 20), { width: 130, lineBreak: false });
  if (r.score.faixa) {
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO).text(`Faixa: ${txt(r.score.faixa)}`, MX + 10, sy + 60, { width: 130, lineBreak: false });
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
}

const COR_NIVEL: Record<NivelSinal, string> = { ALERTA: COR_SEMAFORO.VERMELHO, ATENCAO: '#B45309', POSITIVO: COR_SEMAFORO.VERDE };

function secaoPontosDeAtencao(p: Pagina, r: RelatorioCredito, agora: Date, avisos: string[]) {
  const sinais = ordenarSinais(analisarSinais(r, agora));
  p.titulo('Pontos de atenção');
  if (!sinais.length) p.paragrafo('Nenhum ponto de atenção identificado pelas regras da Sal Vita.', { cor: CINZA });
  else {
    p.tabela(
      [{ titulo: 'Nível', largura: 56 }, { titulo: 'Ponto', largura: 190 }, { titulo: 'Detalhe', largura: 269 }],
      sinais.map((s) => [
        { texto: ROTULO_NIVEL_SINAL[s.nivel].toUpperCase(), cor: COR_NIVEL[s.nivel], negrito: true },
        { texto: s.titulo, negrito: true },
        { texto: s.detalhe },
      ]),
    );
  }
  // a fonte devolveu algum bloco com status diferente de sucesso: o dado pode estar incompleto
  for (const a of avisos) p.paragrafo(`Atenção: consulta da fonte sem sucesso em ${a}`, { cor: COR_SEMAFORO.VERMELHO, tam: 8.5, negrito: true });
}

// ---------- 3. anotações negativas ----------
type ChaveGrupo = keyof RelatorioCredito['anotacoes'];
const GRUPOS: Array<[ChaveGrupo, string, RegExp | null, RegExp | null]> = [
  // [chave, nome, remoção do substantivo na descrição, blocos do bruto que representam o grupo]
  ['protestos', 'Protestos', /^Protesto(?:\s+d[eao]s?)?\s*(?:—|-|:)?\s*/i, /^Protestos/],
  ['pendenciasFinanceiras', 'Pendências financeiras (PEFIN/REFIN)', null, /^(?:Pend[êe]ncias|Restri[çc][õo]es)/],
  ['chequesSemFundo', 'Cheques sem fundo', /^Cheque sem fundo\s*(?:—|-|:)?\s*/i, /^Cheques/],
  ['acoesJudiciais', 'Ações judiciais', /^A[çc][ãa]o c[íi]vel\s*(?:—|-|:)?\s*/i, /^A[çc][õo]es/],
  ['falenciaRecuperacao', 'Falência / Recuperação judicial', null, null],
];

const maiuscula1 = (t: string) => t.replace(/^./, (c) => c.toUpperCase());
/** Tira da descrição o substantivo que o subtítulo do grupo já diz ("Protesto — Duplicata" -> "Duplicata"). */
function descricaoLimpa(d: string, remover: RegExp | null): string {
  let s = limparTexto(d).trim();
  if (remover) s = s.replace(remover, '').trim();
  s = s.replace(/^\((.*)\)$/, '$1').trim();
  return s ? maiuscula1(s) : '';
}
const norm = (t: string) => limparTexto(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

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
    const g = r.anotacoes[k];
    p.y += 3;
    p.subtitulo(nome.replace(/ \(.*\)$/, ''));
    if (g.itens.length < g.quantidade) {
      p.paragrafo(`A fonte listou ${g.itens.length} de ${g.quantidade} ocorrências${g.itens.length === 0 ? ' (sem detalhamento)' : ''}.`, { cor: '#B45309', tam: 8.5, negrito: true });
    }
    if (!g.itens.length) continue;

    const linhas = g.itens.map((it) => ({
      data: it.data ? dataBR(it.data) : '',
      desc: descricaoLimpa(it.descricao, remover),
      credor: limparTexto(it.credor).trim(),
      local: limparTexto(it.local).trim(),
      obs: atenuacaoDoItem(it, agora) ?? '',
      valor: it.valor !== null ? brl(it.valor) : '',
      extras: Object.entries(it.extras ?? {}).filter(([ch]) => !/^moeda$/i.test(ch)),
    }));
    // campo extra que repete o que a linha já mostra (data, valor, local, credor...) ou outro extra: sai
    linhas.forEach((l, i) => {
      const visto = new Set([l.data, l.desc, l.credor, l.local, l.valor, descricaoLimpa(g.itens[i].descricao, null)].filter(Boolean).map(norm));
      const valorNum = g.itens[i].valor;
      l.extras = l.extras.filter(([, v]) => {
        const n = norm(v);
        if (!n || visto.has(n)) return false;
        const num = Number(String(v).replace(/\./g, '').replace(',', '.'));
        if (valorNum !== null && Number.isFinite(num) && Math.abs(num - valorNum) < 0.005) return false;
        visto.add(n);
        return true;
      });
    });
    // extra idêntico em TODAS as ocorrências (ex.: CPF do devedor): impresso uma vez só
    const comuns: Array<[string, string]> = [];
    if (linhas.length > 1) {
      for (const [ch, v] of linhas[0].extras) {
        if (linhas.every((l) => l.extras.some(([c2, v2]) => c2 === ch && v2 === v))) comuns.push([ch, v]);
      }
      for (const l of linhas) l.extras = l.extras.filter(([ch, v]) => !comuns.some(([c2, v2]) => c2 === ch && v2 === v));
    }
    if (comuns.length) p.paragrafo('Em todas as ocorrências — ' + comuns.map(([ch, v]) => `${ch}: ${v}`).join('   |   '), { cor: CINZA, tam: 7.5 });

    const tem = (f: (l: (typeof linhas)[number]) => string) => linhas.some((l) => f(l) !== '');
    const colunas: Array<Coluna & { cel: (l: (typeof linhas)[number]) => Celula }> = [];
    if (tem((l) => l.data)) colunas.push({ titulo: 'Data', largura: 54, cel: (l) => ({ texto: l.data }) });
    if (tem((l) => l.desc)) colunas.push({ titulo: 'Descrição', largura: 140, cel: (l) => ({ texto: l.desc }) });
    if (tem((l) => l.credor)) colunas.push({ titulo: 'Credor', largura: 110, cel: (l) => ({ texto: l.credor }) });
    if (tem((l) => l.local)) colunas.push({ titulo: 'Origem / local', largura: 125, cel: (l) => ({ texto: l.local }) });
    if (tem((l) => l.obs)) colunas.push({ titulo: 'Estudar com calma', largura: 70, cel: (l) => ({ texto: l.obs, cor: l.obs ? '#B45309' : CINZA }) });
    if (tem((l) => l.valor)) colunas.push({ titulo: 'Valor', largura: 70, alinhar: 'right', cel: (l) => ({ texto: l.valor }) });
    if (!colunas.length) continue;
    p.tabela(
      colunas.map(({ titulo, largura, alinhar }) => ({ titulo, largura, alinhar })),
      linhas.map((l) => colunas.map((c) => c.cel(l))),
      { detalhes: linhas.map((l) => (l.extras.length ? l.extras.map(([ch, v]) => `${ch}: ${v}`).join('   |   ') : undefined)) },
    );
  }
}

// ---------- 4. dados da empresa ----------
export { naturezaJuridicaTexto };

function idadeDe(de: string | null, ate: Date): string {
  if (!de) return '';
  const d = new Date(de);
  if (!Number.isFinite(d.getTime())) return '';
  const meses = Math.floor((ate.getTime() - d.getTime()) / (30.44 * 86_400_000));
  if (meses < 0) return '';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

function secaoEmpresa(p: Pagina, r: RelatorioCredito, bruto: unknown, agora: Date) {
  const c = r.cadastro;
  const extras = empresaExtrasDe(bruto);
  const campos: Array<{ k: string; v: string; largo?: boolean }> = [];
  const add = (k: string, v: string | null | undefined, largo = false) => { const t = limparTexto(v).trim(); if (t && t !== '—') campos.push({ k, v: t, largo }); };

  const razao = limparTexto(c.razaoSocial).trim();
  if (c.nomeFantasia && norm(c.nomeFantasia) !== norm(razao)) add('Nome fantasia', c.nomeFantasia);
  const desde = c.situacaoEm && c.situacaoEm !== c.fundacao ? ` (desde ${dataBR(c.situacaoEm)})` : '';
  add('Situação', c.situacao ? txt(c.situacao) + desde : '');
  const idade = idadeDe(c.fundacao, agora);
  add('Fundação', c.fundacao ? dataBR(c.fundacao) + (idade ? ` (${idade})` : '') : '');
  add('Natureza jurídica', naturezaJuridicaTexto(c.naturezaJuridica));
  add('Capital social', c.capitalSocial === null ? '' : brl(c.capitalSocial));
  add('Inscrição estadual (IE)', c.inscricaoEstadual);
  add('Opção tributária', c.opcaoTributaria);
  add('Porte / funcionários', [extras.porte, extras.funcionarios ? `${extras.funcionarios} funcionários` : ''].filter(Boolean).join(' — '));
  add('Faturamento presumido', r.complementos?.faturamentoPresumidoFaixa);
  add('Nº de filiais', c.numeroFiliais !== null ? String(c.numeroFiliais) : extras.filiais);

  const cnae = limparTexto(c.cnaePrincipal).trim();
  const atividade = limparTexto(c.atividade).trim();
  const atividadeRepetida = cnae && atividade && (norm(cnae).includes(norm(atividade)) || norm(atividade).includes(norm(cnae)));
  add('CNAE e atividade', [cnae, atividadeRepetida ? '' : atividade].filter(Boolean).join(' — '), true);

  const municipio = [c.municipio, c.uf].filter(Boolean).join('/');
  const end = limparTexto(c.endereco).trim();
  add('Endereço', [end, municipio && !norm(end).includes(norm(c.municipio ?? '#')) ? municipio : ''].filter(Boolean).join(' — ') || municipio, true);

  const veic = new Map<string, number>();
  for (const v of r.complementos?.veiculos ?? []) { const m = limparTexto(v.marcaModelo).trim(); if (m) veic.set(m, (veic.get(m) ?? 0) + 1); }
  if (veic.size) {
    const lista = [...veic].map(([m, n]) => (n > 1 ? `${m} (${n})` : m));
    add('Veículos da empresa', lista.slice(0, 5).join('; ') + (lista.length > 5 ? `; +${lista.length - 5}` : ''), true);
  }

  if (!campos.length) return;
  p.pares('Dados da empresa', campos);
}

// ---------- 5. sócios ----------
function secaoSocios(p: Pagina, r: RelatorioCredito) {
  if (!r.socios.length) return;
  p.titulo('Sócios e administradores');
  const tem = (f: (s: RelatorioCredito['socios'][number]) => boolean) => r.socios.some(f);
  const colunas: Array<Coluna & { cel: (s: RelatorioCredito['socios'][number]) => Celula }> = [
    { titulo: 'Nome', largura: 175, cel: (s) => ({ texto: txt(s.nome) }) },
    { titulo: 'CPF/CNPJ', largura: 95, cel: (s) => ({ texto: s.documento ? mascararDocumento(s.documento) : '' }) },
  ];
  if (tem((s) => !!s.cargo)) colunas.push({ titulo: 'Cargo', largura: 110, cel: (s) => ({ texto: s.cargo ?? '' }) });
  if (tem((s) => !!s.entrada)) colunas.push({ titulo: 'Entrada', largura: 62, cel: (s) => ({ texto: s.entrada ? dataBR(s.entrada) : '' }) });
  if (tem((s) => s.participacao !== null)) colunas.push({ titulo: 'Particip.', largura: 55, alinhar: 'right', cel: (s) => ({ texto: s.participacao !== null ? pct(s.participacao) : '' }) });
  p.tabela(colunas.map(({ titulo, largura, alinhar }) => ({ titulo, largura, alinhar })), r.socios.map((s) => colunas.map((c) => c.cel(s))));
}

// ---------- 6. consultas ao documento ----------
function secaoConsultas(p: Pagina, r: RelatorioCredito, bruto: unknown) {
  const mensal = consultasPorMes(bruto);
  const total = r.complementos?.consultas12Meses;
  if (!r.consultasRecentes.length && !mensal && (total === null || total === undefined)) return;
  p.titulo('Consultas ao documento');
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
  if (mensal) {
    p.subtitulo('Consultas por mês');
    p.tabela(
      mensal.colunas.map((titulo, i) => ({ titulo, largura: i === 0 ? 44 : 38, alinhar: i === 0 ? 'left' as const : 'right' as const })),
      mensal.linhas.map((l) => l.map((texto, i) => ({ texto, negrito: i === 0 }))),
      { compacta: true },
    );
  }
}

// ---------- 7. comportamento comercial (UMA seção) ----------
const PRIORIDADE_EVENTO = (k: string) => (/ltima compra/i.test(k) ? 0 : /maior fatura/i.test(k) ? 1 : /maior cr[ée]dito/i.test(k) ? 2 : 3);

function secaoComportamento(p: Pagina, r: RelatorioCredito, bruto: unknown, desenhar: (parte: Parte) => void) {
  const c = r.comportamento;
  const comp = comportamentoDe(bruto, r.tipo === 'CPF');
  const eventos = [...(comp?.eventos ?? [])].sort((a, b) => PRIORIDADE_EVENTO(a[0]) - PRIORIDADE_EVENTO(b[0]));
  const pares: Array<[string, string]> = [];
  if (!eventos.some(([k]) => PRIORIDADE_EVENTO(k) === 0) && c?.ultimaCompraEm) pares.push(['Última compra', dataBR(c.ultimaCompraEm)]);
  pares.push(...eventos.filter(([k]) => PRIORIDADE_EVENTO(k) < 3));
  if (c?.pagamentoPontualPct != null) pares.push(['Pagamentos em dia', pct(c.pagamentoPontualPct)]);
  if (c?.relacionamentoMaisAntigoEm) pares.push(['Relacionamento mais antigo', dataBR(c.relacionamentoMaisAntigoEm)]);
  if (c?.fontesConsultadas != null) pares.push(['Fornecedores que informaram', String(c.fontesConsultadas)]);
  pares.push(...eventos.filter(([k]) => PRIORIDADE_EVENTO(k) === 3));
  const validos = pares.filter(([, v]) => ok(v));
  if (!validos.length && !comp?.matriz.length && !comp?.relacionamento) return;

  p.titulo('Comportamento comercial');
  if (validos.length) p.paragrafo(validos.map(([k, v]) => `${k}: ${v}`).join('   |   '), { tam: 8.5 });
  if (comp?.matriz.length) {
    p.subtitulo('Últimos 12 meses');
    for (const parte of comp.matriz) desenhar(parte);
  }
  if (comp?.relacionamento) p.paragrafo('Tempo de relacionamento com fornecedores — ' + comp.relacionamento, { tam: 8.5 });
}

function secaoFinal(p: Pagina, consultadoPor: string | null) {
  p.paragrafo(
    `Consultado por ${limparTexto(consultadoPor) || 'usuário não identificado'}. Documento confidencial de uso interno da Sal Vita, para análise de concessão de crédito; ` +
    'reflete a situação na data e hora da consulta e não constitui garantia de pagamento. A decisão é da Sal Vita. ' +
    'Proibida a divulgação a terceiros (LGPD - Lei 13.709/2018).',
    { cor: CINZA, tam: 7.5 },
  );
}

// ---------- partes genéricas (matriz de comportamento e anexo) ----------
function desenharParte(p: Pagina, parte: Parte, ctr: { omitidos: number }) {
  switch (parte.t) {
    case 'sub': p.subtitulo(parte.texto); break;
    case 'aviso': p.paragrafo(parte.texto, { cor: COR_SEMAFORO.VERMELHO, tam: 8.5 }); break;
    case 'campos':
      ctr.omitidos += p.tabela([{ titulo: 'Campo', largura: 150 }, { titulo: 'Valor', largura: 365 }],
        parte.pares.map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]), { limitar: true });
      break;
    case 'tabela': {
      if (parte.continuacao) p.paragrafo('(continuação: demais colunas dos mesmos registros)', { cor: CINZA, tam: 7.5 });
      const falt = p.tabela(parte.colunas.map((titulo, i) => ({ titulo, largura: parte.pesos[i] })),
        parte.linhas.map((l) => l.map((texto, i) => ({ texto, negrito: i === 0 && parte.colunas.length > 2 }))), { limitar: true, compacta: parte.compacta });
      if (!parte.continuacao) ctr.omitidos += falt;
      break;
    }
    case 'ficha':
      for (let i = 0; i < parte.registros.length; i++) {
        if (p.estourou()) { ctr.omitidos += parte.registros.length - i; break; }
        p.garantir(60);
        if (parte.registros.length > 1) p.paragrafo(`Registro ${i + 1} de ${parte.registros.length}`, { cor: CINZA, tam: 8, negrito: true });
        p.tabela([{ titulo: 'Campo', largura: 150 }, { titulo: 'Valor', largura: 365 }],
          parte.registros[i].map(([k, v]) => [{ texto: k, negrito: true, cor: CINZA }, { texto: v }]), { semCabecalho: true });
      }
      break;
    case 'lista':
      for (let i = 0; i < parte.itens.length; i++) {
        if (p.estourou()) { ctr.omitidos += parte.itens.length - i; break; }
        p.paragrafo('•  ' + parte.itens[i], { tam: 8.5 });
      }
      break;
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

/** Em todas as páginas: faixa de simulação (quando for o caso) e rodapé. Razão social/CNPJ/fonte NÃO se repetem aqui. */
function cabecalhoRodape(doc: Doc, r: RelatorioCredito, i: number, total: number) {
  // escreve dentro da margem inferior sem disparar quebra automática de página
  const margens = doc.page.margins;
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

  if (r.fonte.provedor === 'simulado') {
    // Faixa em TODAS as páginas, no topo (a área útil começa em TOPO=40).
    doc.rect(0, 0, W, 24).fill(COR_SEMAFORO.VERMELHO);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
      .text(FAIXA_SIMULACAO, MX, 7, { width: LARG, align: 'center', lineBreak: false });
  }

  const fy = H - 36;
  doc.moveTo(MX, fy).lineTo(W - MX, fy).lineWidth(0.5).strokeColor(LINHA).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(CINZA)
    .text('Confidencial — uso interno da Sal Vita para decisão de crédito', MX, fy + 6, { width: 380, lineBreak: false });
  doc.text(`Página ${i + 1} de ${total}`, W - MX - 100, fy + 6, { width: 100, align: 'right', lineBreak: false });

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
