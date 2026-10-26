// Content script do WhatsApp Web: recebe pedidos do painel lateral e responde.
// Pedidos possíveis: verificar, varrer (só leitura), abrirEColar, limparCaixa, pararObservacao,
// batimento (o painel está vivo) e consultarEnvio (só leitura). Não existe pedido de "enviar" avulso:
// o envio automático opcional é parte do abrirEColar (envioAutomatico) e mora em envio-humano.ts.

import type { EventoConteudo, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { abrirConversaPorTelefoneSemRecarregar } from './abrir-por-telefone';
import { abrirEColar, consultarEnvio, limparCaixa, pararObservacao, registrarBatimento } from './execucao';
import { ErroSeletor } from './lista';
import { iniciarCrm } from './crm';
import { iniciarBarraFormatacao } from './barra-formatacao';
import { avisarUmaVez } from './crm/ui';
import { encontrar } from './selectors';
import { varrerLista } from './varredura';

declare global {
  interface Window { __vitaZapCarregado?: boolean }
}
// Pode ser injetado de novo pelo painel (aba aberta antes da instalação): registra uma vez só.
const jaCarregado = window.__vitaZapCarregado === true;
window.__vitaZapCarregado = true;

let ocupado = false;

function emitir(evento: EventoConteudo): void {
  // O painel pode estar fechado: aí não há ouvinte e o Chrome rejeita — ignorar.
  chrome.runtime.sendMessage(evento).catch(() => undefined);
}

function idiomaSuportado(): string | null {
  const lang = document.documentElement.lang?.trim().toLowerCase();
  if (!lang || lang.startsWith('pt')) return null;
  return `O WhatsApp Web está em "${lang}". Use em português: as datas da lista são lidas como dia/mês.`;
}

function verificar(): RespostaConteudo {
  if (!encontrar(document, 'painelLateral')) {
    return { ok: false, codigo: 'nao_pronto', erro: 'WhatsApp Web não carregado (ou sem login). Abra e espere a lista de conversas aparecer.' };
  }
  const avisos: string[] = [];
  if (!encontrar(document, 'caixaBusca')) avisos.push('Caixa de busca não encontrada (seletor caixaBusca).');
  const idioma = idiomaSuportado();
  if (idioma) avisos.push(idioma);
  return { ok: true, avisos };
}

async function tratar(pedido: PedidoConteudo): Promise<RespostaConteudo> {
  registrarBatimento(); // qualquer pedido do painel prova que ele está vivo
  switch (pedido.tipo) {
    case 'batimento':
      return { ok: true };
    case 'consultarEnvio':
      return consultarEnvio(pedido.nome, pedido.texto, pedido.idsAntes);
    case 'verificar':
      return verificar();
    case 'pararObservacao':
      pararObservacao();
      return { ok: true };
    case 'limparCaixa':
      return limparCaixa(pedido.texto);
    case 'varrer': {
      const idioma = idiomaSuportado();
      if (idioma) return { ok: false, codigo: 'seletor', erro: idioma };
      const r = await varrerLista(pedido.termo, (lidas, unicas) => emitir({ tipo: 'vitaZap:progressoVarredura', lidas, unicas }));
      return { ok: true, linhas: r.linhas, avisos: r.avisos };
    }
    case 'abrirPorTelefone':
      return abrirConversaPorTelefoneSemRecarregar(pedido.telefone, pedido.nomeDica);
    case 'abrirEColar':
      return abrirEColar(pedido.nome, pedido.texto, (texto, textoConfere) =>
        emitir({ tipo: 'vitaZap:envioDetectado', nome: pedido.nome, texto, textoConfere }),
        pedido.envioAutomatico,
        emitir,
      );
  }
}

if (!jaCarregado) chrome.runtime.onMessage.addListener((mensagem: PedidoConteudo, remetente, responder: (r: RespostaConteudo) => void) => {
  if (remetente.id !== chrome.runtime.id) return false;
  const longo = mensagem.tipo === 'varrer' || mensagem.tipo === 'abrirEColar' || mensagem.tipo === 'abrirPorTelefone' || mensagem.tipo === 'consultarEnvio';
  if (longo && ocupado) {
    responder({ ok: false, codigo: 'ocupado', erro: 'Outra operação ainda está em andamento.' });
    return false;
  }
  if (longo) ocupado = true;
  tratar(mensagem)
    .then(responder)
    .catch((e: unknown) => {
      if (e instanceof ErroSeletor) responder({ ok: false, codigo: 'seletor', erro: e.message });
      else responder({ ok: false, codigo: 'interno', erro: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      if (longo) ocupado = false;
    });
  return true; // resposta assíncrona
});

// CRM dentro do WhatsApp Web (barra de abas, lembretes, notas...). Falha em silêncio.
if (!jaCarregado) iniciarBarraFormatacao();
if (!jaCarregado) iniciarCrm().catch((e: unknown) => avisarUmaVez('crm', 'Não consegui iniciar o CRM.', e));

