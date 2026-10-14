import { LegalPage } from './Privacidade';

// Termos de compra da loja Premium. Só afirma o que o site e o código já mostram
// (preços, frete por CEP, formas de pagamento) mais o que o CDC garante por lei.
// Não acrescente prazo de postagem, frete grátis ou garantia extra sem confirmação do dono.

const MAIL = 'contato@salvitarn.com.br';
const linkStyle: React.CSSProperties = { color: '#e8c547', textDecoration: 'underline', textUnderlineOffset: 3 };

export default function Termos() {
  return (
    <LegalPage
      title="Termos e trocas"
      intro="Condições para comprar na loja Sal Vita Premium (premium.salvitarn.com.br). Ao concluir um pedido você declara que leu e concorda com elas."
      other={{ href: '/privacidade', label: 'Política de privacidade' }}
    >
      <h2>1. Quem vende</h2>
      <p>
        <strong>A S Comércio e Moagem de Sal Ltda</strong>, CNPJ 51.422.900/0001-68, Av. Industrial Dehuel Vieira Diniz, 505, Sala 110,
        Monsenhor Américo, Mossoró/RN, CEP 59613-690. E-mail: <a style={linkStyle} href={`mailto:${MAIL}`}>{MAIL}</a>.
        WhatsApp: <a style={linkStyle} href="https://wa.me/558421408212" target="_blank" rel="noopener noreferrer">(84) 2140-8212</a>.
      </p>

      <h2>2. Produtos e preços</h2>
      <p>Vendemos o Sal Vita Premium (sal marinho não refinado, iodado conforme a legislação) nas seguintes opções:</p>
      <ul>
        <li>1 kg (uma embalagem zip lock): R$ 29,90</li>
        <li>Trio 3 kg (3 embalagens de 1 kg): R$ 74,90</li>
        <li>Caixa 10 kg (10 embalagens de 1 kg): R$ 149,90</li>
      </ul>
      <p>O valor que vale é o exibido no checkout antes do pagamento, somado ao frete. Cupons, quando aplicáveis, aparecem no checkout.</p>

      <h2>3. Frete e entrega</h2>
      <p>O frete é calculado pelo seu CEP, antes do pagamento, e o envio é feito pela transportadora que você escolher entre as oferecidas (Correios, Jadlog, Azul Cargo ou J&amp;T Express), por meio do Melhor Envio, com código de rastreio. O valor e o prazo exibidos no checkout são os do serviço que você escolher. Você pode acompanhar o pedido em <a style={linkStyle} href="/meu-pedido">/meu-pedido</a>.</p>
      <p>Confira com atenção o endereço e o CEP informados: eles definem o frete e o destino da entrega.</p>

      <h2>4. Pagamento</h2>
      <p>O pagamento é processado pelo Mercado Pago: PIX, cartão em até 3x ou boleto. O pedido é confirmado quando o pagamento é aprovado. Os dados do cartão são digitados no ambiente do Mercado Pago, e não ficam com a Sal Vita.</p>

      <h2>5. Direito de arrependimento</h2>
      <p>Por ser uma compra feita pela internet, você pode desistir do pedido em até <strong>7 dias corridos a contar do recebimento</strong> do produto, sem precisar justificar (Código de Defesa do Consumidor, art. 49). Nesse caso, os valores pagos, inclusive o frete, serão devolvidos. Para exercer o direito, avise-nos pelo e-mail ou WhatsApp acima, informando o número do pedido.</p>

      <h2>6. Produto com defeito ou problema</h2>
      <p>Se o produto chegar com vício ou defeito, você tem o prazo de <strong>30 dias</strong>, contado da entrega, para reclamar, por se tratar de produto não durável (CDC, arts. 18 e 26). Entre em contato pelo e-mail ou WhatsApp com o número do pedido e, se possível, fotos da embalagem e do produto. Os direitos previstos no art. 18 do CDC continuam valendo.</p>

      <h2>7. Atendimento</h2>
      <p>Dúvidas, pedidos de troca ou desistência: <a style={linkStyle} href={`mailto:${MAIL}`}>{MAIL}</a> ou WhatsApp <a style={linkStyle} href="https://wa.me/558421408212" target="_blank" rel="noopener noreferrer">(84) 2140-8212</a>.</p>

      <h2>8. Dados pessoais</h2>
      <p>O tratamento dos seus dados está descrito na <a style={linkStyle} href="/privacidade">Política de privacidade</a>.</p>
    </LegalPage>
  );
}
