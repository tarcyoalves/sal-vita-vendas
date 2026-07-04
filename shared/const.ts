export const COOKIE_NAME = 'sal-vita-session';
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const UNAUTHED_ERR_MSG = 'UNAUTHORIZED';

// Dados da empresa emissora dos pedidos — usado no cabeçalho do documento
// impresso (cliente) e no PDF anexado ao e-mail (servidor). Fixo por enquanto,
// sem tela de configuração.
export const EMPRESA = {
  razaoSocial: 'A S COMERCIO E MOAGEM DE SAL LTDA',
  cnpj: '51.422.900/0001-68',
  ie: '206389191',
  endereco: 'Avenida Industrial Dehuel Vieira Diniz nº 505, Monsenhor Américo',
  cidade: 'Mossoró - RN',
  telefone: '(84) 2140-8212',
  email: 'contato@salvitarn.com.br',
  site: 'www.salvitarn.com.br',
};
