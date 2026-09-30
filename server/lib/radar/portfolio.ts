// Radar da carteira: junta o que o CRM já sabe (pedidos, clientes e tarefas) perto da cidade
// da carga. Funções puras — sem banco — para testar de verdade. A busca no banco fica no router.
import { haversineKm, municipioByNomeUf, normalizeName, type Municipio } from './geo';
import type { RadarCarteiraFonte, RadarCarteiraItem } from '../../../shared/radar';

export const CARTEIRA_MAX_ITENS = 300;

export interface CarteiraEntrada {
  fonte: RadarCarteiraFonte;
  nome: string;
  cnpj?: string | null;
  cidade: string;
  uf: string;
  telefone?: string | null;
  atendente?: string | null;
  pedido?: { faturado: boolean; data: string | null; valor: number };
  tarefa?: { id: number; convertida: boolean };
}

/**
 * Cidade e UF de um texto do padrão do CRM: "CIDADE - UF" (descrição da tarefa) ou
 * "NOME - CIDADE - UF" (título). Pega os dois últimos trechos; UF precisa ter 2 letras.
 */
export function parseCidadeUf(texto: string | null | undefined): { cidade: string; uf: string } | null {
  if (!texto) return null;
  const partes = texto.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const uf = partes[partes.length - 1].toUpperCase();
  const cidade = partes[partes.length - 2];
  if (!/^[A-Z]{2}$/.test(uf) || !cidade) return null;
  return { cidade, uf };
}

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function consolidarCarteira(
  entradas: CarteiraEntrada[],
  origin: Pick<Municipio, 'lat' | 'lon'>,
  radiusKm: number,
): { itens: RadarCarteiraItem[]; truncated: boolean; semLocalizacao: number } {
  const grupos = new Map<string, RadarCarteiraItem>();
  // Quem tem CNPJ num registro e só nome em outro é o mesmo cliente: o telefone de um vale para o outro.
  const chaveNome = new Map<string, string>();
  const telPorNome = new Map<string, string>();
  let semLocalizacao = 0;

  for (const e of entradas) {
    const mun = municipioByNomeUf(e.cidade, e.uf);
    if (!mun) { semLocalizacao++; continue; }
    const distanceKm = haversineKm(origin.lat, origin.lon, mun.lat, mun.lon);
    if (distanceKm > radiusKm) continue;

    const cnpj = soDigitos(e.cnpj);
    const chave = cnpj.length === 14 ? `c${cnpj}` : `n${normalizeName(e.nome)}|${mun.ibge}`;
    let item = grupos.get(chave);
    if (!item) {
      item = {
        chave, nome: e.nome.trim(), cnpj: cnpj.length === 14 ? cnpj : null, cidade: mun.nome, uf: mun.uf,
        distanceKm: Math.round(distanceKm * 10) / 10, fontes: [], pedidos: 0, faturados: 0, totalFaturado: 0,
        ultimaCompraEm: null, atendentes: [], telefone: null, tarefas: [],
      };
      grupos.set(chave, item);
    }
    if (e.nome.trim().length > item.nome.length) item.nome = e.nome.trim();
    if (!item.fontes.includes(e.fonte)) item.fontes.push(e.fonte);
    if (e.atendente && !item.atendentes.some((a) => normalizeName(a) === normalizeName(e.atendente!))) item.atendentes.push(e.atendente.trim());
    const tel = soDigitos(e.telefone);
    const nomeKey = `${normalizeName(e.nome)}|${mun.ibge}`;
    chaveNome.set(chave, nomeKey);
    if (tel.length >= 10 && tel.length <= 13) {
      if (!item.telefone) item.telefone = tel;
      if (!telPorNome.has(nomeKey)) telPorNome.set(nomeKey, tel);
    }
    if (e.tarefa && !item.tarefas.some((t) => t.id === e.tarefa!.id)) item.tarefas.push(e.tarefa);
    if (e.pedido) {
      item.pedidos++;
      if (e.pedido.faturado) {
        item.faturados++;
        item.totalFaturado = Math.round((item.totalFaturado + e.pedido.valor) * 100) / 100;
        if (e.pedido.data && (!item.ultimaCompraEm || e.pedido.data > item.ultimaCompraEm)) item.ultimaCompraEm = e.pedido.data;
      }
    }
  }

  for (const item of grupos.values()) {
    if (!item.telefone) item.telefone = telPorNome.get(chaveNome.get(item.chave) ?? '') ?? null;
  }

  // Mais perto primeiro; quem já comprou vem antes de quem nunca comprou na mesma distância.
  const itens = [...grupos.values()].sort(
    (a, b) => a.distanceKm - b.distanceKm || b.faturados - a.faturados || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  return { itens: itens.slice(0, CARTEIRA_MAX_ITENS), truncated: itens.length > CARTEIRA_MAX_ITENS, semLocalizacao };
}
