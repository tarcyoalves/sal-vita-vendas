// Rótulos legíveis e máscaras (LGPD) para os dados crus da API Full. Usado pelo mapeador (extras dos itens)
// e pelo anexo do PDF. Puro e sem dependências: roda no servidor e no navegador.

/** Títulos conhecidos dos blocos da API Full (chave sem prefixo, em maiúsculas). */
export const ROTULOS_BLOCOS: Record<string, string> = {
  HEADER: 'Cabeçalho da resposta',
  CREDCADASTRAL: 'Crédito e cadastro',
  VEICULAR: 'Veículos',
  PEND_FINANCEIRAS: 'Pendências financeiras',
  RESTRICOES_FINANCEIRAS: 'Restrições financeiras',
  PROTESTOS: 'Protestos',
  PROTESTO_SINTETICO: 'Protestos (sintético)',
  CH_SEM_FUNDOS_BACEN: 'Cheques sem fundos (BACEN)',
  CH_SEM_FUNDOS_VAREJO: 'Cheques sem fundos (Varejo)',
  SCORES: 'Scores',
  HIST_CONSULTAS: 'Histórico de consultas',
  PASSAGENS_COMERCIAIS: 'Passagens comerciais (consultas)',
  EVENTOS_PESSOA_JURIDICA: 'Eventos da pessoa jurídica',
  CREDITO_OBTIDO: 'Crédito obtido',
  COMPROMISSOS: 'Compromissos',
  PAGAMENTO_PONTUAL: 'Pagamento pontual',
  PAGAMENTO_ATRASADO: 'Pagamento atrasado',
  COMPROMETIMENTO_FUTURO: 'Comprometimento futuro',
  PERIODO_RELACIONAMENTO_FORNECEDORES: 'Relacionamento com fornecedores',
  QUADRO_SOCIETARIO: 'Quadro societário',
  FATURAMENTO_PRESUMIDO: 'Faturamento presumido',
  ACOES_CIVEIS: 'Ações cíveis',
  VEICULOS_POR_DOCUMENTO: 'Veículos por documento',
  INFORMACOES_DA_EMPRESA: 'Informações da empresa',
  INFORMACOES_ALERTAS_RESTRICOES: 'Alertas e restrições',
  CONTUMACIA: 'Contumácia',
  EMAILS: 'E-mails',
  SOMENTE_ENDERECO: 'Endereços',
  TELEFONE_FIXO: 'Telefones fixos',
  TELEFONE_CELULAR: 'Telefones celulares',
  OCORRENCIAS: 'Ocorrências',
  DETALHES: 'Detalhes',
  QUANTIDADES: 'Quantidades por mês',
  PARAMETROS: 'Parâmetros da consulta',
  STATUS_RETORNO: 'Status',
  QUANTIDADE_OCORRENCIA: 'Quantidade de ocorrências',
  QUANTIDADE_OCORRENCIAS: 'Quantidade de ocorrências',
};

// Restaura acentos de palavras comuns (a API Full manda tudo sem acento).
const ACENTOS: Record<string, string> = {
  inclusao: 'inclusão', situacao: 'situação', descricao: 'descrição', ocorrencia: 'ocorrência', ocorrencias: 'ocorrências',
  numero: 'número', codigo: 'código', endereco: 'endereço', razao: 'razão', juridica: 'jurídica', juridico: 'jurídico',
  cartorio: 'cartório', concluida: 'concluída', especie: 'espécie', pontuacao: 'pontuação', classificacao: 'classificação',
  inadimplencia: 'inadimplência', periodo: 'período', participacao: 'participação', informacoes: 'informações',
  restricoes: 'restrições', pendencias: 'pendências', acoes: 'ações', civeis: 'cíveis', veiculos: 'veículos', veiculo: 'veículo',
  fundacao: 'fundação', orgao: 'órgão', municipio: 'município', tipo: 'tipo', data: 'data', quantidade: 'quantidade',
  ultimo: 'último', ultima: 'última', obrigacao: 'obrigação', operacao: 'operação', negocio: 'negócio',
  consulta: 'consulta', nacionalidade: 'nacionalidade', ano: 'ano', mes: 'mês', area: 'área', comercio: 'comércio',
  atencao: 'atenção', analise: 'análise', indice: 'índice', historico: 'histórico', saude: 'saúde', credito: 'crédito',
  debito: 'débito', titulo: 'título', titulos: 'títulos', protesto: 'protesto', apresentacao: 'apresentação',
  emissao: 'emissão', vencimento: 'vencimento', judicial: 'judicial', distribuicao: 'distribuição', natureza: 'natureza',
  fisica: 'física', economico: 'econômico', economica: 'econômica', prazo: 'prazo', saldo: 'saldo', agencia: 'agência',
  banco: 'banco', alinea: 'alínea', cheque: 'cheque', cheques: 'cheques', telefone: 'telefone', residencial: 'residencial',
  primario: 'primário', secundario: 'secundário', inscricao: 'inscrição', estadual: 'estadual', matriz: 'matriz',
  socio: 'sócio', socios: 'sócios', societario: 'societário', funcionarios: 'funcionários', media: 'média', fatura: 'fatura',
  comerciais: 'comerciais', fornecedor: 'fornecedor', fornecedores: 'fornecedores', regiao: 'região', atuacao: 'atuação',
};

const SIGLAS = new Set(['cnpj', 'cpf', 'uf', 'cep', 'cnae', 'nire', 'ie']);

/** Tira o prefixo "xxx:" do Define Risco ('scor:score_pj' -> 'score_pj'). */
export const semPrefixo = (k: string): string => {
  const i = k.lastIndexOf(':');
  return i >= 0 ? k.slice(i + 1) : k;
};

/** "DATA_INCLUSAO" -> "Data inclusão". Chaves desconhecidas: underscore vira espaço e a 1ª letra fica maiúscula. */
export function humanizarChave(chave: string): string {
  const base = semPrefixo(chave).trim();
  const palavras = base.replace(/[_\s]+/g, ' ').trim().toLowerCase().split(' ').filter(Boolean);
  if (!palavras.length) return chave;
  const f = palavras.map((p) => SIGLAS.has(p) ? p.toUpperCase() : (ACENTOS[p] ?? p)).join(' ');
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** Título de um bloco: tabela de rótulos conhecidos; TELEFONE_<x> tratado; senão humaniza. */
export function rotuloBloco(chave: string): string {
  const base = semPrefixo(chave).trim();
  const conhecido = ROTULOS_BLOCOS[base.toUpperCase()];
  if (conhecido) return conhecido;
  const tel = /^TELEFONE_(.+)$/i.exec(base);
  if (tel) return `Telefone ${humanizarChave(tel[1]).toLowerCase()}`;
  return humanizarChave(base);
}

/** Qualquer CPF formatado (xxx.xxx.xxx-xx) em texto livre vira ***.xxx.xxx-** (mesma máscara do PDF). */
export function mascararCpfsEmTexto(s: string): string {
  return s.replace(/\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g, (_m, _a: string, b: string, c: string) => `***.${b}.${c}-**`);
}

/** CPF só com 11 dígitos -> ***.xxx.xxx-**; qualquer outra coisa volta igual. */
export function mascararCpfSoDigitos(s: string): string {
  const d = s.trim();
  return /^\d{11}$/.test(d) ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : s;
}

/** Telefone de pessoa física: só os 4 últimos dígitos aparecem. */
export function mascararTelefone(s: string): string {
  const digitos = s.replace(/\D/g, '');
  if (digitos.length <= 4) return s;
  return '*'.repeat(digitos.length - 4) + digitos.slice(-4);
}

/** E-mail de pessoa física: 2 primeiras letras + *** + domínio. */
export function mascararEmail(s: string): string {
  const m = /^([^@\s]+)@(.+)$/.exec(s.trim());
  return m ? `${m[1].slice(0, 2)}***@${m[2]}` : s;
}

const CHAVE_DOC = /(^|_)(cpf|cnpj|doc|documento|cpf_cnpj)(_|$)/i;
const CHAVE_FONE = /(telefone|fone|celular|whatsapp)/i;
const CHAVE_EMAIL = /(e_?mail)/i;

/** Texto sem URL de imagem/arquivo e sem blobs longos (base64): esses valores não vão para tela nem PDF. */
export const ehUrlOuBlob = (s: string): boolean => /^(https?:)?\/\/\S+$/i.test(s.trim()) || /^data:/i.test(s.trim()) || (s.length > 1500 && !/\s/.test(s));

/**
 * Valor de um campo cru, pronto para exibição: CPF mascarado em qualquer padrão, URL/arquivo omitido (null),
 * contatos de pessoa física parcialmente mascarados (`pessoaFisica`).
 */
export function valorSeguro(chave: string, valor: string, pessoaFisica = false): string | null {
  const v = valor.trim();
  if (!v || ehUrlOuBlob(v)) return null;
  const k = semPrefixo(chave);
  if (CHAVE_DOC.test(k) && /^\d{11}$/.test(v)) return mascararCpfSoDigitos(v);
  if (pessoaFisica && CHAVE_FONE.test(k)) return mascararTelefone(v);
  if (pessoaFisica && CHAVE_EMAIL.test(k)) return mascararEmail(v);
  return mascararCpfsEmTexto(v);
}

const NATUREZAS: Record<string, string> = {
  '2062': 'Sociedade Empresária Limitada', '2135': 'Empresário Individual', '2305': 'EIRELI', '2240': 'Sociedade Simples Limitada',
  '2054': 'Sociedade Anônima Fechada', '2046': 'Sociedade Anônima Aberta',
};
/** "2062-" / "206-2" / "206-2 - Sociedade ..." -> texto; código desconhecido fica como veio. */
export function naturezaJuridicaTexto(v: string | null | undefined): string {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = /^(\d{3})-?(\d)\s*(?:-\s*)?(.*)$/.exec(t);
  if (!m) return t;
  const resto = m[3].trim();
  if (resto) return resto;
  return NATUREZAS[m[1] + m[2]] ?? `${m[1]}-${m[2]}`;
}

const ACENTO_FRASE: Record<string, string> = { provavel: 'provável', debitos: 'débitos', proximos: 'próximos', ate: 'até', nao: 'não', e: 'é' };
/** Texto da fonte: separa número colado na palavra ("13APRESENTEM") e, se vier todo em MAIÚSCULAS, vira frase normal acentuada. */
export function frasePelaFonte(t: string | null | undefined): string {
  const s = (t ?? '').replace(/(\d)([A-Za-zÀ-ú])/g, '$1 $2').trim();
  const letras = s.replace(/[^A-Za-zÀ-ú]/g, '');
  if (letras.length < 8 || letras !== letras.toUpperCase()) return s;
  const f = s.toLowerCase().split(/(\s+)/).map((w) => ACENTO_FRASE[w] ?? w).join('');
  return f.charAt(0).toUpperCase() + f.slice(1);
}
