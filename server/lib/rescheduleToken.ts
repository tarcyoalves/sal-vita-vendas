// Confirmação gerada no SERVIDOR para a ferramenta de escrita `reschedule_tasks` da IA do admin.
//
// Antes, o "código de confirmação" era uma constante escrita na própria descrição da tool: qualquer
// texto injetado (nota de tarefa, documento da base de conhecimento) podia mandar o modelo executar.
// Agora a simulação (dry-run) devolve um token que:
//   - é um HMAC (segredo do servidor) amarrado a QUEM pediu, ao atendente, aos parâmetros e ao
//     CONJUNTO exato de tarefas do lote — outro lote, outro usuário ou outro parâmetro invalidam;
//   - vale poucos minutos;
//   - só é aceito em OUTRA requisição de chat (outra mensagem do usuário) que a que o emitiu, para
//     o modelo não conseguir simular e executar sozinho dentro do mesmo laço de ferramentas.
// Sem estado no servidor (a Vercel é serverless, memória não é compartilhada entre instâncias).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const REAGENDAMENTO_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface LoteReagendamento {
  userId: number;
  sellerId: number;
  perDay: number;
  startHour: number;
  taskIds: readonly number[];
}

function assinatura(lote: LoteReagendamento, expiraEm: number, requisicao: string, segredo: string): string {
  const ids = [...lote.taskIds].sort((a, b) => a - b).join(',');
  const dados = ['reschedule_tasks', lote.userId, lote.sellerId, lote.perDay, lote.startHour, ids, expiraEm, requisicao].join('|');
  return createHmac('sha256', segredo).update(dados).digest('hex');
}

/** Id aleatório de uma requisição de chat (identifica "a mesma conversa em andamento"). */
export function novaRequisicaoId(): string {
  return randomBytes(6).toString('hex');
}

/** Token da simulação: `<expiraEm>.<requisicao>.<hmac>`. */
export function emitirTokenReagendamento(lote: LoteReagendamento, requisicao: string, segredo: string, agora = Date.now()): string {
  const expiraEm = agora + REAGENDAMENTO_TOKEN_TTL_MS;
  return `${expiraEm}.${requisicao}.${assinatura(lote, expiraEm, requisicao, segredo)}`;
}

export type VerificacaoToken = { ok: true } | { ok: false; motivo: 'AUSENTE' | 'FORMATO' | 'EXPIRADO' | 'MESMA_REQUISICAO' | 'INVALIDO' };

export function verificarTokenReagendamento(
  token: unknown, lote: LoteReagendamento, requisicaoAtual: string, segredo: string, agora = Date.now(),
): VerificacaoToken {
  if (typeof token !== 'string' || token === '') return { ok: false, motivo: 'AUSENTE' };
  const partes = token.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'FORMATO' };
  const [expStr, requisicao, mac] = partes;
  const expiraEm = Number(expStr);
  if (!Number.isFinite(expiraEm) || !/^[0-9a-f]{64}$/.test(mac) || !/^[0-9a-f]{1,32}$/.test(requisicao)) return { ok: false, motivo: 'FORMATO' };
  const esperado = Buffer.from(assinatura(lote, expiraEm, requisicao, segredo), 'hex');
  const recebido = Buffer.from(mac, 'hex');
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: 'INVALIDO' };
  if (agora > expiraEm) return { ok: false, motivo: 'EXPIRADO' };
  if (requisicao === requisicaoAtual) return { ok: false, motivo: 'MESMA_REQUISICAO' };
  return { ok: true };
}
