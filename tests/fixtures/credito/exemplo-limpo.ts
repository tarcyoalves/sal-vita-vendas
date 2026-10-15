// Relatório FICTÍCIO (empresa, CNPJ, CPFs e nomes inventados) para testes e PDF de exemplo. Nenhum dado real.
import type { GrupoAnotacao, RelatorioCredito } from '../../../shared/credito';

const nada = (): GrupoAnotacao => ({ consultado: true, quantidade: 0, valorTotal: 0, itens: [] });

export const exemploLimpo: RelatorioCredito = {
  documento: '11222333000181',
  tipo: 'CNPJ',
  consultadoEm: '2026-10-15T14:32:00.000Z',
  fonte: { provedor: 'Provedor Fictício', produto: 'Relatório Empresarial (exemplo)', custoReais: null },
  score: {
    valor: 620,
    probabilidadeInadimplencia: 8.4,
    faixa: 'Risco baixo',
    textoInterpretacao:
      'Empresa com histórico de pagamentos regular e sem registros de restrição no período analisado. Probabilidade de inadimplência abaixo da média do segmento.',
  },
  cadastro: {
    razaoSocial: 'Comercial Exemplo Ltda',
    nomeFantasia: 'Exemplo Atacado',
    situacao: 'Ativa',
    situacaoEm: '2005-03-10',
    fundacao: '2005-03-10',
    naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
    capitalSocial: 250000,
    cnaePrincipal: '4637-1/99 - Comércio atacadista especializado em outros produtos alimentícios',
    atividade: 'Comércio atacadista de produtos alimentícios',
    opcaoTributaria: 'Lucro presumido',
    inscricaoEstadual: '20.123.456-7',
    endereco: 'Rua das Palmeiras, 1200, Distrito Industrial',
    municipio: 'Cidade Exemplo',
    uf: 'RN',
    telefone: '(84) 3000-0000',
    numeroFiliais: 2,
  },
  socios: [
    { documento: '11146812612', nome: 'Maria Exemplo da Silva', entrada: '2005-03-10', participacao: 60, cargo: 'Sócia-administradora' },
    { documento: '22235791409', nome: 'João Fictício Pereira', entrada: '2011-06-01', participacao: 40, cargo: 'Sócio' },
  ],
  consultasRecentes: [
    { data: '2026-09-28', consultante: 'Distribuidora Modelo S.A.', quantidade: 1 },
    { data: '2026-08-14', consultante: 'Banco Exemplo de Fomento', quantidade: 2 },
  ],
  anotacoes: {
    protestos: nada(),
    pendenciasFinanceiras: nada(),
    chequesSemFundo: nada(),
    acoesJudiciais: nada(),
    falenciaRecuperacao: nada(),
  },
};
