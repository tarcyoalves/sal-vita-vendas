/**
 * Cadeia de fallback de IA reutilizável (server/lib/llm.ts).
 *
 * `antigravity` (endpoint OpenAI-compatível opcional do dono, na VPS) entra na frente
 * da cadeia só quando as 3 variáveis estiverem configuradas; sem elas, nada muda em
 * relação à cadeia existente (Groq → Cerebras → OpenRouter → NVIDIA).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProviderChain, codigoDoErro, completeWithFallback } from '../server/lib/llm';

const ENV_KEYS = [
  'ANTIGRAVITY_BASE_URL', 'ANTIGRAVITY_API_KEY', 'ANTIGRAVITY_MODEL',
  'GROQ_API_KEY', 'GROQ_MODEL',
  'CEREBRAS_API_KEY', 'CEREBRAS_MODEL',
  'OPENROUTER_API_KEY', 'OPENROUTER_MODEL',
  'NVIDIA_API_KEY', 'NVIDIA_MODEL',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('buildProviderChain', () => {
  it('sem nenhuma env, devolve cadeia vazia', () => {
    expect(buildProviderChain({})).toEqual([]);
  });

  it('sem antigravity, mantém a ordem atual Groq → Cerebras → OpenRouter → NVIDIA', () => {
    const env = {
      NVIDIA_API_KEY: 'n',
      GROQ_API_KEY: 'g',
      OPENROUTER_API_KEY: 'o',
      CEREBRAS_API_KEY: 'c',
    };
    const chain = buildProviderChain(env);
    expect(chain.map((c) => c.provider)).toEqual(['groq', 'cerebras', 'openrouter', 'nvidia']);
  });

  it('só inclui provedores com chave configurada', () => {
    const chain = buildProviderChain({ CEREBRAS_API_KEY: 'c' });
    expect(chain.map((c) => c.provider)).toEqual(['cerebras']);
    expect(chain[0].baseURL).toBe('https://api.cerebras.ai/v1');
    expect(chain[0].model).toBe('gpt-oss-120b');
  });

  it('com as 3 variáveis do antigravity, ele vem primeiro', () => {
    const env = {
      ANTIGRAVITY_BASE_URL: 'https://vps.example.com/v1',
      ANTIGRAVITY_API_KEY: 'ag-key',
      ANTIGRAVITY_MODEL: 'gemini-3.8-flash',
      GROQ_API_KEY: 'g',
    };
    const chain = buildProviderChain(env);
    expect(chain.map((c) => c.provider)).toEqual(['antigravity', 'groq']);
    expect(chain[0]).toEqual({
      provider: 'antigravity',
      baseURL: 'https://vps.example.com/v1',
      apiKey: 'ag-key',
      model: 'gemini-3.8-flash',
    });
  });

  it('tira a barra final da ANTIGRAVITY_BASE_URL', () => {
    const chain = buildProviderChain({
      ANTIGRAVITY_BASE_URL: 'https://vps.example.com/v1/',
      ANTIGRAVITY_API_KEY: 'ag-key',
      ANTIGRAVITY_MODEL: 'gemini-3.8-flash',
    });
    expect(chain[0].baseURL).toBe('https://vps.example.com/v1');
  });

  it('configuração parcial do antigravity é ignorada (não entra na cadeia)', () => {
    const chain = buildProviderChain({
      ANTIGRAVITY_BASE_URL: 'https://vps.example.com/v1',
      ANTIGRAVITY_API_KEY: 'ag-key',
      // ANTIGRAVITY_MODEL ausente
      GROQ_API_KEY: 'g',
    });
    expect(chain.map((c) => c.provider)).toEqual(['groq']);
  });

  it('respeita override de modelo por env, como o modelFor de ai.ts', () => {
    const chain = buildProviderChain({ GROQ_API_KEY: 'g', GROQ_MODEL: 'llama-custom' });
    expect(chain[0].model).toBe('llama-custom');
  });
});

describe('completeWithFallback', () => {
  it('lança erro claro quando nenhum provedor está configurado', async () => {
    await expect(completeWithFallback([{ role: 'user', content: 'oi' }])).rejects.toThrow(/nenhum provedor/i);
  });

  it('devolve o texto e o nome do provedor quando a chamada dá certo', async () => {
    process.env.GROQ_API_KEY = 'g';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'olá' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWithFallback([{ role: 'user', content: 'oi' }]);
    expect(result).toEqual({ text: 'olá', provider: 'groq' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('em erro 5xx, tenta o próximo provedor da cadeia', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.CEREBRAS_API_KEY = 'c';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok2' } }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWithFallback([{ role: 'user', content: 'oi' }]);
    expect(result).toEqual({ text: 'ok2', provider: 'cerebras' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('em erro 400, não tenta o próximo provedor e propaga o erro', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.CEREBRAS_API_KEY = 'c';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(completeWithFallback([{ role: 'user', content: 'oi' }])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('quando antigravity está configurado, ele é chamado primeiro', async () => {
    process.env.ANTIGRAVITY_BASE_URL = 'https://vps.example.com/v1';
    process.env.ANTIGRAVITY_API_KEY = 'ag-key';
    process.env.ANTIGRAVITY_MODEL = 'gemini-3.8-flash';
    process.env.GROQ_API_KEY = 'g';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'via antigravity' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWithFallback([{ role: 'user', content: 'oi' }]);
    expect(result.provider).toBe('antigravity');
    expect(fetchMock.mock.calls[0][0]).toBe('https://vps.example.com/v1/chat/completions');
  });
});

describe('completeWithFallback: cadeia inteira falhou', () => {
  it('loga UMA linha-resumo "prov=status" (sem conteúdo nem chave) quando todos os provedores falham', async () => {
    process.env.GROQ_API_KEY = 'chave-secreta-g';
    process.env.CEREBRAS_API_KEY = 'chave-secreta-c';
    process.env.NVIDIA_API_KEY = 'chave-secreta-n';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '{"error":{"code":"model_not_found"}}' })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'limite' })
      .mockRejectedValueOnce(new Error('aborted'));
    vi.stubGlobal('fetch', fetchMock);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(completeWithFallback([{ role: 'user', content: 'texto privado do cliente' }], { label: 'ZAP_IA' })).rejects.toThrow();
    const resumos = aviso.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('cadeia inteira falhou'));
    expect(resumos).toEqual(['[ZAP_IA] cadeia inteira falhou: groq=404,cerebras=429,nvidia=rede']);
    const tudo = aviso.mock.calls.map((c) => String(c[0])).join('\n');
    expect(tudo).not.toMatch(/chave-secreta|texto privado/);
    aviso.mockRestore();
  });

  it('não loga o resumo quando um provedor responde (nem em erro 400, que não tenta o próximo)', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.CEREBRAS_API_KEY = 'c';
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' }).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }));
    await completeWithFallback([{ role: 'user', content: 'oi' }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'ruim' }));
    await expect(completeWithFallback([{ role: 'user', content: 'oi' }])).rejects.toThrow(/400/);
    expect(aviso.mock.calls.map((c) => String(c[0])).some((l) => l.includes('cadeia inteira falhou'))).toBe(false);
    aviso.mockRestore();
  });
});

describe('codigoDoErro', () => {
  it('pega só o código curto do erro, nunca a mensagem', () => {
    expect(codigoDoErro('{"error":{"code":"AUTH_002","message":"Authentication required"}}')).toBe('AUTH_002');
    expect(codigoDoErro('{"error":{"type":"model_not_found","message":"x"}}')).toBe('model_not_found');
    expect(codigoDoErro('{"error":"texto livre com espaço"}')).toBeUndefined();
    expect(codigoDoErro('<html>forbidden</html>')).toBeUndefined();
    expect(codigoDoErro('{"error":{"code":"a b c com espaço"}}')).toBeUndefined();
  });
});
