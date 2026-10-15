// Provedor simulado: determinístico a partir do documento, sem rede, custo 0. Para desenvolvimento e testes.
// Último dígito: 0 protesto, 1 cheque sem fundo, 2 pendência alta (R$ 7.500), 3 pendência baixa (R$ 1.200),
// 4 ação judicial, 5..9 limpo. O score vem dos 3 últimos dígitos.
// Penúltimo dígito (pontos de atenção, datas relativas à consulta): 0 empresa nova (ALERTA), 1 seis consultas no mês
// (ALERTA), 2 sócio entrou há 3 meses (ALERTA), 3 empresa jovem sem compras recentes (ATENÇÃO), 4..9 empresa
// consolidada comprando normalmente (POSITIVO).
import type { GrupoAnotacao, RelatorioCredito, TipoDocumento } from '../../../../shared/credito';
import type { ProvedorCredito } from './tipos';

const DIA = 86_400_000;
/** Data (aaaa-mm-dd) `dias` antes da consulta: determinística, não depende do relógio. */
const antes = (base: Date, dias: number) => new Date(base.getTime() - dias * DIA).toISOString().slice(0, 10);

const grupo = (itens: GrupoAnotacao['itens'] = [], valorTotal = 0): GrupoAnotacao => ({
  consultado: true, quantidade: itens.length, valorTotal, itens,
});

export function relatorioSimulado(documento: string, tipo: TipoDocumento, consultadoEm: string): RelatorioCredito {
  const d = documento.replace(/\D/g, '');
  const ultimo = Number(d.slice(-1));
  const valorScore = 250 + ((Number(d.slice(-3)) * 37) % 700);
  const penultimo = Number(d.slice(-2, -1));
  const base = new Date(consultadoEm);
  const fundadaHaDias = penultimo === 0 ? 180 : penultimo === 3 ? 730 : 15 * 365;
  const compra = penultimo === 3 ? 400 : 20;
  const item = (descricao: string, valor: number) => ({ data: '2026-01-15', descricao, valor, local: 'SIMULADO' });
  return {
    documento: d, tipo, consultadoEm,
    fonte: { provedor: 'simulado', produto: 'Simulação (sem consulta real)', custoReais: 0 },
    score: {
      valor: valorScore,
      probabilidadeInadimplencia: Math.round((1000 - valorScore) / 10),
      faixa: valorScore < 400 ? 'ALTO RISCO' : valorScore < 600 ? 'RISCO MÉDIO' : 'BAIXO RISCO',
      textoInterpretacao: 'Dado simulado — não representa a situação real do documento.',
    },
    cadastro: {
      razaoSocial: `EMPRESA SIMULADA ${d.slice(-4)}`, nomeFantasia: null, situacao: 'ATIVA', situacaoEm: null, fundacao: antes(base, fundadaHaDias),
      naturezaJuridica: null, capitalSocial: null, cnaePrincipal: null, atividade: null, opcaoTributaria: null,
      inscricaoEstadual: null, endereco: null, municipio: null, uf: null, telefone: null, numeroFiliais: null,
    },
    socios: [
      { documento: null, nome: 'SÓCIO SIMULADO UM', entrada: antes(base, Math.min(fundadaHaDias, 3650)), participacao: 60, cargo: 'Sócio-administrador' },
      { documento: null, nome: 'SÓCIO SIMULADO DOIS', entrada: antes(base, penultimo === 2 ? 90 : Math.min(fundadaHaDias, 2000)), participacao: 40, cargo: 'Sócio' },
    ],
    consultasRecentes: penultimo === 1
      ? [
          { data: antes(base, 3), consultante: 'CONSULTANTE SIMULADO A', quantidade: 3 },
          { data: antes(base, 12), consultante: 'CONSULTANTE SIMULADO B', quantidade: 3 },
        ]
      : [{ data: antes(base, 15), consultante: 'CONSULTANTE SIMULADO A', quantidade: 1 }],
    comportamento: {
      ultimaCompraEm: antes(base, compra), relacionamentoMaisAntigoEm: antes(base, Math.min(fundadaHaDias, 3000)),
      fontesConsultadas: 8, pagamentoPontualPct: 90,
    },
    anotacoes: {
      protestos: ultimo === 0 ? grupo([item('Protesto simulado', 3200)], 3200) : grupo(),
      pendenciasFinanceiras:
        ultimo === 2 ? grupo([item('Pendência simulada', 7500)], 7500)
        : ultimo === 3 ? grupo([item('Pendência simulada', 1200)], 1200)
        : grupo(),
      chequesSemFundo: ultimo === 1 ? grupo([item('Cheque sem fundo simulado', 900)], 900) : grupo(),
      acoesJudiciais: ultimo === 4 ? grupo([item('Ação judicial simulada', 15000)], 15000) : grupo(),
      falenciaRecuperacao: grupo(),
    },
  };
}

export const provedorSimulado: ProvedorCredito = {
  nome: 'simulado',
  produto: 'Simulação (sem consulta real)',
  custoReais: 0,
  async consultar(documento, tipo) {
    const relatorio = relatorioSimulado(documento, tipo, new Date().toISOString());
    return { relatorio, bruto: { simulado: true } };
  },
};
