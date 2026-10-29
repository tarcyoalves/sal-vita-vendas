// Executa o pedido de abertura da conversa e preparo do texto (ou disparo humano quando solicitado).

import { AVISO_FALLBACK_ENDERECO, mesmoNome } from '../../shared/abrir-por-telefone';
import { urlDaConversaPorTelefone } from '../../shared/crm-acoes';
import { renderizarModelo } from '../../shared/crm-modelos';
import type { RepositorioContatos } from '../../shared/repositorio';
import type { RespostaConteudo } from '../../shared/mensagens';
import { abrirConversaPorTelefoneSemRecarregar } from '../abrir-por-telefone';
import { abrirEPrepararRascunho, executarDisparoHumanoLembrete, tituloAberto } from '../execucao';
import { extrairTermosLead } from '../../shared/crm-termos';
import { ErroSeletor, buscar } from '../lista';
import { mostrarAviso } from './popover';
import { memorizarTelefone } from './telefone-conhecido';
import { avisarUmaVez } from './ui';

let ocupado = false;
let buscaIdAtual = 0;

/** Espera antes de recarregar, para o usuário ler o aviso. */
const ESPERA_ANTES_DE_RECARREGAR_MS = 1500;

/**
 * Lembrete do CRM Lembretes: abre a conversa do telefone BUSCANDO o número na lista do WhatsApp Web, sem recarregar.
 * Só se a busca não achar (ou achar mais de um contato) cai no endereço /whatsapp-web-direct..., que recarrega a página,
 * e avisa isso. Não dispara nada e não preenche texto. `true` = a conversa foi (ou vai ser) aberta.
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
export async function abrirConversaComRascunho(
  nome: string,
  rascunho?: string,
  telefone?: string | null,
  disparoAutomatico = false,
  aoConcluir?: () => Promise<void> | void,
): Promise<boolean> {
  const meuId = ++buscaIdAtual;
  if (ocupado) {
    ocupado = false;
  }
  ocupado = true;
  try {
    const texto = rascunho ? renderizarModelo(rascunho, nome) : null;
    let nomeFinal = nome;
    let abriuComSucesso = false;

    // 0. Se a conversa já está aberta (ou coincide com o nome inteligente), não faz busca desnecessária
    const abertoInicial = tituloAberto();
    if (abertoInicial && (abertoInicial === nome || mesmoNome(abertoInicial, nome))) {
      await buscar('');
      abriuComSucesso = true;
      nomeFinal = abertoInicial;
      if (texto) {
        const rRascunho = await abrirEPrepararRascunho(nomeFinal, texto);
        if (!rRascunho.ok) {
          mostrarAviso(`Conversa aberta, mas não colei o rascunho: ${rRascunho.erro}`, 'erro');
          return true;
        }
      }
    }

    // 1. Tenta abrir pelo nome informado
    let r: RespostaConteudo = { ok: false, codigo: 'nao_encontrado', erro: 'Não encontrado' };
    if (!abriuComSucesso && meuId === buscaIdAtual) {
      r = await abrirEPrepararRascunho(nome, texto);
      if (r.ok) {
        memorizarTelefone(nome, telefone);
        nomeFinal = nome;
        abriuComSucesso = true;
      }
    }

    // 2. Se tem telefone e não achou pelo nome, tenta abrir por telefone
    if (!abriuComSucesso && meuId === buscaIdAtual && !r.ok && telefone && r.codigo === 'nao_encontrado') {
      const rTel = await abrirConversaPorTelefoneSemRecarregar(telefone, nome);
      if (rTel.ok) {
        nomeFinal = rTel.nome ?? nome;
        memorizarTelefone(nomeFinal, telefone);
        if (texto) {
          const rRascunho = await abrirEPrepararRascunho(nomeFinal, texto);
          if (!rRascunho.ok) {
            mostrarAviso(`Conversa de ${nome} aberta, mas não colei o rascunho: ${rRascunho.erro}`, 'erro');
            return true;
          }
        }
        abriuComSucesso = true;
      }
    }

    // 3. Se não achou na busca e o nome é longo (título do CRM com CNPJ, LTDA, cidade...), tenta os termos limpos do lead
    if (!abriuComSucesso && meuId === buscaIdAtual && !r.ok && r.codigo === 'nao_encontrado') {
      const termos = extrairTermosLead(nome);
      for (const termo of termos) {
        if (meuId !== buscaIdAtual) break;
        // Se a conversa já abriu ou o usuário clicou nela: interrompe a busca imediatamente!
        const abertoAgora = tituloAberto();
        if (abertoAgora && (abertoAgora === nome || mesmoNome(abertoAgora, nome) || mesmoNome(abertoAgora, termo))) {
          await buscar('');
          abriuComSucesso = true;
          nomeFinal = abertoAgora;
          if (texto) await abrirEPrepararRascunho(nomeFinal, texto);
          break;
        }

        if (termo.toLowerCase() === nome.toLowerCase()) continue;
        if (!/\s/.test(termo.trim()) && termo.trim().length < 4) continue;
        const rTermo = await abrirEPrepararRascunho(termo, texto);
        if (rTermo.ok) {
          nomeFinal = termo;
          memorizarTelefone(termo, telefone);
          abriuComSucesso = true;
          await buscar('');
          break;
        }
      }
    }

    // Garante que a barra de busca SEMPRE fica limpa após achar ou falhar
    await buscar('');

    if (meuId !== buscaIdAtual) return false;

    if (!abriuComSucesso) {
      mostrarAviso(!r.ok ? r.erro : 'Não consegui abrir a conversa.', 'erro');
      return false;
    }

    // Disparo no padrão humano:
    if (disparoAutomatico && texto) {
      mostrarAviso(`Disparando mensagem para ${nomeFinal} no padrão humano (pausa de 2-3s)... tempo para conferir.`);
      const rEnvio = await executarDisparoHumanoLembrete(nomeFinal, texto, aoConcluir);
      if (rEnvio.ok) {
        mostrarAviso(`Mensagem entregue para ${nomeFinal} com sucesso!`);
      } else {
        mostrarAviso(`Não foi possível disparar automaticamente: ${rEnvio.motivo}`, 'erro');
      }
      return true;
    }

    mostrarAviso(texto ? `Conversa de ${nomeFinal} aberta com o rascunho na caixa. Confira e aperte Enter.` : `Conversa de ${nomeFinal} aberta.`);
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
  const aoConcluir = pedido.lembreteId
    ? () => repo.atualizarLembrete(pedido.lembreteId!, { status: 'concluido' })
    : undefined;
  await abrirConversaComRascunho(pedido.nome, pedido.rascunho, pedido.telefone, Boolean(pedido.disparoAutomatico), aoConcluir);
}
