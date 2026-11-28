// Rascunhos iniciais da base do vendedor virtual por tipo de cliente. NADA aqui chega ao modelo
// até o dono aprovar cada item no painel (importarKb grava sempre como 'draft').
// Regras: só origem, processo, sabor, granulometria e logística. Sem saúde, sem número de mineral,
// sem ausência de aditivo, sem "natural" como descrição, sem preço/prazo/desconto (o servidor escreve).
import type { KbEntrada } from './kbPuro';

export const KB_SEMENTE_RASCUNHO: KbEntrada[] = [
  {
    kind: 'produto', key: 'produto-origem-processo', title: 'Origem e processo',
    content: 'O Sal Vita Premium é um sal marinho integral de Mossoró, no Rio Grande do Norte. A secagem é feita por evaporação solar e não passa por refino industrial. A embalagem é zip lock com janela; a caixa traz 10 embalagens de 1 kg.',
  },
  {
    kind: 'produto', key: 'produto-sabor-granulometria', title: 'Sabor e granulometria',
    content: 'Grãos de tamanho médio, com sabor de sal marinho e umidade característica do processo. Dissolve bem em carnes, peixes e preparos do dia a dia.',
  },
  {
    kind: 'objecao', key: 'objecao-minimercado-giro', title: 'Mini mercado: giro do 1 kg avulso',
    content: 'Para mini mercado, a caixa chega com 10 embalagens de 1 kg que podem ser expostas e vendidas avulsas. Sugira começar com uma caixa para testar a saída na prateleira e repetir o pedido conforme o giro. Não prometa margem nem velocidade de venda; ofereça o simulador de revenda, que faz a conta com os números do próprio lojista.',
  },
  {
    kind: 'objecao', key: 'objecao-emporio', title: 'Empório e loja de produtos naturais',
    content: 'Destaque a origem em Mossoró, a secagem por evaporação solar, a embalagem zip lock com janela e o visual da caixa. Não fale de composição.',
  },
  {
    kind: 'objecao', key: 'objecao-suplementos', title: 'Loja de suplementação',
    content: 'Esta é a área de maior cuidado. O Sal Vita Premium é sal de cozinha: fale apenas de origem, processo, sabor e granulometria. Se perguntarem sobre treino, atletas, efeito no corpo ou qualquer benefício, não concorde nem sugira nada; diga que não faz esse tipo de afirmação e ofereça chamar um atendente.',
  },
  {
    kind: 'objecao', key: 'objecao-acougue-churrascaria', title: 'Açougue e churrascaria',
    content: 'Uso em carnes e na grelha: pode-se falar de sabor e de granulometria. Sugira testar uma caixa no próprio churrasco.',
  },
  {
    kind: 'objecao', key: 'objecao-restaurante-peixaria', title: 'Restaurante, peixaria e hortifruti',
    content: 'Uso na cozinha e no preparo de peixes e hortaliças: sabor e granulometria. A caixa de 10 kg facilita a reposição. Para volumes maiores, chame um atendente.',
  },
  {
    kind: 'resposta_padrao', key: 'resposta-sem-info', title: 'Quando não há informação aprovada',
    content: 'Não temos essa informação aprovada. Posso chamar um atendente da Sal Vita para responder.',
  },
];
