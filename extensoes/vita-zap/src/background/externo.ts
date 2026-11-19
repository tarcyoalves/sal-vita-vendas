// Mensagens vindas de PÁGINAS (chrome.runtime.onMessageExternal), só do site do CRM. Serve para o CRM
// descobrir se o Vita Zap está instalado e em que estado (página /vita-zap do CRM).
//
// Regras (testadas em tests/mensagem-externa.test.ts):
// - Só responde a remetentes cuja ORIGEM esteja em ORIGENS_EXTERNAS (a mesma lista do
//   `externally_connectable` do manifest). Qualquer outro: não responde nada.
// - Só entende `{ tipo: 'ping' }` e a resposta tem SÓ versão e dois sim/não. Nunca nome, e-mail, telefone,
//   lembrete ou conversa. Não executa nenhuma ação pedida pela página.
// - Não faz rede: lê só o que já está guardado na extensão.

export const ORIGENS_EXTERNAS: readonly string[] = ['https://lembretes.salvitarn.com.br'];

/** Só no build de desenvolvimento (npm run build:dev, que também põe o localhost no manifesto: dev/manifest.dev.json). */
export const ORIGENS_EXTERNAS_DEV: readonly string[] = ['http://localhost:5173'];

/** Definido pelo vite.config.ts (`--mode development`); nos testes e na produção não existe → false. */
declare const __VZ_DEV__: boolean | undefined;
const BUILD_DE_DESENVOLVIMENTO = typeof __VZ_DEV__ !== 'undefined' && __VZ_DEV__ === true;

export interface RespostaPing {
  ok: true;
  versao: string;
  conectadoAoCrm: boolean;
  temPermissao: boolean;
}

export interface DependenciasExterno {
  versao: () => string;
  conectadoAoCrm: () => Promise<boolean>;
  temPermissao: () => Promise<boolean>;
}

interface Remetente {
  origin?: string;
  url?: string;
}

/** Origem do remetente (a do frame que enviou). Sem origem conhecida → null (recusa). */
export function origemDoRemetente(r: Remetente | undefined): string | null {
  if (!r) return null;
  if (typeof r.origin === 'string' && r.origin !== '') return r.origin;
  try {
    return new URL(r.url ?? '').origin;
  } catch {
    return null;
  }
}

export function origemPermitida(origem: string | null, desenvolvimento: boolean = BUILD_DE_DESENVOLVIMENTO): boolean {
  if (origem === null) return false;
  return ORIGENS_EXTERNAS.includes(origem) || (desenvolvimento && ORIGENS_EXTERNAS_DEV.includes(origem));
}

export function ehPing(m: unknown): boolean {
  return typeof m === 'object' && m !== null && (m as { tipo?: unknown }).tipo === 'ping';
}

/** Ouvinte de chrome.runtime.onMessageExternal. Devolve true só quando vai responder (de forma assíncrona). */
export function criarAtendenteExterno(dep: DependenciasExterno) {
  return (msg: unknown, remetente: Remetente | undefined, responder: (r: RespostaPing) => void): boolean => {
    if (!origemPermitida(origemDoRemetente(remetente)) || !ehPing(msg)) return false;
    void Promise.all([dep.conectadoAoCrm().catch(() => false), dep.temPermissao().catch(() => false)]).then(([conectadoAoCrm, temPermissao]) =>
      responder({ ok: true, versao: dep.versao(), conectadoAoCrm, temPermissao }),
    );
    return true;
  };
}
