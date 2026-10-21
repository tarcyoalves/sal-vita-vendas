// Executa o pedido "abrir a conversa e colar o rascunho" (clique na notificação, central de
// lembretes). Só abre a conversa e COLA o texto; quem envia é o usuário.

import { renderizarModelo } from '../../shared/crm-modelos';
import { CHAVE_ACAO_PENDENTE, ehAcaoPendente } from '../../shared/crm-store';
import { abrirEPrepararRascunho } from '../execucao';
import { ErroSeletor } from '../lista';
import { mostrarAviso } from './popover';
import { avisarUmaVez } from './ui';

const VALIDADE_MS = 15 * 60_000;
let ultimoTs = 0;
let ocupado = false;

/** Abre a conversa de `nome` e cola o rascunho (com {nome}/{primeiro_nome} resolvidos). */
export async function abrirConversaComRascunho(nome: string, rascunho?: string): Promise<boolean> {
  if (ocupado) {
    mostrarAviso('Ainda estou abrindo a conversa anterior.', 'erro');
    return false;
  }
  ocupado = true;
  try {
    const texto = rascunho ? renderizarModelo(rascunho, nome) : null;
    const r = await abrirEPrepararRascunho(nome, texto);
    if (!r.ok) {
      mostrarAviso(r.erro, 'erro');
      return false;
    }
    mostrarAviso(texto ? `Conversa de ${nome} aberta com o rascunho na caixa. Confira e aperte Enter.` : `Conversa de ${nome} aberta.`);
    return true;
  } catch (e) {
    if (e instanceof ErroSeletor) mostrarAviso(e.message, 'erro');
    else avisarUmaVez('abrir-conversa', 'Falha ao abrir a conversa do lembrete.', e);
    return false;
  } finally {
    ocupado = false;
  }
}

/** Lê o pedido gravado pelo service worker/painel (se houver e for recente) e o executa uma vez. */
export async function consumirAcaoPendente(): Promise<void> {
  let bruto: unknown;
  try {
    bruto = (await chrome.storage.local.get(CHAVE_ACAO_PENDENTE))[CHAVE_ACAO_PENDENTE];
  } catch {
    return;
  }
  if (!ehAcaoPendente(bruto)) return;
  if (bruto.ts <= ultimoTs || Date.now() - bruto.ts > VALIDADE_MS) {
    await chrome.storage.local.remove(CHAVE_ACAO_PENDENTE).catch(() => undefined);
    return;
  }
  ultimoTs = bruto.ts;
  await chrome.storage.local.remove(CHAVE_ACAO_PENDENTE).catch(() => undefined);
  await abrirConversaComRascunho(bruto.nome, bruto.rascunho);
}
