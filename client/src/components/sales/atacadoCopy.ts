// Textos da página /atacado reunidos num só lugar, para o teste conferir cada um contra as travas
// de conteúdo (server/lib/sales/conteudo.ts). Regras: ESTADO-DO-PROJETO.md, seção 4 — só origem,
// processo, sabor, textura, granulometria e embalagem. Nenhum número entra aqui: valores vêm do servidor.

export const COPY = {
  heroSelo: 'Sal Vita Premium · Atacado',
  heroTitulo: 'Sal marinho integral para o seu negócio',
  heroTexto:
    'Produzido em Mossoró, no Rio Grande do Norte, em caixa para quem revende: minimercados, lojas naturais e de suplementação, empórios e açougues. Restaurantes e churrascarias também usam na cozinha e à mesa.',

  ofertaTitulo: 'A caixa para o seu estoque',
  ofertaPrecoSite: 'Preço no site',
  ofertaPorKg: 'por quilo',
  ofertaComprar: 'Comprar no site',
  ofertaMl: 'Referência no Mercado Livre',
  ofertaMlLink: 'Ver anúncio no Mercado Livre',
  ofertaCarregando: 'Carregando a oferta...',
  ofertaErro: 'Não foi possível carregar a oferta agora. Envie seus dados no formulário abaixo e a equipe responde.',
  dispDisponivel: 'Disponível',
  dispEmFalta: 'Em falta no momento',

  freteTitulo: 'Calcule o frete para o seu CEP',
  freteCep: 'CEP de entrega',
  freteCaixas: 'Número de caixas',
  freteBotao: 'Calcular frete',
  freteCalculando: 'Calculando...',
  freteErro: 'Não foi possível calcular o frete agora. Confira o CEP e tente de novo.',
  freteNotaValidade: 'Cada cotação vale no momento em que é feita: valores e prazos podem mudar depois.',
  freteNotaMl: 'O frete do Mercado Livre não é consultado aqui: ele é calculado no próprio anúncio.',
  freteTabelaEstimada: 'Valores estimados por tabela. O valor final é confirmado ao fechar o pedido no site.',

  simTitulo: 'Simule a revenda',
  simIntro: 'Veja quanto a caixa custa por pacote e quanto sobra se você vender todos os pacotes pelo preço que escolher.',
  simCaixas: 'Número de caixas',
  simPrecoRevenda: 'Preço de revenda por pacote (R$)',
  simFrete: 'Frete (R$)',
  simDespesas: 'Outras despesas (R$)',
  simCustoTotal: 'Custo total',
  simCustoPacote: 'Custo por pacote',
  simReceita: 'Receita potencial',
  simResultado: 'Resultado',
  simMargem: 'Margem',
  simPreencha: 'Informe o preço de revenda por pacote para ver o resultado.',

  porqueTitulo: 'Por que lojistas escolhem',
  porque: [
    {
      titulo: 'Origem em Mossoró/RN',
      texto: 'O sal vem de Mossoró, no Rio Grande do Norte, região tradicional de produção de sal marinho do Brasil.',
    },
    {
      titulo: 'Evaporação solar, sem refino industrial',
      texto: 'A água do mar evapora ao sol e o sal não passa por refino industrial. O resultado é o sabor e a textura do sal marinho integral.',
    },
    {
      titulo: 'Granulometria e textura',
      texto: 'Grão com a textura característica do sal marinho integral, bom para temperar, cozinhar e finalizar o prato.',
    },
    {
      titulo: 'Pacotes prontos para revenda',
      texto: 'A caixa traz pacotes individuais com fecho zip-lock, prontos para a prateleira e fáceis de reabrir e guardar. Você vende por pacote, sem precisar fracionar.',
    },
  ],

  formTitulo: 'Quero vender Sal Vita no meu negócio',
  formIntro: 'Preencha os dados abaixo. Um atendente humano fala com você para passar tabela e condições.',
  formEnviado: 'Recebemos seu contato!',
  formEnviadoTexto:
    'Nossa equipe comercial vai analisar e retornar em breve com a tabela de preços e condições para o seu negócio. Se preferir, fale com a gente agora pelo WhatsApp.',
  rodape: 'Sal Vita — Sal Marinho Premium de Mossoró/RN. Seus dados são usados apenas para contato comercial.',
} as const;

/** Texto exato do consentimento do formulário de contato. Não alterar sem o dono. */
export const CONSENT_TEXT =
  'Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.';

/** Todas as frases de COPY como lista plana, para o teste. */
export function todosOsTextos(): string[] {
  const out: string[] = [CONSENT_TEXT];
  for (const v of Object.values(COPY)) {
    if (typeof v === 'string') out.push(v);
    else for (const item of v) out.push(item.titulo, item.texto);
  }
  return out;
}

export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "2026-11-20" (sem hora) é data de calendário: não passa por fuso, senão mostra o dia anterior. */
export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
