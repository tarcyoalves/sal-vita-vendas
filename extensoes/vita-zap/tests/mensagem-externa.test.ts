// Mensagens vindas do site do CRM (onMessageExternal): só origens da lista, só "ping", e a resposta
// nunca leva dado pessoal. Tudo com dependências falsas: sem chrome, sem rede.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { criarAtendenteExterno, ORIGENS_EXTERNAS, origemDoRemetente, origemPermitida, type DependenciasExterno } from '../src/background/externo';

const manifesto = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'manifest.json'), 'utf8')) as { externally_connectable: { matches: string[] }; version: string };

// Dados que existem na extensão e NÃO podem aparecer na resposta.
const SEGREDOS = ['Ana Souza', 'ana@teste.local', '5584999990000', 'Padaria da Ana'];

function dependencias(parcial: Partial<DependenciasExterno> = {}): DependenciasExterno {
  return { versao: () => '0.7.0', conectadoAoCrm: async () => true, temPermissao: async () => true, ...parcial };
}

async function perguntar(msg: unknown, remetente: { origin?: string; url?: string } | undefined, dep = dependencias()) {
  const responder = vi.fn();
  const resposta = new Promise<unknown>((ok) => responder.mockImplementation(ok));
  const vaiResponder = criarAtendenteExterno(dep)(msg, remetente, responder);
  if (vaiResponder) await resposta;
  return { vaiResponder, responder };
}

describe('origens aceitas', () => {
  it('a lista do código é a mesma do externally_connectable do manifest', () => {
    expect(manifesto.externally_connectable.matches).toEqual(ORIGENS_EXTERNAS.map((o) => `${o}/*`));
    expect(manifesto.externally_connectable.matches).toContain('https://lembretes.salvitarn.com.br/*');
  });

  it('aceita o CRM e o dev local; recusa tudo o mais', () => {
    expect(origemPermitida('https://lembretes.salvitarn.com.br')).toBe(true);
    expect(origemPermitida('http://localhost:5173')).toBe(true);
    for (const ruim of [
      'http://lembretes.salvitarn.com.br',
      'https://lembretes.salvitarn.com.br.evil.com',
      'https://evil.com',
      'https://premium.salvitarn.com.br',
      'http://localhost:3000',
      'http://localhost',
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
      'null',
      '',
      null,
    ]) {
      expect(origemPermitida(ruim), String(ruim)).toBe(false);
    }
  });

  it('sem origin usa a origem da url; sem nenhuma das duas, recusa', () => {
    expect(origemDoRemetente({ url: 'https://lembretes.salvitarn.com.br/vita-zap?x=1' })).toBe('https://lembretes.salvitarn.com.br');
    expect(origemDoRemetente({})).toBeNull();
    expect(origemDoRemetente(undefined)).toBeNull();
    expect(origemDoRemetente({ url: 'lixo' })).toBeNull();
  });
});

describe('ping do CRM', () => {
  it('responde só versão e dois sim/não', async () => {
    const { vaiResponder, responder } = await perguntar({ tipo: 'ping' }, { origin: 'https://lembretes.salvitarn.com.br' });
    expect(vaiResponder).toBe(true);
    expect(responder).toHaveBeenCalledTimes(1);
    expect(responder.mock.calls[0][0]).toEqual({ ok: true, versao: '0.7.0', conectadoAoCrm: true, temPermissao: true });
  });

  it('a resposta não carrega dado pessoal nem campos além dos quatro', async () => {
    const { responder } = await perguntar({ tipo: 'ping', extra: SEGREDOS }, { origin: 'https://lembretes.salvitarn.com.br' });
    const resposta = responder.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(resposta).sort()).toEqual(['conectadoAoCrm', 'ok', 'temPermissao', 'versao']);
    const texto = JSON.stringify(resposta);
    for (const s of SEGREDOS) expect(texto).not.toContain(s);
  });

  it('falha ao ler o estado vira "não" (nunca erro com detalhe)', async () => {
    const dep = dependencias({
      conectadoAoCrm: async () => {
        throw new Error('Ana Souza ana@teste.local');
      },
      temPermissao: async () => {
        throw new Error('x');
      },
    });
    const { responder } = await perguntar({ tipo: 'ping' }, { origin: 'http://localhost:5173' }, dep);
    expect(responder.mock.calls[0][0]).toEqual({ ok: true, versao: '0.7.0', conectadoAoCrm: false, temPermissao: false });
  });
});

describe('o que é recusado', () => {
  it.each([
    ['site qualquer', { origin: 'https://evil.com' }],
    ['subdomínio parecido', { origin: 'https://lembretes.salvitarn.com.br.evil.com' }],
    ['outra extensão', { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' }],
    ['sem origem', {}],
  ])('origem estranha (%s): não responde nada', async (_nome, remetente) => {
    const dep = dependencias({ conectadoAoCrm: vi.fn(async () => true), temPermissao: vi.fn(async () => true) });
    const { vaiResponder, responder } = await perguntar({ tipo: 'ping' }, remetente, dep);
    expect(vaiResponder).toBe(false);
    expect(responder).not.toHaveBeenCalled();
    expect(dep.conectadoAoCrm).not.toHaveBeenCalled(); // nem consulta o estado para um estranho
  });

  it.each([
    ['ação vinda da página', { tipo: 'sair' }],
    ['método do CRM', { vz: 'crm', metodo: 'conta', args: [] }],
    ['texto', 'ping'],
    ['nulo', null],
    ['ping com tipo errado', { tipo: 'Ping' }],
  ])('origem boa mas mensagem que não é ping (%s): ignora', async (_nome, msg) => {
    const dep = dependencias({ conectadoAoCrm: vi.fn(async () => true) });
    const { vaiResponder, responder } = await perguntar(msg, { origin: 'https://lembretes.salvitarn.com.br' }, dep);
    expect(vaiResponder).toBe(false);
    expect(responder).not.toHaveBeenCalled();
    expect(dep.conectadoAoCrm).not.toHaveBeenCalled();
  });
});

describe('fiação no service worker', () => {
  it('o service worker registra o ouvinte externo', () => {
    const sw = readFileSync(join(__dirname, '..', 'src', 'background', 'service-worker.ts'), 'utf8');
    expect(sw).toMatch(/onMessageExternal\.addListener\(\s*criarAtendenteExterno/);
  });
});
