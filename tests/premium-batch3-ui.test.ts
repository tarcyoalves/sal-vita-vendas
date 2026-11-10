import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  csvText,
  csvDigitsAsText,
  csvMoney,
  csvNotesOneLine,
  csvOrderRow,
  buildOrdersCsv,
  CSV_HEADERS,
} from '../client/src/components/premium/admin/adminLogic';
import {
  customerNameError,
  phoneProblem,
  emailTypoSuggestion,
} from '../client/src/components/premium/checkoutLogic';

const admin = readFileSync('client/src/pages/SalVitaAdmin.tsx', 'utf8');
const landing = readFileSync('client/src/pages/SalVitaLanding.tsx', 'utf8');

const STATUS = { confirmed: 'Confirmado', shipped: 'Enviado' };
const PAY = { awaiting: 'Aguardando', confirmed: 'Pago' };

const order = {
  id: 42,
  customerName: 'Maria Souza',
  customerPhone: '(84) 99999-9999',
  customerEmail: 'maria@exemplo.com',
  customerCpf: '012.345.678-90',
  postalCode: '01310-100',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Bela Vista',
  address: 'Av. Paulista',
  number: '1000',
  complement: 'Apto 12',
  quantity: 2,
  product: 'Sal Marinho Integral 1kg',
  shippingPrice: '19.90',
  shippingServiceName: 'Correios PAC',
  totalPrice: '129.90',
  couponCode: 'SALVITA10',
  couponDiscount: '10',
  status: 'shipped',
  paymentStatus: 'confirmed',
  trackingCode: 'AA123456789BR',
  mpPaymentId: '1234567890',
  notes: 'Cliente pediu entrega à tarde\r\n\n  [REVISAR] pagamento duplicado  ',
  createdAt: '2026-11-10T15:30:00.000Z',
};

/** Divide uma linha CSV simples (sem ";" dentro de aspas) em células. */
const cells = (line: string) => line.split(';');

describe('nome do checkout: nome e sobrenome', () => {
  it('exige pelo menos duas palavras', () => {
    expect(customerNameError('Maria')).toBe('Informe nome e sobrenome.');
    expect(customerNameError('   ')).toBe('Informe nome e sobrenome.');
    expect(customerNameError('Maria Souza')).toBeNull();
    expect(customerNameError('  Ana   Paula  ')).toBeNull();
  });
});

describe('telefone do checkout (DDD e celular)', () => {
  const msg = 'Informe DDD + número de celular válido.';
  it('aceita celular com 9 após o DDD e fixo de 10 dígitos', () => {
    expect(phoneProblem('(84) 99999-9999')).toBeNull();
    expect(phoneProblem('84999999999')).toBeNull();
    expect(phoneProblem('(84) 3333-4444')).toBeNull();
    expect(phoneProblem('(99) 99999-9999')).toBeNull();
  });
  it('recusa DDD fora de 11–99', () => {
    expect(phoneProblem('(10) 99999-9999')).toBe(msg);
    expect(phoneProblem('(00) 99999-9999')).toBe(msg);
  });
  it('recusa celular de 11 dígitos sem 9 após o DDD', () => {
    expect(phoneProblem('(84) 88888-8888')).toBe(msg);
  });
  it('recusa tamanho errado e vazio', () => {
    expect(phoneProblem('')).toBe(msg);
    expect(phoneProblem('(84) 9999')).toBe(msg);
    expect(phoneProblem('5584999999999')).toBe(msg);
  });
});

describe('sugestão de e-mail (não bloqueia)', () => {
  it('sugere o domínio correto para erros comuns, mantendo o usuário', () => {
    expect(emailTypoSuggestion('maria@gmial.com')).toBe('maria@gmail.com');
    expect(emailTypoSuggestion('Maria.Silva@HOTMAL.com')).toBe('Maria.Silva@hotmail.com');
    expect(emailTypoSuggestion('ana@outlok.com')).toBe('ana@outlook.com');
    expect(emailTypoSuggestion('ana@yaho.com')).toBe('ana@yahoo.com');
    expect(emailTypoSuggestion('ana@icloud.co')).toBe('ana@icloud.com');
    expect(emailTypoSuggestion('  ana@gamil.com ')).toBe('ana@gmail.com');
  });
  it('não sugere nada para domínio certo, e-mail inválido ou vazio', () => {
    expect(emailTypoSuggestion('maria@gmail.com')).toBeNull();
    expect(emailTypoSuggestion('maria@gmial')).toBeNull();
    expect(emailTypoSuggestion('nao-e-email')).toBeNull();
    expect(emailTypoSuggestion('')).toBeNull();
  });
});

describe('CSV: texto forçado para CEP, CPF e telefone', () => {
  it('emite ="..." só com dígitos, preservando zeros à esquerda', () => {
    expect(csvDigitsAsText('01310-100')).toBe('"=""01310100"""');
    expect(csvDigitsAsText('012.345.678-90')).toBe('"=""01234567890"""');
    expect(csvDigitsAsText('(84) 99999-9999')).toBe('"=""84999999999"""');
  });
  it('campo vazio vira célula vazia', () => {
    expect(csvDigitsAsText(null)).toBe('""');
    expect(csvDigitsAsText('')).toBe('""');
  });
  it('csvText continua protegendo contra fórmula e não emite ="..."', () => {
    expect(csvText('=SOMA(A1)')).toBe('"\'=SOMA(A1)"');
    expect(csvText('Maria')).toBe('"Maria"');
  });
});

describe('CSV: valores e observações', () => {
  it('valores com vírgula decimal, vazio vira 0,00', () => {
    expect(csvMoney('10')).toBe('10,00');
    expect(csvMoney('29.9')).toBe('29,90');
    expect(csvMoney(null)).toBe('0,00');
  });
  it('observações em uma linha, quebras viram " | ", linhas vazias somem', () => {
    expect(csvNotesOneLine('a\r\n\n  b \nc')).toBe('a | b | c');
    expect(csvNotesOneLine(null)).toBe('');
  });
});

describe('CSV: linha de pedido', () => {
  it('cabeçalho e linha têm o mesmo número de colunas', () => {
    const row = csvOrderRow(order, STATUS, PAY);
    expect(cells(row)).toHaveLength(CSV_HEADERS.length);
    expect(CSV_HEADERS).toHaveLength(26);
  });
  it('preenche as colunas novas no final, na ordem combinada', () => {
    const c = cells(csvOrderRow(order, STATUS, PAY));
    const h = (name: string) => c[CSV_HEADERS.indexOf(name)];
    expect(h('Complemento')).toBe('"Apto 12"');
    expect(h('Transportadora')).toBe('"Correios PAC"');
    expect(h('Cupom')).toBe('"SALVITA10"');
    expect(h('Desconto')).toBe('10,00');
    expect(h('Subtotal produtos')).toBe('110,00');
    expect(h('ID pagamento MP')).toBe('"1234567890"');
    expect(h('Observacoes')).toBe('"Cliente pediu entrega à tarde | [REVISAR] pagamento duplicado"');
    expect(h('Rastreio')).toBe('"AA123456789BR"');
  });
  it('CEP, CPF e telefone saem como texto; o restante segue como antes', () => {
    const c = cells(csvOrderRow(order, STATUS, PAY));
    const h = (name: string) => c[CSV_HEADERS.indexOf(name)];
    expect(h('CEP')).toBe('"=""01310100"""');
    expect(h('CPF')).toBe('"=""01234567890"""');
    expect(h('Telefone')).toBe('"=""84999999999"""');
    expect(h('Email')).toBe('"maria@exemplo.com"');
    expect(h('Valor Total')).toBe('129,90');
    expect(h('Status Pedido')).toBe('"Enviado"');
  });
  it('pedido sem cupom nem transportadora não quebra as colunas', () => {
    const c = cells(csvOrderRow({ ...order, couponCode: null, couponDiscount: null, shippingServiceName: null, notes: null, mpPaymentId: null }, STATUS, PAY));
    expect(c).toHaveLength(CSV_HEADERS.length);
    expect(c[CSV_HEADERS.indexOf('Cupom')]).toBe('""');
    expect(c[CSV_HEADERS.indexOf('Desconto')]).toBe('0,00');
    expect(c[CSV_HEADERS.indexOf('Observacoes')]).toBe('""');
  });
  it('nome que começa com "=" continua neutralizado', () => {
    const c = cells(csvOrderRow({ ...order, customerName: '=HYPERLINK("x")' }, STATUS, PAY));
    expect(c[CSV_HEADERS.indexOf('Cliente')]).toBe('"\'=HYPERLINK(""x"")"');
  });
});

describe('CSV: arquivo inteiro', () => {
  it('começa com BOM UTF-8, tem cabeçalho e uma linha por pedido', () => {
    const csv = buildOrdersCsv([order, { ...order, id: 43 }], STATUS, PAY);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADERS.join(';'));
    expect(cells(lines[2])[0]).toBe('43');
  });
});

describe('telas usam as regras novas', () => {
  it('admin: histórico só carrega quando aberto', () => {
    expect(admin).toMatch(/trpc\.shipping\.orderHistory\.useQuery\(\{ orderId: order\.id \}, \{ enabled: showHistory \}\)/);
    expect(admin).toContain('buildOrdersCsv(orders, CSV_STATUS, CSV_PAY)');
  });
  it('landing: valida telefone e nome no envio e sugere e-mail', () => {
    expect(landing).toContain('phoneProblem(checkoutForm.customerPhone)');
    expect(landing).toContain('customerNameError(checkoutForm.customerName)');
    expect(landing).toContain('emailTypoSuggestion(checkoutForm.customerEmail)');
    expect(landing).toContain('Você quis dizer');
  });
});
