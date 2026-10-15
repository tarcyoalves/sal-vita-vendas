import { STORE_URL } from '../lib/storeUrl';

/**
 * Follow-up pós-compra da loja Premium (plano: docs/PLANO-FOLLOWUP-POS-COMPRA.md, §8 prevalece).
 * Arquivo SEM acesso a banco: é importado pelo motor, pelo cron e pela migração
 * (`ordersMigrate.ts`), e os testes leem os textos daqui.
 *
 * Regras de texto (ESTADO-DO-PROJETO §4): nada de alegação de saúde, minerais, pureza ou
 * benefício; nada de "100% natural"; preços só os reais (1 kg R$ 29,90; Trio 3 kg R$ 74,90 =
 * R$ 24,97/kg; Caixa 10 kg R$ 149,90 = R$ 14,99/kg); sem cupom.
 */

export const POS_COMPRA_NAME = 'Pós-compra';
export const RELACIONAMENTO_NAME = 'Relacionamento mensal';
export const FOLLOWUP_SEQUENCE_NAMES = [POS_COMPRA_NAME, RELACIONAMENTO_NAME] as const;

/** Evento em `shipping_events` que marca "este pedido já foi inscrito" (trava de inscrição única). */
export const FOLLOWUP_EVENT = 'followup-enrolled';

/**
 * Corte da base antiga (decisão do dono, 15/10/2026): só pedidos criados a partir da data de
 * publicação entram no follow-up. Quem comprou antes NÃO é inscrito, nem retroativamente.
 * Não mude esta data para trás sem o dono pedir.
 */
export const FOLLOWUP_ENROLL_SINCE = new Date('2026-10-15T00:00:00-03:00');

/** Dias após o pagamento em que o pedido entra mesmo sem a entrega confirmada (fallback do Melhor Envio). */
export const FOLLOWUP_FALLBACK_DAYS = 10;

/** Teto diário de e-mails de SEQUÊNCIAS (marketing); sobra cota do provedor para os transacionais. */
export function followupDailyCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.FOLLOWUP_DAILY_CAP ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** O lembrete de recompra por WhatsApp fica desligado, salvo `REORDER_WHATSAPP=on` (decisão do dono). */
export function reorderWhatsappEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REORDER_WHATSAPP === 'on';
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valor de `{link_loja}`: a loja com UTM, para medir pedidos vindos do e-mail (utm_medium=posvenda). */
export function buildStoreLink(sequenceName: string, stepOrder: number): string {
  const campaign = `${slugify(sequenceName)}-${stepOrder}`;
  return `${STORE_URL}/?utm_source=email&utm_medium=posvenda&utm_campaign=${campaign}`;
}

export interface FollowupStepDef {
  stepOrder: number;
  delayDays: number;
  subject: string;
  htmlBody: string;
  sendCondition: 'always' | 'if_not_opened';
}

export interface FollowupSequenceDef {
  name: string;
  description: string;
  repeat: boolean;
  repeatIntervalDays: number | null;
  steps: FollowupStepDef[];
}

const P = 'style="margin:0 0 16px;line-height:1.6;color:#334155;"';
const para = (t: string) => `<p ${P}>${t}</p>`;
const loja = (t: string) =>
  `<p ${P}><a href="{link_loja}" style="color:#0C3680;font-weight:600;">${t}</a></p>`;
const assinatura = para('Um abraço,<br/>Equipe Sal Vita, Mossoró/RN');
const sair = `<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Não quer mais receber nossos e-mails? <a href="{unsubscribe}" style="color:#0C3680;">Clique aqui para sair da lista</a>.</p>`;
const corpo = (...blocos: string[]) => [...blocos, assinatura, sair].join('\n');

const PRECOS = `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.7;color:#334155;">
<li>Pacote de 1 kg: R$ 29,90</li>
<li>Trio de 3 kg: R$ 74,90, ou R$ 24,97 o quilo</li>
<li>Caixa de 10 kg: R$ 149,90, ou R$ 14,99 o quilo</li>
</ul>`;

/**
 * "Pós-compra": 4 e-mails por pedido.
 *
 * Conta dos atrasos (delay_days é contado a partir do e-mail anterior). A inscrição acontece na
 * entrega (status delivered) ou, se o Melhor Envio não informar, 10 dias depois do pagamento.
 * Chamando de E o dia da inscrição contado da compra (entrega comum: 4 a 8 dias; fallback: 10):
 *   passo 1 = dia E (na hora da inscrição)
 *   passo 2 = E + 12
 *   passo 3 = E + 12 + 10 = E + 22  -> 26 a 30 dias da compra na entrega comum, 32 no fallback
 *   passo 4 = passo 3 + 7, só se o passo 3 não foi aberto.
 * O alvo do dono é "30 dias após a compra"; 10 dias de atraso no passo 3 erra no máximo ±4 dias
 * (o cron é diário). Ao terminar, o motor inscreve em "Relacionamento mensal".
 */
export const POS_COMPRA: FollowupSequenceDef = {
  name: POS_COMPRA_NAME,
  description:
    'Quatro e-mails depois da entrega: como foi, usos na cozinha, hora de repor e preço por quilo. Ao terminar, passa para o Relacionamento mensal.',
  repeat: false,
  repeatIntervalDays: null,
  steps: [
    {
      stepOrder: 1,
      delayDays: 0,
      sendCondition: 'always',
      subject: 'Chegou bem, {nome}?',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'Aqui é da Sal Vita, lá de Mossoró. Seu pedido já deve ter chegado e queremos saber se veio tudo certo.'
        ),
        para(
          'Uma dica simples de guarda: depois de usar, feche bem o zip lock e deixe o pacote em local seco e longe do fogão.'
        ),
        para(
          'Se algo veio diferente do esperado, é só responder este e-mail. Aqui quem responde é gente de verdade, e a gente resolve.'
        )
      ),
    },
    {
      stepOrder: 2,
      delayDays: 12,
      sendCondition: 'always',
      subject: 'Três jeitos de usar o Sal Vita na cozinha',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para('Três ideias de quem usa sal todo dia:'),
        '<ol style="margin:0 0 16px;padding-left:20px;line-height:1.7;color:#334155;">' +
          '<li><strong>No preparo:</strong> sal na água do arroz e do feijão, e no refogado, do jeito que você já faz.</li>' +
          '<li><strong>Na carne:</strong> temperar um pouco antes de ir para a brasa ou para a frigideira.</li>' +
          '<li><strong>Na finalização:</strong> uma pitada na mesa, no ponto, em vez de salgar tudo na panela.</li>' +
          '</ol>',
        para('Se quiser ver os pacotes de novo, a loja está aqui:'),
        loja('Ver a loja Sal Vita')
      ),
    },
    {
      stepOrder: 3,
      delayDays: 10,
      sendCondition: 'always',
      subject: 'Hora de repor o sal, {nome}?',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'Já faz cerca de um mês desde o seu pedido. Se o pacote está chegando ao fim, o novo pedido leva poucos minutos.'
        ),
        loja('Fazer um novo pedido'),
        para('Obrigado por ter escolhido o sal de Mossoró.')
      ),
    },
    {
      stepOrder: 4,
      delayDays: 7,
      sendCondition: 'if_not_opened',
      subject: 'A caixa de 10 kg sai a R$ 14,99 o quilo',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para('Caso o e-mail anterior tenha passado batido, aqui vai o preço por quilo de cada pacote da loja:'),
        PRECOS,
        para('Quem usa bastante costuma ficar com a caixa de 10 kg, que sai mais barata por quilo.'),
        loja('Ver os pacotes')
      ),
    },
  ],
};

/**
 * "Relacionamento mensal": 6 e-mails, um a cada 30 dias, em loop (repeat) até a pessoa sair ou
 * comprar de novo (a compra nova cancela e reinicia pelo "Pós-compra"). Alterna conteúdo e
 * oferta, nunca duas ofertas seguidas. O primeiro sai 30 dias depois do fim do "Pós-compra".
 */
export const RELACIONAMENTO: FollowupSequenceDef = {
  name: RELACIONAMENTO_NAME,
  description:
    'Um e-mail por mês, alternando conteúdo e oferta. Repete o ciclo de 6 e-mails até a pessoa sair da lista ou comprar de novo.',
  repeat: true,
  repeatIntervalDays: 30,
  steps: [
    {
      stepOrder: 1,
      delayDays: 30,
      sendCondition: 'always',
      subject: 'Da salina de Mossoró à sua mesa',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'O sal que você compra aqui nasce em Mossoró, no Rio Grande do Norte, onde fica boa parte das salinas do Brasil. A água do mar entra nos tanques e o sol faz o resto, por evaporação solar.'
        ),
        para(
          'Depois o sal passa por seleção, moagem, iodação e embalagem em pacote com zip lock e janela, para você ver o que está levando.'
        ),
        loja('Conhecer a loja')
      ),
    },
    {
      stepOrder: 2,
      delayDays: 30,
      sendCondition: 'always',
      subject: 'O sal acabando? Veja o preço por quilo',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para('Se está na hora de repor, estes são os preços atuais:'),
        PRECOS,
        loja('Fazer um novo pedido')
      ),
    },
    {
      stepOrder: 3,
      delayDays: 30,
      sendCondition: 'always',
      subject: 'Ideias para o churrasco de fim de ano',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'Fim de ano é época de reunir a família e acender a brasa. Algumas ideias para a mesa:'
        ),
        '<ul style="margin:0 0 16px;padding-left:20px;line-height:1.7;color:#334155;">' +
          '<li>Tempere a carne com um pouco de antecedência e acerte o ponto na hora de servir.</li>' +
          '<li>Deixe um pote de sal na mesa para cada um ajustar o seu prato.</li>' +
          '<li>Na ceia, salgue aos poucos e prove no caminho.</li>' +
          '</ul>',
        loja('Ver a loja Sal Vita')
      ),
    },
    {
      stepOrder: 4,
      delayDays: 30,
      sendCondition: 'always',
      subject: 'Indique o Sal Vita para alguém',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'Conhece alguém que gosta de cozinhar e ainda não conhece o sal de Mossoró da Sal Vita? É só encaminhar este e-mail ou mandar o link da loja:'
        ),
        loja('Link da loja Sal Vita'),
        para('Não tem prêmio nem regra: é só uma indicação de quem já provou.')
      ),
    },
    {
      stepOrder: 5,
      delayDays: 30,
      sendCondition: 'always',
      subject: 'Caixa de 10 kg para quem cozinha muito',
      htmlBody: corpo(
        para('Olá, {nome}!'),
        para(
          'Para quem usa sal no dia a dia, a caixa de 10 kg é a opção que sai mais barata por quilo: R$ 149,90 a caixa, ou R$ 14,99 o quilo. O pacote de 1 kg custa R$ 29,90.'
        ),
        loja('Ver a caixa de 10 kg')
      ),
    },
    {
      stepOrder: 6,
      delayDays: 30,
      sendCondition: 'always',
      subject: '{nome}, quer continuar recebendo nossos e-mails?',
      htmlBody: [
        para('Olá, {nome}!'),
        para(
          'Faz um tempo que escrevemos para você uma vez por mês. Queremos só mandar o que você gosta de receber.'
        ),
        para(
          '<strong>Se quiser continuar, não precisa fazer nada.</strong> Se preferir parar, é só clicar abaixo e você sai da lista na hora:'
        ),
        `<p style="margin:0 0 20px;font-size:17px;"><strong><a href="{unsubscribe}" style="color:#0C3680;">Quero sair da lista</a></strong></p>`,
        para('Quando precisar de sal, a loja continua aqui:'),
        loja('Ver a loja Sal Vita'),
        assinatura,
        sair,
      ].join('\n'),
    },
  ],
};

export const FOLLOWUP_SEQUENCES: FollowupSequenceDef[] = [POS_COMPRA, RELACIONAMENTO];
