// Cenário SINTÉTICO completo (empresa, CNPJ, pessoas e consultantes inventados) com as DUAS fontes do mesmo CNPJ, passando pelo
// caminho real: JSON da API Full -> mapeadores -> consolidarRelatorios -> PDF. Reproduz a ESTRUTURA vista no relatório de um
// caso real (dois scores no Serasa Premium, consultas por janela, ação cível), mas nenhum dado de cliente real entra aqui.
import { readFileSync } from 'node:fs';
import { consolidarRelatorios, type ItemParaConsolidar, type RelatorioCredito } from '../../../shared/credito';
import { mapeadorBoaVista, mapeadorSerasaPremium, type ConteudoMapeado } from '../../../server/lib/credito/provedores/mapeadores';

export const DOC_COMPLETO = '12345678000195';
export const AGORA_COMPLETO = new Date('2026-10-16T19:00:00.000Z');

const lerJson = (nome: string): unknown => JSON.parse(readFileSync(`tests/fixtures/credito/${nome}.json`, 'utf8'));
export const brutoBoaVistaCompleto = (): unknown => lerJson('apifull-boavista-completo');
export const brutoSerasaCompleto = (): unknown => lerJson('apifull-serasa-completo');

function relatorio(conteudo: ConteudoMapeado, produto: string, consultadoEm: string, custoReais: number): RelatorioCredito {
  return { documento: DOC_COMPLETO, tipo: 'CNPJ', consultadoEm, fonte: { provedor: 'boavista_apifull', produto, custoReais }, ...conteudo };
}

export const relatorioBoaVistaCompleto = (): RelatorioCredito =>
  relatorio(mapeadorBoaVista(brutoBoaVistaCompleto()), 'Consulta simples', '2026-10-16T18:02:00.000Z', 2.75);
export const relatorioSerasaCompleto = (): RelatorioCredito =>
  relatorio(mapeadorSerasaPremium(brutoSerasaCompleto()), 'Serasa Premium', '2026-10-16T18:03:00.000Z', 6.72);

export const itensCompletos = (): ItemParaConsolidar[] => [
  { relatorio: relatorioBoaVistaCompleto(), produto: 'boavista', produtoNome: 'Consulta simples', consultadoEm: '2026-10-16T18:02:00.000Z' },
  { relatorio: relatorioSerasaCompleto(), produto: 'serasa_premium', produtoNome: 'Serasa Premium', consultadoEm: '2026-10-16T18:03:00.000Z' },
];

export const consolidadoCompleto = (itens: ItemParaConsolidar[] = itensCompletos()) => consolidarRelatorios(itens, AGORA_COMPLETO);

export const brutosCompletos = (): Array<{ produto: string; bruto: unknown }> => [
  { produto: 'boavista', bruto: brutoBoaVistaCompleto() },
  { produto: 'serasa_premium', bruto: brutoSerasaCompleto() },
];
