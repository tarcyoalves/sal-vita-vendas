// Filtra a lista de conversas do WhatsApp ESCONDENDO linhas (display:none). Não reordena nem
// remove nada do DOM do WhatsApp.
//
// A lista é virtualizada: cada linha é posicionada por transform: translateY(Npx). Esconder uma
// linha deixaria um buraco, então as linhas que ficam são "encostadas" no topo reescrevendo o
// translateY delas (e o original é lembrado para restaurar). Se as linhas não usam transform
// (lista comum), basta esconder.

interface Registro {
  /** Último transform que NÓS escrevemos. Se o elemento tiver outro, quem mexeu foi o WhatsApp. */
  aplicado: string;
  original: string;
}

const registros = new WeakMap<HTMLElement, Registro>();
const ocultos = new WeakSet<HTMLElement>();

function posicaoDoTransform(t: string): number | null {
  const m = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(t);
  return m ? Number(m[1]) : null;
}

/** Elemento (a própria linha ou um ancestral próximo) que carrega o translateY. */
function alvoDoTransform(el: HTMLElement): HTMLElement | null {
  let atual: HTMLElement | null = el;
  for (let i = 0; i < 4 && atual; i += 1) {
    if (posicaoDoTransform(atual.style?.transform ?? '') != null) return atual;
    atual = atual.parentElement;
  }
  return null;
}

function posicaoOriginal(alvo: HTMLElement): number | null {
  const reg = registros.get(alvo);
  const atual = alvo.style.transform;
  if (reg && atual === reg.aplicado) return posicaoDoTransform(reg.original);
  return posicaoDoTransform(atual);
}

function restaurar(alvo: HTMLElement): void {
  const reg = registros.get(alvo);
  if (reg) {
    if (alvo.style.transform === reg.aplicado) alvo.style.transform = reg.original;
    registros.delete(alvo);
  }
  if (ocultos.has(alvo)) {
    alvo.style.display = '';
    ocultos.delete(alvo);
  }
}

export interface ItemFiltro {
  el: HTMLElement;
  mostrar: boolean;
}

/** `ativo` falso desfaz tudo (devolve as linhas como o WhatsApp as deixou). */
export function aplicarFiltroNaLista(itens: ItemFiltro[], ativo: boolean): void {
  const alvos = itens.map((i) => {
    const comTransform = alvoDoTransform(i.el);
    const alvo = comTransform ?? i.el;
    return { alvo, comTransform: comTransform != null, mostrar: i.mostrar, pos: comTransform ? posicaoOriginal(comTransform) : null };
  });
  if (!ativo) {
    for (const a of alvos) restaurar(a.alvo);
    return;
  }
  const ordenados = [...alvos].sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity));
  // Altura de uma linha = menor distância entre posições vizinhas (padrão: 72 px).
  let espaco = 72;
  const posicoes = ordenados.map((a) => a.pos).filter((p): p is number => p != null);
  let menor = Infinity;
  for (let i = 1; i < posicoes.length; i += 1) {
    const d = posicoes[i] - posicoes[i - 1];
    if (d > 0 && d < menor) menor = d;
  }
  if (Number.isFinite(menor)) espaco = menor;

  let k = 0;
  for (const a of ordenados) {
    if (!a.mostrar) {
      if (a.alvo.style.display !== 'none') a.alvo.style.display = 'none';
      ocultos.add(a.alvo);
      continue;
    }
    if (ocultos.has(a.alvo)) {
      a.alvo.style.display = '';
      ocultos.delete(a.alvo);
    }
    if (a.comTransform && a.pos != null) {
      const t = `translateY(${k * espaco}px)`;
      const atual = a.alvo.style.transform;
      if (atual !== t) {
        const reg = registros.get(a.alvo);
        registros.set(a.alvo, { aplicado: t, original: reg && atual === reg.aplicado ? reg.original : atual });
        a.alvo.style.transform = t;
      }
    }
    k += 1;
  }
}
