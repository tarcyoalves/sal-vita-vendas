// Página /vita-zap: detectar a extensão Vita Zap pelo navegador e montar o status mostrado ao atendente.
// A extensão responde ao `{tipo:'ping'}` (externally_connectable, só a origem do CRM) com a versão e dois sim/não.
// Nada aqui toca o servidor: a versão publicada vem do arquivo estático /vita-zap/versao.json.

import { EXTENSAO_VITA_ZAP_ID } from '../../../shared/extensao';

export const URL_ZIP_VITA_ZAP = '/vita-zap/vita-zap.zip';
export const URL_INSTALADOR_VITA_ZAP = '/vita-zap/Instalar-VitaZap.cmd';
export const URL_VERSAO_VITA_ZAP = '/vita-zap/versao.json';
export const ENDERECO_EXTENSOES = 'chrome://extensions';

/** "0.10.0" > "0.9.9". Texto que não é versão numérica conta como 0 (nunca "mais nova"). */
function partes(v: string): number[] | null {
  return /^\d+(\.\d+){0,3}$/.test(v.trim()) ? v.trim().split('.').map(Number) : null;
}

export function compararVersoes(a: string, b: string): number {
  const pa = partes(a) ?? [0];
  const pb = partes(b) ?? [0];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function ehVersaoMaior(nova: string, atual: string): boolean {
  return partes(nova) !== null && compararVersoes(nova, atual) > 0;
}

export interface PingVitaZap {
  versao: string;
  conectadoAoCrm: boolean;
  temPermissao: boolean;
}

/** Aceita só a resposta no formato combinado; qualquer outra coisa → null (tratada como "não instalado"). */
export function lerPing(r: unknown): PingVitaZap | null {
  const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
  if (o.ok !== true || typeof o.versao !== 'string' || partes(o.versao) === null) return null;
  return { versao: o.versao, conectadoAoCrm: o.conectadoAoCrm === true, temPermissao: o.temPermissao === true };
}

export type StatusVitaZap =
  | { tipo: 'verificando' }
  | { tipo: 'outro-navegador' }
  | { tipo: 'nao-instalado' }
  | { tipo: 'falta-conectar'; versao: string; atualizar: boolean }
  | { tipo: 'conectado'; versao: string; atualizar: boolean };

export interface EntradaStatus {
  /** Chrome de computador (o único onde a extensão roda). */
  chrome: boolean;
  /** undefined = ainda não perguntou; null = a extensão não respondeu. */
  ping: PingVitaZap | null | undefined;
  /** Versão do /vita-zap/versao.json, se já carregou. */
  versaoPublicada: string | null;
}

export function montarStatus({ chrome, ping, versaoPublicada }: EntradaStatus): StatusVitaZap {
  if (!chrome) return { tipo: 'outro-navegador' };
  if (ping === undefined) return { tipo: 'verificando' };
  if (ping === null) return { tipo: 'nao-instalado' };
  const atualizar = versaoPublicada !== null && ehVersaoMaior(versaoPublicada, ping.versao);
  return ping.conectadoAoCrm ? { tipo: 'conectado', versao: ping.versao, atualizar } : { tipo: 'falta-conectar', versao: ping.versao, atualizar };
}

export function rotuloStatus(s: StatusVitaZap): string {
  if (s.tipo === 'nao-instalado') return 'Não instalado';
  if (s.tipo === 'falta-conectar') return `Instalado v${s.versao}, falta conectar`;
  if (s.tipo === 'conectado') return 'Instalado e conectado';
  if (s.tipo === 'outro-navegador') return 'Use o Google Chrome no computador';
  return 'Verificando…';
}

/** Chrome (não Edge/Opera) com a API de extensões presente. No celular e em outros navegadores não existe. */
export function ehChromeDeComputador(ua: string, temApiDeExtensao: boolean): boolean {
  return temApiDeExtensao && /Chrome\//.test(ua) && !/Edg\/|OPR\/|Mobile/.test(ua);
}

interface ApiChrome {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (r: unknown) => void) => void;
    lastError?: unknown;
  };
}

/** Pergunta à extensão se ela está instalada. null = sem resposta (não instalada, versão antiga ou desativada). */
export function perguntarExtensao(api: ApiChrome | undefined = (globalThis as { chrome?: ApiChrome }).chrome, esperaMs = 2500): Promise<PingVitaZap | null> {
  return new Promise((resolver) => {
    const enviar = api?.runtime?.sendMessage;
    if (!enviar) return resolver(null);
    const relogio = setTimeout(() => resolver(null), esperaMs);
    try {
      enviar.call(api.runtime, EXTENSAO_VITA_ZAP_ID, { tipo: 'ping' }, (r) => {
        void api?.runtime?.lastError; // lê o erro "não existe a extensão" para o Chrome não registrar como não tratado
        clearTimeout(relogio);
        resolver(lerPing(r));
      });
    } catch {
      clearTimeout(relogio);
      resolver(null);
    }
  });
}

export function lerVersaoPublicada(corpo: unknown): string | null {
  const v = typeof corpo === 'object' && corpo !== null ? (corpo as { versao?: unknown }).versao : undefined;
  return typeof v === 'string' && partes(v) !== null ? v.trim() : null;
}
