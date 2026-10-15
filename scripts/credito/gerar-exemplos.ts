// Gera os PDFs de exemplo (dados fictícios) em docs/exemplos/. Uso: npx tsx scripts/credito/gerar-exemplos.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularVeredito } from '../../shared/credito';
import type { RelatorioCredito } from '../../shared/credito';
import { gerarPdfCredito } from '../../server/lib/credito/pdf';
import { exemploLimpo } from '../../tests/fixtures/credito/exemplo-limpo';
import { exemploRestricao } from '../../tests/fixtures/credito/exemplo-restricao';

async function gerar(r: RelatorioCredito, arquivo: string) {
  const { veredito, motivos } = calcularVeredito(r);
  const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Usuário de Exemplo (admin)' });
  const destino = join(process.cwd(), 'docs', 'exemplos', arquivo);
  writeFileSync(destino, pdf);
  console.log(`${destino} (${pdf.length} bytes) - ${veredito}`);
}

async function main() {
  mkdirSync(join(process.cwd(), 'docs', 'exemplos'), { recursive: true });
  await gerar(exemploLimpo, 'relatorio-credito-limpo.pdf');
  await gerar(exemploRestricao, 'relatorio-credito-restricao.pdf');
}
main().catch((e) => { console.error(e); process.exit(1); });
