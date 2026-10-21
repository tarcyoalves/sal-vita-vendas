// Executa o pedido "abrir a conversa e colar o rascunho" (clique na notificação, central de
// lembretes). Só abre a conversa e COLA o texto; quem envia é o usuário.

import { renderizarModelo } from '../../shared/crm-modelos';
import type { RepositorioContatos } from '../../shared/repositorio';
import { abrirEPrepararRascunho } from '../execucao';
import { ErroSeletor } from '../lista';
import { mostrarAviso } from './popover';
import { avisarUmaVez } from './ui';

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

/** Pega o pedido pendente (gravado pelo service worker/painel; só vale se for recente) e o executa uma vez. */
export async function consumirAcaoPendente(repo: RepositorioContatos): Promise<void> {
  let pedido;
  try {
    pedido = await repo.consumirAbertura();
  } catch {
    return;
  }
  if (!pedido) return;
  await abrirConversaComRascunho(pedido.nome, pedido.rascunho);
}
