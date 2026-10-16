// Gera os PDFs de exemplo (dados fictícios) em docs/exemplos/. Uso: npx tsx scripts/credito/gerar-exemplos.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularVeredito } from '../../shared/credito';
import type { RelatorioCredito } from '../../shared/credito';
import { gerarPdfCredito, gerarPdfCreditoConsolidado } from '../../server/lib/credito/pdf';
import { mapeadorBoaVista } from '../../server/lib/credito/provedores/mapeadores';
import { exemploLimpo } from '../../tests/fixtures/credito/exemplo-limpo';
import { exemploRestricao } from '../../tests/fixtures/credito/exemplo-restricao';
import { brutosCompletos, consolidadoCompleto } from '../../tests/fixtures/credito/consolidado-completo';

async function gerar(r: RelatorioCredito, arquivo: string, bruto?: unknown) {
  const { veredito, motivos } = calcularVeredito(r);
  const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Usuário de Exemplo (admin)' }, bruto);
  const destino = join(process.cwd(), 'docs', 'exemplos', arquivo);
  writeFileSync(destino, pdf);
  console.log(`${destino} (${pdf.length} bytes) - ${veredito}`);
}

async function main() {
  mkdirSync(join(process.cwd(), 'docs', 'exemplos'), { recursive: true });
  await gerar(exemploLimpo, 'relatorio-credito-limpo.pdf');
  await gerar(exemploRestricao, 'relatorio-credito-restricao.pdf');
  // caso volumoso (29 protestos, 19 consultas): resposta bruta fictícia passada ao gerador
  const bruto = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'credito', 'apifull-boavista-volumoso.json'), 'utf8')) as unknown;
  const m = mapeadorBoaVista(bruto);
  await gerar({ ...exemploLimpo, ...m, socios: exemploLimpo.socios, fonte: { provedor: 'boavista_apifull', produto: 'boavista', custoReais: null } }, 'relatorio-credito-volumoso.pdf', bruto);
  // consolidado das duas fontes (Consulta simples + Serasa Premium) de um CNPJ fictício: 2 scores no Serasa, divergências, ação cível
  const consolidado = await gerarPdfCreditoConsolidado(consolidadoCompleto(), { consultadoPor: 'Usuário de Exemplo (admin)' }, brutosCompletos());
  const destino = join(process.cwd(), 'docs', 'exemplos', 'relatorio-credito-consolidado.pdf');
  writeFileSync(destino, consolidado);
  console.log(`${destino} (${consolidado.length} bytes) - consolidado`);
}
main().catch((e) => { console.error(e); process.exit(1); });
