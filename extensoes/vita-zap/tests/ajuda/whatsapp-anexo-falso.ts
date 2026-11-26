// ⚠️ HTML SINTÉTICO (não é cópia do WhatsApp real): acrescenta ao WhatsApp falso (whatsapp-envio-falso.ts) a COLAGEM DE ARQUIVO e a
// PRÉVIA DE MÍDIA que o WhatsApp Web abre depois dela. A prévia fica FORA de #main (como um painel por cima), com X, legenda
// (contenteditable), miniatura/nome e botões configuráveis. Conta o que o código clicou.
//
// jsdom não tem DataTransfer nem ClipboardEvent: classes mínimas no lugar.

import { vi } from 'vitest';
import type { EnvioFalso } from './whatsapp-envio-falso';

export type ModoPrevia =
  | 'normal' // X + legenda + Enviar
  | 'enviar_e_programar' // Programar (ANTES do Enviar no DOM) + Enviar
  | 'so_programar' // sem Enviar: só Programar
  | 'dois_enviar' // dois botões que parecem Enviar
  | 'abre_programar' // o clique no botão (rotulado Enviar) abre "Programar mensagem"
  | 'sem_arquivo' // a prévia abre mas não mostra o arquivo (sem miniatura, sem nome)
  | 'sem_x' // sem botão de fechar
  | 'nao_abre'; // colar não abre prévia

export interface AnexoFalso {
  colados: File[];
  cliques: { enviar: number; programar: number; fechar: number };
  previa(): HTMLElement | null;
  /** O atendente aperta o botão de enviar DA PRÉVIA (envio manual). */
  atendenteEnvia(): void;
  dialogoProgramar(): HTMLElement | null;
  /** Tira o ouvinte de colagem do document (chame no afterEach). */
  desinstalar(): void;
}

class DataTransferFalso {
  files: File[] = [];
  items = { add: (f: File): void => void this.files.push(f) };
  setData(): void {}
}
class ClipboardEventFalso extends Event {
  clipboardData: DataTransferFalso | null;
  constructor(tipo: string, init?: { clipboardData?: DataTransferFalso; bubbles?: boolean; cancelable?: boolean }) {
    super(tipo, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
}

export function instalarAnexoFalso(_f: EnvioFalso, modo: ModoPrevia = 'normal'): AnexoFalso {
  vi.stubGlobal('DataTransfer', DataTransferFalso);
  vi.stubGlobal('ClipboardEvent', ClipboardEventFalso);
  const app = document.getElementById('app')!;
  const estado: AnexoFalso = {
    colados: [],
    cliques: { enviar: 0, programar: 0, fechar: 0 },
    previa: () => document.getElementById('previa'),
    dialogoProgramar: () => document.getElementById('dlg-programar'),
    atendenteEnvia: () => document.querySelector<HTMLElement>('#previa [data-k="enviar"]')?.click(),
    desinstalar: () => document.removeEventListener('paste', aoColar, true),
  };
  let n = 1;

  function abrirPrevia(arquivo: File): void {
    if (modo === 'nao_abre') return;
    const imagem = arquivo.type.startsWith('image/');
    const conteudo =
      modo === 'sem_arquivo'
        ? '<div class="vazio"></div>'
        : imagem
          ? '<div class="miniatura"><img src="blob:fake-miniatura" alt=""></div>'
          : `<div class="doc"><span data-icon="document-PDF-icon"></span><span>${arquivo.name}</span></div>`;
    const x = modo === 'sem_x' ? '' : '<button aria-label="Fechar" data-k="fechar"><span data-icon="x"></span></button>';
    const programar = '<button aria-label="Programar mensagem" data-k="programar"><span data-icon="schedule-send"></span></button>';
    const enviar = '<button aria-label="Enviar" data-k="enviar"><span data-icon="wds-ic-send-filled"></span></button>';
    const botoes =
      modo === 'enviar_e_programar'
        ? programar + enviar
        : modo === 'so_programar'
          ? programar
          : modo === 'dois_enviar'
            ? enviar + '<button data-k="enviar2"><span data-icon="send"></span></button>'
            : enviar;
    app.insertAdjacentHTML(
      'beforeend',
      `<div id="previa"><div>${x}</div>${conteudo}<div><div contenteditable="true" aria-label="Adicione uma legenda"></div>${botoes}</div></div>`,
    );
    document.getElementById('previa')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      const k = b?.getAttribute('data-k');
      if (k === 'fechar') {
        estado.cliques.fechar += 1;
        document.getElementById('dlg-programar')?.remove();
        document.getElementById('previa')?.remove();
      } else if (k === 'programar') {
        estado.cliques.programar += 1;
      } else if (k === 'enviar' || k === 'enviar2') {
        estado.cliques.enviar += 1;
        if (modo === 'abre_programar') {
          app.insertAdjacentHTML(
            'beforeend',
            '<div role="dialog" id="dlg-programar" aria-label="Programar mensagem"><h2>Programar mensagem</h2><button aria-label="Fechar" data-k="fechar-dlg"><span data-icon="x"></span></button><button aria-label="Programar" data-k="ok-prog">Programar</button></div>',
          );
          document.querySelector('#dlg-programar [data-k="fechar-dlg"]')!.addEventListener('click', () => document.getElementById('dlg-programar')?.remove());
          return;
        }
        document.getElementById('previa')?.remove();
        document.getElementById('conversa')!.insertAdjacentHTML('beforeend', `<div data-id="true_MIDIA${n++}" class="message-out"><img src="blob:fake-bolha" alt=""></div>`);
      }
    });
  }

  function aoColar(ev: Event): void {
    const alvo = ev.target as HTMLElement;
    if (!alvo.closest?.('#main footer')) return;
    const arquivos = (ev as unknown as { clipboardData: DataTransferFalso | null }).clipboardData?.files ?? [];
    for (const a of arquivos) {
      estado.colados.push(a);
      abrirPrevia(a);
    }
  }
  document.addEventListener('paste', aoColar, true);
  return estado;
}
