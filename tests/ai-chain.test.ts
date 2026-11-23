// IA do CRM sobre a cadeia de server/lib/llm.ts: ordem dos provedores, fallback, tool-calling, erro tipado.
// tests/setup-env.ts limpa as variáveis de provedor: cada teste define as suas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.JWT_SECRET ??= 'segredo-so-para-teste'; });
vi.mock('../server/db', () => ({ db: {} }));

import { chamarComFerramentas, chamarLLM, executarNaCadeia, AI_INDISPONIVEL } from '../server/lib/aiChain';
import { aiRouter } from '../server/routers/ai';

const ENV = { ANTIGRAVITY02_BASE_URL: 'https://x.test/v1', ANTIGRAVITY02_API_KEY: 'k02', ANTIGRAVITY02_MODEL: 'm02', GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c' };
const resp = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const texto = (t: string) => resp(200, { choices: [{ message: { content: t } }] });
const chamadaDeTool = (id = 't1') => resp(200, { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] } }] });

let fetchMock: ReturnType<typeof vi.fn>;
const hosts = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])).host);
const bodyDe = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1].body));

beforeEach(() => {
  Object.assign(process.env, ENV);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const simples = (cfgFn = (cfg: any, prazo: any) => chamarLLM(cfg, prazo, [{ role: 'user', content: 'oi' }])) => executarNaCadeia(cfgFn, { label: 'T' });

describe('executarNaCadeia', () => {
  it('chama antigravity02 primeiro, com o modelo e a chave dele', async () => {
    fetchMock.mockResolvedValueOnce(texto('ok'));
    const r = await simples();
    expect(r).toEqual({ text: 'ok', provider: 'antigravity02' });
    expect(hosts()).toEqual(['x.test']);
    expect(bodyDe(0).model).toBe('m02');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer k02');
  });

  it('5xx no primeiro: cai para o próximo (groq)', async () => {
    fetchMock.mockResolvedValueOnce(resp(503, { error: 'x' })).mockResolvedValueOnce(texto('do groq'));
    const r = await simples();
    expect(r.provider).toBe('groq');
    expect(hosts()).toEqual(['x.test', 'api.groq.com']);
  });

  it('erro de rede também cai para o próximo', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(texto('ok'));
    expect((await simples()).provider).toBe('groq');
  });

  it('cadeia inteira falha: loga a linha única e lança SERVICE_UNAVAILABLE com a mensagem combinada', async () => {
    fetchMock.mockResolvedValue(resp(500, {}));
    const e = await simples().catch((x) => x);
    expect(e).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: AI_INDISPONIVEL });
    expect(AI_INDISPONIVEL).toBe('A IA está indisponível agora. Avise o administrador.');
    expect(console.warn).toHaveBeenCalledWith('[T] cadeia inteira falhou: antigravity02=500,groq=500,cerebras=500');
  });

  it('sem nenhum provedor configurado: SERVICE_UNAVAILABLE sem chamar a rede', async () => {
    for (const k of Object.keys(ENV)) delete process.env[k];
    await expect(simples()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('o prazo total é compartilhado: sem tempo, não tenta os provedores seguintes', async () => {
    fetchMock.mockResolvedValue(resp(500, {}));
    await expect(executarNaCadeia((cfg, prazo) => chamarLLM(cfg, prazo, []), { label: 'T', prazoMs: 500 })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('chamarComFerramentas', () => {
  const tools = [{ type: 'function', function: { name: 'list_tasks' } }];
  const op = (executar = vi.fn(async () => ({ ok: 1 }))) => ({ executar, permitida: () => true });
  const rodar = (o = op(), maxRodadas?: number) => executarNaCadeia((cfg, prazo) => chamarComFerramentas(cfg, prazo, [{ role: 'user', content: 'oi' }], tools, { ...o, maxRodadas }), { label: 'T' });

  it('executa a ferramenta e devolve a resposta final', async () => {
    fetchMock.mockResolvedValueOnce(chamadaDeTool()).mockResolvedValueOnce(texto('pronto'));
    const o = op();
    const r = await rodar(o);
    expect(r.text).toBe('pronto');
    expect(o.executar).toHaveBeenCalledWith('list_tasks', {});
    expect(bodyDe(1).messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 't1' });
  });

  it('400 com ferramentas: tenta sem ferramentas no MESMO provedor', async () => {
    fetchMock.mockResolvedValueOnce(resp(400, {})).mockResolvedValueOnce(texto('sem tools'));
    const r = await rodar();
    expect(r).toEqual({ text: 'sem tools', provider: 'antigravity02' });
    expect(hosts()).toEqual(['x.test', 'x.test']);
    expect(bodyDe(0).tools).toBeDefined();
    expect(bodyDe(1).tools).toBeUndefined();
  });

  it('400 com e sem ferramentas: segue para o PRÓXIMO provedor', async () => {
    fetchMock.mockResolvedValueOnce(resp(400, {})).mockResolvedValueOnce(resp(400, {})).mockResolvedValueOnce(texto('do groq'));
    const r = await rodar();
    expect(r.provider).toBe('groq');
    expect(hosts()).toEqual(['x.test', 'x.test', 'api.groq.com']);
  });

  it('limita as rodadas de ferramentas: a última chamada vai sem tools', async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => (JSON.parse(String(init.body)).tools ? chamadaDeTool() : texto('fechou')));
    const o = op();
    const r = await rodar(o);
    expect(r.text).toBe('fechou');
    expect(o.executar).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(bodyDe(5).tools).toBeUndefined();
  });

  it('ferramenta não permitida não é executada', async () => {
    fetchMock.mockResolvedValueOnce(chamadaDeTool()).mockResolvedValueOnce(texto('ok'));
    const o = { executar: vi.fn(), permitida: () => false };
    await rodar(o as never);
    expect(o.executar).not.toHaveBeenCalled();
    expect(bodyDe(1).messages.at(-1).content).toContain('Ferramenta não permitida');
  });
});

describe('suggestSalesApproach (router)', () => {
  const caller = (id = 1) => aiRouter.createCaller({ user: { id, name: 'Ana', email: 'a@x.com', role: 'user', mustChangePassword: false } } as never);

  it('devolve a sugestão do primeiro provedor', async () => {
    fetchMock.mockResolvedValueOnce(texto('Ligue amanhã.'));
    expect(await caller(11).suggestSalesApproach({ title: 'Padaria A', notes: 'x' })).toEqual({ suggestion: 'Ligue amanhã.' });
  });

  it('cadeia inteira falhando vira erro tipado, não texto de sucesso', async () => {
    fetchMock.mockResolvedValue(resp(500, {}));
    await expect(caller(12).suggestSalesApproach({ title: 'Padaria B', notes: 'y' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: AI_INDISPONIVEL });
  });

  it('limites de tamanho e limite por usuário', async () => {
    await expect(caller(13).suggestSalesApproach({ title: 't'.repeat(301), notes: '' })).rejects.toThrow();
    await expect(caller(13).suggestSalesApproach({ title: 't', notes: 'n'.repeat(5001) })).rejects.toThrow();
    fetchMock.mockResolvedValue(texto('a'));
    await caller(14).suggestSalesApproach({ title: 'c1', notes: '' });
    await expect(caller(14).suggestSalesApproach({ title: 'c2', notes: '' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
