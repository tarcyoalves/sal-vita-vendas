// Relatório FICTÍCIO com restrições (empresa, CNPJ, CPFs e nomes inventados). Nenhum dado real.
import type { RelatorioCredito } from '../../../shared/credito';

export const exemploRestricao: RelatorioCredito = {
  documento: '44555666000181',
  tipo: 'CNPJ',
  consultadoEm: '2026-10-15T17:05:00.000Z',
  fonte: { provedor: 'Provedor Fictício', produto: 'Relatório Empresarial (exemplo)', custoReais: null },
  score: {
    valor: 320,
    probabilidadeInadimplencia: 41.75,
    faixa: 'Risco alto',
    textoInterpretacao:
      'Empresa com registros de inadimplência recentes. A probabilidade de atraso nos próximos 12 meses é elevada em relação ao segmento.',
  },
  cadastro: {
    razaoSocial: 'Comercial Exemplo Restrição Ltda',
    nomeFantasia: null,
    situacao: 'Ativa',
    situacaoEm: '2018-01-22',
    fundacao: '2018-01-22',
    naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
    capitalSocial: 50000,
    cnaePrincipal: '4711-3/02 - Comércio varejista de mercadorias em geral',
    atividade: null,
    opcaoTributaria: 'Simples Nacional',
    inscricaoEstadual: null,
    endereco: 'Avenida Fictícia Presidente Exemplar Muito Longa Para Testar Quebra de Linha, 4500, Sala 12, Bairro Imaginário',
    municipio: 'Cidade Exemplo',
    uf: 'RN',
    telefone: null,
    numeroFiliais: null,
  },
  socios: [
    { documento: '33321987694', nome: 'Carlos Imaginário de Souza Albuquerque Filho', entrada: '2018-01-22', participacao: 100, cargo: 'Sócio-administrador' },
  ],
  consultasRecentes: [
    { data: '2026-10-02', consultante: 'Fornecedora Modelo Ltda', quantidade: 3 },
    { data: '2026-09-19', consultante: 'Financeira Exemplo S.A.', quantidade: 1 },
    { data: '2026-09-05', consultante: 'Atacadista Fictício e Cia', quantidade: 1 },
  ],
  anotacoes: {
    protestos: {
      consultado: true,
      quantidade: 2,
      valorTotal: 7850.4,
      itens: [
        { data: '2026-08-12', descricao: 'Protesto de duplicata mercantil', valor: 4200.4, local: '1º Cartório de Protestos - Cidade Exemplo/RN' },
        { data: '2026-07-03', descricao: 'Protesto de duplicata de prestação de serviços', valor: 3650, local: '2º Cartório de Protestos - Cidade Exemplo/RN' },
      ],
    },
    pendenciasFinanceiras: {
      consultado: true,
      quantidade: 1,
      valorTotal: 1890.9,
      itens: [{ data: '2026-06-20', descricao: 'Débito comercial em aberto (contrato 000123)', valor: 1890.9, local: 'Financeira Exemplo S.A. - Cidade Exemplo/RN' }],
    },
    chequesSemFundo: { consultado: true, quantidade: 0, valorTotal: 0, itens: [] },
    acoesJudiciais: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
    falenciaRecuperacao: { consultado: true, quantidade: 0, valorTotal: 0, itens: [] },
  },
};
