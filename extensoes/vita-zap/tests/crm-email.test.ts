// E-mail do lead: regras puras (sugestão, leitura do que o servidor devolve) e o envio em 2 passos do serviço.
import { describe, expect, it, vi } from 'vitest';
import { emailValido, extrairEmails, inscricoesDe, modelosDe, primeiroNome, sugerirEmail } from '../src/shared/crm-email';
import { ErroDoCrm } from '../src/shared/crm-rede';
import { enviarApresentacao, salvarEmailDoLead, type ApoioEmail } from '../src/shared/servico-email';

describe('sugestão de e-mail', () => {
  it('extrai e normaliza, sem repetir e sem o ponto final da frase', () => {
    expect(extrairEmails('Meu email é Ana@Padaria.com.br. Ou ana@padaria.com.br, ou b+x@sub.dominio.net')).toEqual(['ana@padaria.com.br', 'b+x@sub.dominio.net']);
    expect(extrairEmails('sem nada aqui @ casa')).toEqual([]);
  });

  it('prefere a mensagem mais recente, depois a última linha das notas, depois o título', () => {
    expect(sugerirEmail({ mensagens: ['a@x.com', 'oi', 'b@y.com'], notas: 'c@z.com', titulo: 'd@w.com' })).toBe('b@y.com');
    expect(sugerirEmail({ mensagens: ['oi'], notas: 'c@z.com\nlinha\ne@z.com', titulo: 'd@w.com' })).toBe('e@z.com');
    expect(sugerirEmail({ titulo: 'Padaria d@w.com' })).toBe('d@w.com');
    expect(sugerirEmail({ mensagens: ['oi'], notas: '', titulo: 'Padaria' })).toBeNull();
  });

  it('validação do campo', () => {
    expect(emailValido('a@b.co')).toBe(true);
    expect(['a@b', 'a b@c.com', '@c.com', ''].some(emailValido)).toBe(false);
  });

  it('primeiro nome do título', () => {
    expect(primeiroNome('Padaria da Ana - Maria')).toBe('Padaria');
    expect(primeiroNome('  João Silva (cliente)')).toBe('João');
    expect(primeiroNome('')).toBe('');
  });
});

describe('leitura defensiva do servidor', () => {
  it('modelos: ignora lixo, anexos sem conteúdo e aceita attachments null', () => {
    const m = modelosDe([{ id: 1, name: 'A', subject: 'S', htmlBody: '<p>x</p>', attachments: null }, { id: 'x' }, null, { id: 2, name: 'B', subject: 'S2', htmlBody: 'h', attachments: [{ filename: 'a.pdf', content: 'QQ==' }, { filename: 'b.pdf', content: '' }] }]);
    expect(m.map((x) => x.id)).toEqual([1, 2]);
    expect(m[1].anexos).toEqual([{ filename: 'a.pdf', content: 'QQ==' }]);
    expect(modelosDe('erro')).toEqual([]);
  });

  it('inscrições por task', () => {
    const i = inscricoesDe({ 1: { sequences: [{ sequenceId: 9, name: 'S', status: 'active', currentStep: 1 }], campaigns: [{ name: 'C', status: 'sent' }] } }, 1);
    expect(i.sequencias).toEqual([{ sequenceId: 9, nome: 'S', status: 'active', passo: 1 }]);
    expect(inscricoesDe({}, 1)).toEqual({ sequencias: [], campanhas: [] });
  });
});

function apoio(respostas: Record<string, unknown[]>): ApoioEmail & { chamadas: string[] } {
  const chamadas: string[] = [];
  const proximo = (c: string): unknown => {
    chamadas.push(c);
    const r = (respostas[c] ?? []).shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return {
    chamadas,
    consultar: async <T,>(c: string) => proximo(c) as T,
    alterar: async <T,>(c: string) => proximo(c) as T,
    chamar: async <T,>(fn: () => Promise<T>) => {
      try {
        return { ok: true as const, valor: await fn() };
      } catch (e) {
        return { ok: false as const, erro: (e as ErroDoCrm).erro };
      }
    },
    guardarNoCache: vi.fn(async () => undefined),
  };
}
const pedido = { taskId: 1, email: 'A@B.com', nome: 'Ana', assunto: 'S', html: '<p>x</p>' };

describe('enviarApresentacao (serviço)', () => {
  it('cria a campanha e processa o lote até terminar', async () => {
    const ap = apoio({ 'emailMarketing.attendantBroadcast': [{ campaignId: 5 }], 'emailMarketing.processBatch': [{ done: false, sentNow: 0, failedNow: 0, remaining: 1 }, { done: true, sentNow: 1, failedNow: 0, remaining: 0 }] });
    const r = await enviarApresentacao(ap, pedido);
    expect(r).toEqual({ ok: true, valor: { campanhaId: 5, enviados: 1, falhas: 0, pendentes: 0, limiteDiario: false } });
    expect(ap.chamadas).toEqual(['emailMarketing.attendantBroadcast', 'emailMarketing.processBatch', 'emailMarketing.processBatch']);
  });

  it('não chama nada com e-mail inválido ou sem assunto', async () => {
    const ap = apoio({});
    expect((await enviarApresentacao(ap, { ...pedido, email: 'x' })).ok).toBe(false);
    expect((await enviarApresentacao(ap, { ...pedido, assunto: ' ' })).ok).toBe(false);
    expect(ap.chamadas).toEqual([]);
  });

  it('falha no envio depois da campanha criada: erro explícito com o número da campanha', async () => {
    const ap = apoio({ 'emailMarketing.attendantBroadcast': [{ campaignId: 5 }], 'emailMarketing.processBatch': [new ErroDoCrm({ tipo: 'servidor', mensagem: 'boom' })] });
    const r = await enviarApresentacao(ap, pedido);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('campanha 5 foi criada, mas o envio falhou: boom');
  });

  it('no máximo 3 lotes (não fica em laço)', async () => {
    const lote = { done: false, sentNow: 0, failedNow: 0, remaining: 1 };
    const ap = apoio({ 'emailMarketing.attendantBroadcast': [{ campaignId: 5 }], 'emailMarketing.processBatch': [lote, lote, lote, lote] });
    const r = await enviarApresentacao(ap, pedido);
    expect(ap.chamadas.filter((c) => c.endsWith('processBatch'))).toHaveLength(3);
    expect(r).toMatchObject({ ok: true, valor: { enviados: 0, pendentes: 1 } });
  });
});

describe('salvarEmailDoLead (serviço)', () => {
  it('valida antes de chamar o CRM', async () => {
    const ap = apoio({});
    expect((await salvarEmailDoLead(ap, 1, 'nao-e-email')).ok).toBe(false);
    expect(ap.chamadas).toEqual([]);
  });
});
