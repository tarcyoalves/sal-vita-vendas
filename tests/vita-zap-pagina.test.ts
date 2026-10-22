// Página /vita-zap do CRM: comparar versões, montar o status a partir da resposta da extensão e
// conferir que o deploy serve o zip e o instalador (vercel.json) sem o PWA interceptar.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EXTENSAO_VITA_ZAP_ID } from '../shared/extensao';
import { compararVersoes, ehChromeDeComputador, ehVersaoMaior, lerPing, lerVersaoPublicada, montarStatus, perguntarExtensao, rotuloStatus } from '../client/src/lib/vitaZap';

const lido = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('versões', () => {
  it('compara número a número', () => {
    expect(compararVersoes('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compararVersoes('0.6.4', '0.7.0')).toBeLessThan(0);
    expect(compararVersoes('1.0', '1.0.0')).toBe(0);
    expect(ehVersaoMaior('0.7.1', '0.7.0')).toBe(true);
    expect(ehVersaoMaior('0.7.0', '0.7.0')).toBe(false);
    expect(ehVersaoMaior('lixo', '0.7.0')).toBe(false);
  });
  it('lê a versão publicada só se for numérica', () => {
    expect(lerVersaoPublicada({ versao: '0.7.0', data: '2026-10-22' })).toBe('0.7.0');
    for (const ruim of [null, {}, { versao: 7 }, { versao: 'x.y' }]) expect(lerVersaoPublicada(ruim)).toBeNull();
  });
});

describe('status da extensão', () => {
  const ping = (p: Partial<{ versao: string; conectadoAoCrm: boolean }> = {}) => ({ versao: '0.7.0', conectadoAoCrm: false, temPermissao: false, ...p });

  it('fora do Chrome avisa, mesmo que algo tenha respondido', () => {
    expect(montarStatus({ chrome: false, ping: ping(), versaoPublicada: '0.7.0' })).toEqual({ tipo: 'outro-navegador' });
  });
  it('antes da resposta: verificando; sem resposta: não instalado', () => {
    expect(montarStatus({ chrome: true, ping: undefined, versaoPublicada: null })).toEqual({ tipo: 'verificando' });
    const s = montarStatus({ chrome: true, ping: null, versaoPublicada: '0.7.0' });
    expect(s).toEqual({ tipo: 'nao-instalado' });
    expect(rotuloStatus(s)).toBe('Não instalado');
  });
  it('instalado e sem conexão: "Instalado vX, falta conectar"', () => {
    const s = montarStatus({ chrome: true, ping: ping(), versaoPublicada: '0.7.0' });
    expect(s).toEqual({ tipo: 'falta-conectar', versao: '0.7.0', atualizar: false });
    expect(rotuloStatus(s)).toBe('Instalado v0.7.0, falta conectar');
  });
  it('instalado e conectado', () => {
    const s = montarStatus({ chrome: true, ping: ping({ conectadoAoCrm: true }), versaoPublicada: '0.7.0' });
    expect(s).toEqual({ tipo: 'conectado', versao: '0.7.0', atualizar: false });
    expect(rotuloStatus(s)).toBe('Instalado e conectado');
  });
  it('versão instalada menor que a publicada pede atualização; igual, maior ou sem versão publicada não', () => {
    expect(montarStatus({ chrome: true, ping: ping({ versao: '0.6.4' }), versaoPublicada: '0.7.0' })).toMatchObject({ atualizar: true });
    expect(montarStatus({ chrome: true, ping: ping({ versao: '0.8.0' }), versaoPublicada: '0.7.0' })).toMatchObject({ atualizar: false });
    expect(montarStatus({ chrome: true, ping: ping(), versaoPublicada: null })).toMatchObject({ atualizar: false });
  });
});

describe('resposta da extensão e detecção do navegador', () => {
  it('só aceita o formato combinado', () => {
    expect(lerPing({ ok: true, versao: '0.7.0', conectadoAoCrm: true, temPermissao: true })).toEqual({ versao: '0.7.0', conectadoAoCrm: true, temPermissao: true });
    for (const ruim of [undefined, null, 'x', {}, { ok: false, versao: '0.7.0' }, { ok: true }, { ok: true, versao: '<b>' }]) expect(lerPing(ruim)).toBeNull();
  });
  it('Chrome de computador sim; Edge, Opera, celular e navegador sem API não', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    expect(ehChromeDeComputador(chrome, true)).toBe(true);
    expect(ehChromeDeComputador(chrome, false)).toBe(false);
    expect(ehChromeDeComputador(`${chrome} Edg/130.0.0.0`, true)).toBe(false);
    expect(ehChromeDeComputador(`${chrome} OPR/110`, true)).toBe(false);
    expect(ehChromeDeComputador(chrome.replace('Safari', 'Mobile Safari'), true)).toBe(false);
    expect(ehChromeDeComputador('Mozilla/5.0 Firefox/130.0', true)).toBe(false);
  });
  it('pergunta pelo ID fixo da extensão e devolve a resposta; sem extensão devolve null', async () => {
    const enviar = vi.fn((_id: string, _msg: unknown, cb: (r: unknown) => void) => cb({ ok: true, versao: '0.7.0', conectadoAoCrm: true, temPermissao: true }));
    expect(await perguntarExtensao({ runtime: { sendMessage: enviar } })).toMatchObject({ versao: '0.7.0', conectadoAoCrm: true });
    expect(enviar).toHaveBeenCalledWith(EXTENSAO_VITA_ZAP_ID, { tipo: 'ping' }, expect.any(Function));
    expect(await perguntarExtensao({ runtime: { sendMessage: (_i, _m, cb) => cb(undefined) } })).toBeNull();
    expect(await perguntarExtensao({ runtime: {} })).toBeNull();
    expect(await perguntarExtensao(undefined)).toBeNull();
    expect(await perguntarExtensao({ runtime: { sendMessage: () => { throw new Error('Invalid extension id'); } } })).toBeNull();
  });
  it('extensão muda (nunca chama de volta) não trava a página', async () => {
    expect(await perguntarExtensao({ runtime: { sendMessage: () => undefined } }, 20)).toBeNull();
  });
});

describe('entrega dos arquivos', () => {
  it('vercel.json serve .zip, .cmd e .ps1 como arquivo (senão cairiam no index.html)', () => {
    const rota = (JSON.parse(lido('vercel.json')) as { routes: Array<{ src: string; dest?: string; has?: unknown }> }).routes.find((r) => !r.has && r.dest === '/$1' && r.src.includes('webmanifest'));
    expect(rota).toBeDefined();
    const re = new RegExp(`^${rota!.src}$`);
    for (const f of ['/vita-zap/vita-zap.zip', '/vita-zap/Instalar-VitaZap.cmd', '/vita-zap/Atualizar-VitaZap.ps1', '/vita-zap/versao.json']) expect(re.test(f), f).toBe(true);
    expect(re.test('/vita-zap')).toBe(false); // a página em si continua sendo o index.html do app
  });
  it('o PWA não devolve o index.html no lugar dos downloads', () => {
    expect(lido('vite.config.ts')).toContain(String.raw`navigateFallbackDenylist: [/^\/vita-zap\//]`);
  });
  it('a rota /vita-zap existe e fica no menu para todos os papéis', () => {
    expect(lido('client/src/App.tsx')).toMatch(/path="\/vita-zap"[\s\S]*?<VitaZap \/>/);
    expect(lido('client/src/components/AppShell.tsx')).toMatch(/label: "Vita Zap",\s*path: "\/vita-zap",[\s\S]*?roles: \["admin", "manager", "user"\]/);
  });
});
