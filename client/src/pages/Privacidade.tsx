import type { ReactNode } from 'react';
import ConsentBanner from '../components/premium/ConsentBanner';
import { openConsentPreferences } from '../components/premium/pixelConsent';

// Política de privacidade da loja Premium (host premium). O texto descreve o que o código
// faz hoje (SalVitaLanding, TrackOrder, Atacado, shipping, recovery, orderConfirmation).
// Se o comportamento mudar, o texto muda junto — não declare aqui o que o código não faz.

export const LEGAL_UPDATED = '14 de outubro de 2026';
const MAIL = 'contato@salvitarn.com.br';

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #060f20 0%, #0a1830 50%, #060f20 100%)',
  fontFamily: "'Outfit', 'Inter', sans-serif",
  color: 'rgba(255,255,255,0.82)',
};
const linkStyle: React.CSSProperties = { color: '#e0bf54', textDecoration: 'underline', textUnderlineOffset: 3 };

export function LegalPage({ title, intro, children, other }: {
  title: string; intro: string; children: ReactNode; other: { href: string; label: string };
}) {
  return (
    <div style={wrap}>
      <style>{`
        .legal h2{font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:700;color:#fff;margin:36px 0 10px;line-height:1.2}
        .legal p,.legal li{font-size:1rem;line-height:1.7;margin:0 0 10px;overflow-wrap:anywhere}
        .legal ul{padding-left:22px;margin:0 0 10px}
        .legal strong{color:#fff}
      `}</style>
      <header style={{ padding: '20px 24px', borderBottom: '1px solid rgba(201,162,39,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <a href="/" style={{ textDecoration: 'none' }} aria-label="Sal Vita Premium, página inicial">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: 40, width: 'auto' }} aria-hidden="true">
            <defs><clipPath id="oval-legal"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,0.08)"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-legal)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="15"/>
          </svg>
        </a>
        <a href="/" style={{ ...linkStyle, fontSize: 14 }}>← Voltar à loja</a>
      </header>
      <main className="legal" style={{ maxWidth: 760, margin: '0 auto', padding: '44px 20px 72px' }}>
        <p style={{ fontSize: '.8rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#c9a227', margin: '0 0 8px' }}>Sal Vita Premium</p>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2rem,6vw,2.8rem)', fontWeight: 700, color: '#fff', margin: '0 0 14px', lineHeight: 1.1 }}>{title}</h1>
        <p>{intro}</p>
        <p style={{ fontSize: '.88rem', color: 'rgba(255,255,255,0.6)' }}>Este texto descreve o funcionamento atual da loja. Última atualização: {LEGAL_UPDATED}.</p>
        {children}
        <nav aria-label="Outros documentos" style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
          <a href={other.href} style={linkStyle}>{other.label}</a>
          <a href="/" style={linkStyle}>Voltar à loja</a>
        </nav>
      </main>
    </div>
  );
}

export default function Privacidade() {
  return (
    <>
    <LegalPage
      title="Política de privacidade"
      intro="Explicamos aqui quais dados pessoais a loja Sal Vita Premium (premium.salvitarn.com.br) coleta, por quê, com quem os compartilha e como você exerce seus direitos pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018)."
      other={{ href: '/termos', label: 'Termos e trocas' }}
    >
      <h2>1. Quem é o controlador</h2>
      <p>
        <strong>A S Comércio e Moagem de Sal Ltda</strong>, CNPJ 51.422.900/0001-68, Av. Industrial Dehuel Vieira Diniz, 505, Sala 110,
        Monsenhor Américo, Mossoró/RN, CEP 59613-690. Contato para assuntos de privacidade:{' '}
        <a style={linkStyle} href={`mailto:${MAIL}`}>{MAIL}</a> ou WhatsApp{' '}
        <a style={linkStyle} href="https://wa.me/558421408212" target="_blank" rel="noopener noreferrer">(84) 2140-8212</a>.
      </p>

      <h2>2. Dados que coletamos e para quê</h2>
      <p><strong>Ao comprar na loja</strong> (formulário de entrega):</p>
      <ul>
        <li>Nome, telefone/WhatsApp e e-mail: identificar o pedido, falar com você sobre ele e enviar a confirmação.</li>
        <li>CPF: exigido para a nota fiscal e para o pagamento e a etiqueta de envio.</li>
        <li>Endereço e CEP: calcular o frete antes do pagamento e entregar o pedido.</li>
        <li>Produto, quantidade, valor, forma de pagamento e situação do pagamento.</li>
        <li>Endereço IP e navegador (user agent) usados na hora do pedido, além dos identificadores do Meta descritos no item 4.</li>
        <li>Parâmetros de campanha da URL (utm_source, utm_medium, utm_campaign, utm_content, utm_term e fbclid), para saber de qual anúncio veio o pedido.</li>
      </ul>
      <p><strong>Durante o preenchimento do pedido (antes de concluir):</strong> assim que você informa nome e telefone no formulário, a loja registra esses dados,
        o e-mail (se preenchido), a quantidade escolhida e o CEP, além de até que etapa você chegou. Isso permite que a equipe retome o contato se o pedido não for concluído.</p>
      <p><strong>Ao falar com o assistente do site:</strong> as mensagens que você digita são enviadas ao servidor da loja e a um provedor de inteligência artificial (Groq) para gerar a resposta.</p>
      <p><strong>Formulário de atacado (/atacado):</strong> nome da empresa, nome do responsável, e-mail, WhatsApp, cidade, estado, segmento, volume de interesse e mensagem, mediante o seu consentimento marcado no formulário, para a equipe comercial entrar em contato.</p>
      <p><strong>Acompanhamento do pedido (/meu-pedido):</strong> o link do pedido contém um código de acesso próprio; ele é usado só para mostrar o andamento do seu pedido.</p>

      <h2>3. Mensagens por WhatsApp e e-mail sobre pedidos e carrinhos não concluídos</h2>
      <p>
        Se você informar seu telefone (e e-mail) e não concluir a compra, ou se o pagamento ficar pendente ou falhar, a loja pode enviar lembretes por
        WhatsApp e por e-mail com o link para finalizar o pedido, inclusive em sequência de mensagens e, em alguns casos, com cupom de desconto.
        Também enviamos mensagens sobre o andamento do pedido, como a confirmação e o código de rastreio.
      </p>
      <p>
        <strong>Como parar de receber:</strong> as mensagens trazem a orientação para responder <strong>PARAR</strong>. Você também pode pedir a qualquer momento por{' '}
        <a style={linkStyle} href={`mailto:${MAIL}`}>{MAIL}</a> ou pelo WhatsApp (84) 2140-8212, e a equipe registra que você não quer mais receber lembretes automáticos.
        Nos e-mails de marketing há também um link de descadastro.
      </p>

      <h2>4. Meta (Facebook/Instagram): Pixel e API de Conversões</h2>
      <p>
        <strong>O Pixel da Meta só é carregado se você clicar em "Aceitar"</strong> no aviso de cookies. Se você recusar ou não responder, ele não é
        carregado e ele não envia nada à Meta. A base legal do Pixel no navegador é o seu <strong>consentimento</strong>, que você pode mudar a qualquer momento
        (veja o item 5).
      </p>
      <p>
        Quando aceito, o Pixel mede visitas e etapas da compra (visualização de produto, adição ao carrinho, início do checkout,
        pagamento e compra) e ajuda a avaliar nossos anúncios.
        As páginas de acompanhamento de pedido e as de administração não carregam o Pixel com o código do pedido na URL.
      </p>
      <p>
        Separadamente do Pixel, quando um pagamento é confirmado o servidor da loja pode enviar o evento de compra
        diretamente à Meta (API de Conversões), com o valor do pedido e dados de contato <strong>criptografados por hash</strong> (como e-mail, telefone,
        nome, cidade, estado e CEP), mais IP, navegador e os identificadores de cookie do Meta (_fbp e _fbc) quando existem.
        Esses identificadores só existem no seu navegador se você aceitou o Pixel. A escolha do aviso de cookies vale para o Pixel no navegador; esse envio do servidor,
        feito apenas depois de um pagamento confirmado, tem base no legítimo interesse (item 7).
      </p>

      <h2>5. Dados guardados no seu navegador</h2>
      <ul>
        <li><strong>Dados do formulário</strong> (nome, telefone, e-mail e endereço; <strong>não</strong> o CPF) ficam salvos no seu aparelho por até 30 dias para preencher o pedido
          de novo; depois disso são apagados.</li>
        <li>Parâmetros de campanha (UTM e fbclid) e o pedido pendente de pagamento ficam salvos no aparelho para você poder retomar a compra e para a medição dos anúncios.</li>
        <li>Cookies do Meta Pixel (_fbp e _fbc), <strong>somente se você aceitou o Pixel</strong>.</li>
        <li>A sua escolha no aviso de cookies (aceitar ou recusar), para não perguntar de novo a cada visita.</li>
      </ul>
      <p>Você pode apagar esses dados a qualquer momento limpando os dados do site no navegador.</p>
      <p>
        <strong>Como mudar a sua escolha sobre cookies:</strong> clique em{' '}
        <button type="button" onClick={openConsentPreferences} style={{ ...linkStyle, background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}>Preferências de cookies</button>
        {' '}para abrir o aviso de novo e escolher Aceitar ou Recusar. Ao recusar depois de ter aceitado, o Pixel é desligado e os cookies do Meta são apagados.
      </p>

      <h2>6. Com quem compartilhamos</h2>
      <p>Compartilhamos dados apenas na medida necessária para operar a loja, com:</p>
      <ul>
        <li><strong>Mercado Pago:</strong> processamento do pagamento (PIX, cartão em até 3x e boleto).</li>
        <li><strong>Melhor Envio e a transportadora escolhida (Correios, Jadlog, Azul Cargo ou J&amp;T Express):</strong> cotação de frete, geração de etiqueta e entrega, com nome, endereço, contato e CPF do destinatário.</li>
        <li><strong>Meta:</strong> medição de anúncios, conforme o item 4.</li>
        <li><strong>Resend:</strong> envio de e-mails.</li>
        <li><strong>Serviço de mensagens do WhatsApp:</strong> envio das mensagens descritas no item 3.</li>
        <li><strong>Groq:</strong> geração de respostas do assistente do site.</li>
        <li><strong>Vercel e Neon:</strong> hospedagem do site e banco de dados em nuvem.</li>
      </ul>
      <p>Também podemos tratar dados para cumprir obrigações legais, como as fiscais. Alguns desses fornecedores podem processar dados fora do Brasil.</p>

      <h2>7. Bases legais</h2>
      <ul>
        <li><strong>Execução de contrato</strong> (LGPD, art. 7º, V): dados do pedido, entrega, pagamento e mensagens sobre o pedido.</li>
        <li><strong>Obrigação legal</strong> (art. 7º, II): CPF e dados para nota fiscal.</li>
        <li><strong>Legítimo interesse</strong> (art. 7º, IX): lembretes de carrinho ou pagamento pendente, o envio da compra confirmada à Meta pelo servidor (item 4) e prevenção a abusos.</li>
        <li><strong>Consentimento</strong> (art. 7º, I): Pixel da Meta no navegador (aviso de cookies), formulário de atacado e contato comercial; você pode retirá-lo quando quiser.</li>
      </ul>

      <h2>8. Seus direitos (LGPD, art. 18)</h2>
      <p>Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados; acesso; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; eliminação dos dados tratados com consentimento; informação sobre com quem os compartilhamos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      <p>Para exercer qualquer desses direitos, escreva para <a style={linkStyle} href={`mailto:${MAIL}`}>{MAIL}</a>. Para sua segurança, podemos pedir informações para confirmar que o pedido vem do titular dos dados.</p>

      <h2>9. Alterações</h2>
      <p>Se o funcionamento da loja mudar, esta política será atualizada e a data acima, alterada.</p>
    </LegalPage>
      <ConsentBanner />
    </>
  );
}
