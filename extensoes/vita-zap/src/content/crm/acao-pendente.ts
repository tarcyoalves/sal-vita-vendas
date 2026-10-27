// Executa o pedido "abrir a conversa e colar o rascunho" (clique na notificação, central de
// lembretes). Só abre a conversa e COLA o texto; quem envia é o usuário.

import { AVISO_FALLBACK_ENDERECO } from '../../shared/abrir-por-telefone';
import { urlDaConversaPorTelefone } from '../../shared/crm-acoes';
import { renderizarModelo } from '../../shared/crm-modelos';
import type { RepositorioContatos } from '../../shared/repositorio';
import { abrirConversaPorTelefoneSemRecarregar } from '../abrir-por-telefone';
import { abrirEPrepararRascunho } from '../execucao';
import { extrairTermosLead } from '../../shared/crm-termos';
import { ErroSeletor } from '../lista';
import { mostrarAviso } from './popover';
import { memorizarTelefone } from './telefone-conhecido';
import { avisarUmaVez } from './ui';

let ocupado = false;

/** Espera antes de recarregar, para o usuário ler o aviso. */
const ESPERA_ANTES_DE_RECARREGAR_MS = 1500;

/**
 * Lembrete do CRM Lembretes: abre a conversa do telefone BUSCANDO o número na lista do WhatsApp Web, sem recarregar.
 * Só se a busca não achar (ou achar mais de um contato) cai no endereço /send?phone=..., que recarrega a página,
 * e avisa isso. Não envia nada e não preenche texto. `true` = a conversa foi (ou vai ser) aberta.
 */
export async function abrirConversaPorTelefoneNaPagina(telefone: string, nome?: string): Promise<boolean> {
  const url = urlDaConversaPorTelefone(telefone);
  if (!url) return false;
  if (ocupado) {
    mostrarAviso('Ainda estou abrindo a conversa anterior.', 'erro');
    return true;
  }
  ocupado = true;
  try {
    const r = await abrirConversaPorTelefoneSemRecarregar(telefone, nome);
    if (r.ok) {
      mostrarAviso(`Conversa de ${r.nome ?? nome ?? 'o contato'} aberta pela busca.`);
      return true;
    }
  } catch (e) {
    if (!(e instanceof ErroSeletor)) avisarUmaVez('abrir-telefone', 'Falha ao buscar a conversa pelo telefone.', e);
  } finally {
    ocupado = false;
  }
  mostrarAviso(AVISO_FALLBACK_ENDERECO);
  setTimeout(() => window.location.assign(url), ESPERA_ANTES_DE_RECARREGAR_MS);
  return true;
}

/** Abre a conversa de `nome` e cola o rascunho (com {nome}/{primeiro_nome} resolvidos). */
export async function abrirConversaComRascunho(nome: string, rascunho?: string, telefone?: string | null): Promise<boolean> {
  if (ocupado) {
    mostrarAviso('Ainda estou abrindo a conversa anterior.', 'erro');
    return false;
  }
  ocupado = true;
  try {
    const texto = rascunho ? renderizarModelo(rascunho, nome) : null;

    // 1. Tenta abrir pelo nome informado
    let r = await abrirEPrepararRascunho(nome, texto);
    if (r.ok) {
      memorizarTelefone(nome, telefone);
      mostrarAviso(texto ? `Conversa de ${nome} aberta com o rascunho na caixa. Confira e aperte Enter.` : `Conversa de ${nome} aberta.`);
      return true;
    }

    // 2. Se tem telefone e não achou pelo nome, tenta abrir por telefone
    if (telefone && r.codigo === 'nao_encontrado') {
      const rTel = await abrirConversaPorTelefoneSemRecarregar(telefone, nome);
      if (rTel.ok) {
        memorizarTelefone(rTel.nome ?? nome, telefone);
        if (texto) {
          const rRascunho = await abrirEPrepararRascunho(rTel.nome ?? nome, texto);
          if (!rRascunho.ok) {
            mostrarAviso(`Conversa de ${nome} aberta, mas não colei o rascunho: ${rRascunho.erro}`, 'erro');
            return true;
          }
        }
        mostrarAviso(texto ? `Conversa de ${nome} aberta com o rascunho na caixa. Confira e aperte Enter.` : `Conversa de ${nome} aberta.`);
        return true;
      }
    }

    // 3. Se não achou na busca e o nome é longo (título do CRM com CNPJ, LTDA, cidade...), tenta os termos limpos do lead
    if (r.codigo === 'nao_encontrado') {
      const termos = extrairTermosLead(nome);
      for (const termo of termos) {
        if (termo.toLowerCase() === nome.toLowerCase()) continue;
        // Uma palavra só ("Maria", "Comercial") pode ser outra pessoa: sem telefone confirmado, não arrisca.
        if (!/\s/.test(termo.trim())) continue;
        const rTermo = await abrirEPrepararRascunho(termo, texto);
        if (rTermo.ok) {
          memorizarTelefone(termo, telefone);
          mostrarAviso(texto ? `Conversa de ${nome} aberta com o rascunho na caixa. Confira e aperte Enter.` : `Conversa de ${nome} aberta.`);
          return true;
        }
      }
    }

    mostrarAviso(r.erro, 'erro');
    return false;
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
  await abrirConversaComRascunho(pedido.nome, pedido.rascunho, pedido.telefone);
}
