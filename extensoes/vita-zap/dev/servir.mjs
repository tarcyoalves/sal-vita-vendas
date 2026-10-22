// Servidor estático mínimo para o harness visual (sem dependências). Serve a pasta da extensão.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const porta = Number(process.env.PORT ?? 5288);
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let caminho = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (caminho === '/') caminho = '/dev/harness.html';
  const arquivo = normalize(join(raiz, caminho));
  if (!arquivo.startsWith(raiz)) return void res.writeHead(403).end();
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'content-type': tipos[extname(arquivo)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(dados);
  } catch {
    res.writeHead(404).end('não encontrado');
  }
}).listen(porta, '127.0.0.1', () => console.log(`Harness do Vita Zap em http://localhost:${porta}/`));
