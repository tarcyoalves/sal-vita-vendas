// Mensagens vindas de PÁGINAS (chrome.runtime.onMessageExternal), só do site do CRM. Serve para o CRM
// descobrir se o Vita Zap está instalado e em que estado (página /vita-zap do CRM).
//
// Regras (testadas em tests/mensagem-externa.test.ts):
// - Só responde a remetentes cuja ORIGEM esteja em ORIGENS_EXTERNAS (a mesma lista do
//   `externally_connectable` do manifest). Qualquer outro: não responde nada.
// - Só entende `{ tipo: 'ping' }` e a resposta tem SÓ versão e dois sim/não. Nunca nome, e-mail, telefone,
//   lembrete ou conversa. Não executa nenhuma ação pedida pela página.
// - Não faz rede: lê só o que já está guardado na extensão.

export const ORIGENS_EXTERNAS: readonly string[] = ['https://lembretes.salvitarn.com.br', 'http://localhost:5173'];

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

export function origemPermitida(origem: string | null): boolean {
  return origem !== null && ORIGENS_EXTERNAS.includes(origem);
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
