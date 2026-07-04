import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import {
  totalItens, pesoTotalItens, freteTotal, freteUnitItem, formatBRL, formatKg, formatPrazo,
} from '../../client/src/lib/faturamento/calc';
import { EMPRESA } from '../../shared/const';
import type { Pedido } from '../../client/src/lib/faturamento/types';

// PDF anexado ao e-mail — espelha o documento de impressão (OrderPrintDocument.tsx)
// mas com @react-pdf/renderer (renderização em Node, sem navegador/Chromium).
// Sem a logo: a imagem é hospedada com proteção contra hotlink no WordPress do
// cliente, que costuma bloquear requisições sem contexto de navegador (o mesmo
// motivo por que curl não busca essa imagem) — arriscar isso travar o envio de
// e-mail não vale a pena por um detalhe visual. Cabeçalho fica só em texto.

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b', fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#1e293b', paddingBottom: 8, marginBottom: 10 },
  empresaNome: { fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 2 },
  empresaLinha: { fontSize: 8, color: '#475569' },
  tituloDoc: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', color: '#1e293b' },
  subTitulo: { fontSize: 8, color: '#64748b', textAlign: 'right', marginTop: 2 },
  box: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, padding: 8, marginBottom: 10 },
  label: { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 1 },
  value: { fontSize: 9, color: '#1e293b', marginBottom: 6 },
  row: { flexDirection: 'row' },
  col2: { width: '50%' },
  table: { marginBottom: 10 },
  tHeadRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#1e293b', paddingBottom: 4, marginBottom: 2 },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
  tFootRow: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#1e293b', paddingTop: 4, marginTop: 2 },
  th: { fontSize: 7, fontWeight: 700, textTransform: 'uppercase', color: '#1e293b' },
  td: { fontSize: 8.5, color: '#1e293b' },
  cDesc: { width: '30%' },
  cQtd: { width: '9%', textAlign: 'right' },
  cPeso: { width: '15%', textAlign: 'right' },
  cSal: { width: '15%', textAlign: 'right' },
  cFrete: { width: '15%', textAlign: 'right' },
  cFinal: { width: '16%', textAlign: 'right' },
  resumoTable: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, marginBottom: 10 },
  resumoHeadRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', padding: 6 },
  resumoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', padding: 6 },
  resumoTotalRow: { flexDirection: 'row', backgroundColor: '#eff6ff', padding: 7 },
  rLabel: { width: '40%', fontSize: 8.5, color: '#475569' },
  rValor: { width: '30%', fontSize: 8.5, fontWeight: 700, textAlign: 'right' },
  rCond: { width: '30%', fontSize: 8.5, color: '#64748b', textAlign: 'right' },
  totalGeralLabel: { width: '40%', fontSize: 9, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase' },
  totalGeralValor: { width: '60%', fontSize: 13, fontWeight: 700, color: '#1e3a8a', textAlign: 'right' },
  obsBox: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, padding: 8, marginBottom: 10, minHeight: 40 },
  footer: { textAlign: 'center', fontSize: 8, color: '#94a3b8', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
});

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
}

function PedidoDocument({ pedido }: { pedido: Pedido }) {
  const totalSal = totalItens(pedido.itens);
  const totalFrete = freteTotal(pedido);
  const totalGeral = totalSal + totalFrete;
  const pesoTotal = pesoTotalItens(pedido.itens);
  const nomePrincipal = pedido.razaoSocial?.trim() || pedido.clienteNome?.trim() || '--';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.empresaNome}>{EMPRESA.razaoSocial}</Text>
            <Text style={styles.empresaLinha}>CNPJ: {EMPRESA.cnpj} · IE: {EMPRESA.ie}</Text>
            <Text style={styles.empresaLinha}>{EMPRESA.endereco}</Text>
            <Text style={styles.empresaLinha}>{EMPRESA.cidade} · Tel: {EMPRESA.telefone} · {EMPRESA.email}</Text>
          </View>
          <View>
            <Text style={styles.tituloDoc}>Pedido de Vendas</Text>
            <Text style={styles.subTitulo}>Nº {pedido.id.slice(0, 8).toUpperCase()} · {fmtDate(pedido.criadoEm)}</Text>
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.box}>
          <Text style={styles.label}>Cliente</Text>
          <Text style={styles.value}>{nomePrincipal}</Text>
          <View style={styles.row}>
            <View style={styles.col2}>
              <Text style={styles.label}>CNPJ</Text>
              <Text style={styles.value}>{pedido.cnpj || '--'}</Text>
            </View>
            <View style={styles.col2}>
              <Text style={styles.label}>Cidade/UF</Text>
              <Text style={styles.value}>{[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '--'}</Text>
            </View>
          </View>
          <Text style={styles.label}>Atendente</Text>
          <Text style={{ fontSize: 9, color: '#1e293b' }}>{pedido.sellerName || '--'}</Text>
        </View>

        {/* Itens */}
        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.th, styles.cDesc]}>Descrição do sal</Text>
            <Text style={[styles.th, styles.cQtd]}>Qtd</Text>
            <Text style={[styles.th, styles.cPeso]}>Peso</Text>
            <Text style={[styles.th, styles.cSal]}>Vlr sal (un.)</Text>
            <Text style={[styles.th, styles.cFrete]}>Vlr frete (un.)</Text>
            <Text style={[styles.th, styles.cFinal]}>Preço final (un.)</Text>
          </View>
          {pedido.itens.map((it) => {
            const frete = freteUnitItem(it, pedido.valorFretePorUnidade);
            return (
              <View key={it.id} style={styles.tRow}>
                <Text style={[styles.td, styles.cDesc]}>{it.descricao || 'Item'}</Text>
                <Text style={[styles.td, styles.cQtd]}>{it.quantidade}</Text>
                <Text style={[styles.td, styles.cPeso]}>{formatKg(it.pesoKg)}</Text>
                <Text style={[styles.td, styles.cSal]}>{formatBRL(it.valorUnitario)}</Text>
                <Text style={[styles.td, styles.cFrete]}>{formatBRL(frete)}</Text>
                <Text style={[styles.td, styles.cFinal, { fontWeight: 700 }]}>{formatBRL(it.valorUnitario + frete)}</Text>
              </View>
            );
          })}
          <View style={styles.tFootRow}>
            <Text style={[styles.td, styles.cDesc, { fontWeight: 700 }]}>Peso total</Text>
            <Text style={[styles.td, styles.cQtd]} />
            <Text style={[styles.td, styles.cPeso, { fontWeight: 700 }]}>{formatKg(pesoTotal)}</Text>
            <Text style={[styles.td, styles.cSal]} />
            <Text style={[styles.td, styles.cFrete]} />
            <Text style={[styles.td, styles.cFinal]} />
          </View>
        </View>

        {/* Resumo de pagamento */}
        <View style={styles.resumoTable}>
          <View style={styles.resumoHeadRow}>
            <Text style={styles.rLabel} />
            <Text style={[styles.rValor, { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }]}>Valor</Text>
            <Text style={[styles.rCond, { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }]}>Condição de pagamento</Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.rLabel}>Total Sal</Text>
            <Text style={styles.rValor}>{formatBRL(totalSal)}</Text>
            <Text style={styles.rCond}>{formatPrazo(pedido.prazoPagamentoSal)}</Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.rLabel}>Total Frete</Text>
            <Text style={styles.rValor}>{formatBRL(totalFrete)}</Text>
            <Text style={styles.rCond}>{formatPrazo(pedido.prazoPagamentoFrete)}</Text>
          </View>
          <View style={styles.resumoTotalRow}>
            <Text style={styles.totalGeralLabel}>Total geral do pedido</Text>
            <Text style={styles.totalGeralValor}>{formatBRL(totalGeral)}</Text>
          </View>
        </View>

        {/* Observações — bloco sempre presente */}
        <View style={styles.obsBox}>
          <Text style={styles.label}>Observações gerais do pedido</Text>
          {pedido.observacoes ? <Text style={{ fontSize: 8.5, color: '#1e293b' }}>{pedido.observacoes}</Text> : null}
        </View>

        <Text style={styles.footer}>{EMPRESA.site}</Text>
      </Page>
    </Document>
  );
}

export async function gerarPedidoPdf(pedido: Pedido): Promise<Buffer> {
  return renderToBuffer(<PedidoDocument pedido={pedido} />);
}
