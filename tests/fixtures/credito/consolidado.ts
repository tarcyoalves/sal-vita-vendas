// Relatórios FICTÍCIOS (empresa, CNPJ, CPFs e nomes inventados) de duas fontes para o MESMO documento, usados nos
// testes do relatório consolidado. Nenhum dado real. Cenário do dono: a Consulta simples (Boa Vista) diz "0 pendências"
// e o Serasa Premium lista 10; os protestos se sobrepõem em parte; só o Serasa traz sócios e ações cíveis.
import type { GrupoAnotacao, ItemParaConsolidar, RelatorioCredito } from '../../../shared/credito';

const DOC = '11222333000181';
const nada = (): GrupoAnotacao => ({ consultado: true, quantidade: 0, valorTotal: 0, itens: [] });
const naoConsultado = (): GrupoAnotacao => ({ consultado: false, quantidade: 0, valorTotal: null, itens: [] });

const protestoComum1 = { data: '2026-03-05', descricao: 'Protesto — Duplicata', valor: 1200, local: 'Cartório Central - Cidade Exemplo/RN' };
const protestoComum2 = { data: '2026-06-10', descricao: 'Protesto — Duplicata', valor: 3400.5, local: 'Cartório Central - Cidade Exemplo/RN' };
const protestoSoSerasa = { data: '2026-08-20', descricao: 'Protesto — Nota promissória', valor: 800, local: '2º Tabelionato - Outra Cidade/PB' };

const pendencias10 = Array.from({ length: 10 }, (_, i) => ({
  data: `2026-0${(i % 9) + 1}-1${i % 9}`, descricao: 'Pendência financeira', valor: 1500 + i * 100, local: null, credor: `Credor Fictício ${i + 1}`,
}));

export const boaVistaSintetico: RelatorioCredito = {
  documento: DOC, tipo: 'CNPJ', consultadoEm: '2026-10-16T18:02:00.000Z',
  fonte: { provedor: 'boavista_apifull', produto: 'Consulta simples', custoReais: 2.75 },
  score: { valor: 540, probabilidadeInadimplencia: 12.3, faixa: 'C', textoInterpretacao: 'Risco moderado segundo o modelo da fonte.' },
  cadastro: {
    razaoSocial: 'Comercial Exemplo Ltda', nomeFantasia: 'Exemplo Atacado', situacao: 'Ativa', situacaoEm: '2005-03-10', fundacao: '2005-03-10',
    naturezaJuridica: '206-2', capitalSocial: 100000, cnaePrincipal: '4637-1/99', atividade: 'Comércio atacadista', opcaoTributaria: null,
    inscricaoEstadual: '20.123.456-7', endereco: 'Rua das Palmeiras, 1200', municipio: 'Cidade Exemplo', uf: 'RN', telefone: null, numeroFiliais: null,
  },
  socios: [],
  consultasRecentes: [
    { data: '2026-10-10', consultante: 'Distribuidora Modelo S.A.', quantidade: 1 },
    { data: '2026-10-02', consultante: 'Banco Exemplo de Fomento', quantidade: 1 },
  ],
  comportamento: { ultimaCompraEm: '2026-09-28', relacionamentoMaisAntigoEm: null, fontesConsultadas: null, pagamentoPontualPct: 91 },
  complementos: { consultas12Meses: 14 },
  anotacoes: {
    protestos: { consultado: true, quantidade: 2, valorTotal: 4600.5, itens: [protestoComum1, protestoComum2] },
    pendenciasFinanceiras: nada(),
    chequesSemFundo: nada(),
    acoesJudiciais: naoConsultado(),
    falenciaRecuperacao: naoConsultado(),
  },
};

export const serasaSintetico: RelatorioCredito = {
  documento: DOC, tipo: 'CNPJ', consultadoEm: '2026-10-16T18:03:00.000Z',
  fonte: { provedor: 'boavista_apifull', produto: 'Serasa Premium', custoReais: 6.72 },
  score: { valor: 710, probabilidadeInadimplencia: 4.5, faixa: 'B', textoInterpretacao: 'Baixa probabilidade de inadimplência segundo o modelo da fonte.' },
  cadastro: {
    razaoSocial: 'COMERCIAL EXEMPLO LTDA', nomeFantasia: null, situacao: 'ATIVA', situacaoEm: null, fundacao: '2005-03-10',
    naturezaJuridica: null, capitalSocial: null, cnaePrincipal: null, atividade: null, opcaoTributaria: null,
    inscricaoEstadual: null, endereco: null, municipio: 'Cidade Exemplo', uf: 'RN', telefone: null, numeroFiliais: 2,
  },
  socios: [
    { documento: '11146812612', nome: 'Maria Exemplo da Silva', entrada: null, participacao: 60, cargo: 'Sócia-administradora' },
    { documento: '22235791409', nome: 'João Fictício Pereira', entrada: null, participacao: 40, cargo: 'Sócio' },
  ],
  consultasRecentes: [
    { data: '2026-10-10', consultante: 'DISTRIBUIDORA MODELO S.A.', quantidade: 1 },
    { data: '2026-09-21', consultante: 'Transportadora Fictícia', quantidade: 1 },
  ],
  complementos: { faturamentoPresumidoFaixa: 'De R$ 1 a 5 milhões', veiculos: [{ marcaModelo: 'VW/Delivery 11.180' }], consultas12Meses: 17 },
  anotacoes: {
    protestos: { consultado: true, quantidade: 3, valorTotal: 5400.5, itens: [protestoComum1, protestoComum2, protestoSoSerasa] },
    pendenciasFinanceiras: { consultado: true, quantidade: 10, valorTotal: pendencias10.reduce((s, i) => s + i.valor, 0), itens: pendencias10 },
    chequesSemFundo: nada(),
    acoesJudiciais: { consultado: true, quantidade: 1, valorTotal: 9000, itens: [{ data: '2026-02-02', descricao: 'Ação cível — Cobrança', valor: 9000, local: '1ª Vara - Cidade Exemplo/RN' }] },
    falenciaRecuperacao: naoConsultado(),
  },
};

/** Serasa que devolveu "score não calculado" (score null) e quase nada útil além do cadastro. */
export const serasaSemScore: RelatorioCredito = {
  ...serasaSintetico,
  score: { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
  anotacoes: { ...serasaSintetico.anotacoes, protestos: naoConsultado(), pendenciasFinanceiras: naoConsultado(), acoesJudiciais: naoConsultado(), chequesSemFundo: naoConsultado() },
};

export const itemBoaVista = (r: RelatorioCredito = boaVistaSintetico): ItemParaConsolidar =>
  ({ relatorio: r, produto: 'boavista', produtoNome: 'Consulta simples', consultadoEm: r.consultadoEm });
export const itemSerasa = (r: RelatorioCredito = serasaSintetico): ItemParaConsolidar =>
  ({ relatorio: r, produto: 'serasa_premium', produtoNome: 'Serasa Premium', consultadoEm: r.consultadoEm });
