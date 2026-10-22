// Publica a extensão no site do CRM (arquivos ESTÁTICOS em client/public/vita-zap/, copiados para o deploy pelo
// build do client). Rode via `npm run publicar` (faz o build antes). Gera:
//   vita-zap.zip            o conteúdo de dist/ (manifest.json na raiz do zip)
//   versao.json             { versao, data }: lido pela página /vita-zap, pelo aviso da extensão e pelo atualizador
//   Instalar-VitaZap.cmd e Atualizar-VitaZap.ps1   o instalador/atualizador do Windows (pasta instalador/)
// O zip é determinístico (ordem e datas fixas): publicar de novo sem mudar nada não muda o arquivo.

import { deflateRawSync } from 'node:zlib';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const DESTINO = join(RAIZ, '..', '..', 'client', 'public', 'vita-zap');

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listar(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? listar(p) : [p];
    });
}

/** Zip mínimo (deflate, nomes UTF-8, data fixa 01/01/1980). */
export function criarZip(arquivos) {
  const partes = [];
  const central = [];
  let deslocamento = 0;
  for (const { nome, dados } of arquivos) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const comprimido = deflateRawSync(dados, { level: 9 });
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // data 01/01/1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nomeBuf, comprimido);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comprimido.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(nomeBuf.length, 28);
    c.writeUInt32LE(deslocamento, 42);
    central.push(c, nomeBuf);
    deslocamento += local.length + nomeBuf.length + comprimido.length;
  }
  const dirCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dirCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, dirCentral, fim]);
}

function publicar() {
  const manifesto = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  const versao = String(manifesto.version);
  const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  if (pacote.version !== versao) throw new Error(`package.json (${pacote.version}) e dist/manifest.json (${versao}) estão em versões diferentes: rode o build.`);
  if (!manifesto.key) throw new Error('dist/manifest.json sem "key": o ID da extensão mudaria.');

  const arquivos = listar(DIST).map((p) => ({ nome: relative(DIST, p).split('\\').join('/'), dados: readFileSync(p) }));
  if (!arquivos.some((a) => a.nome === 'manifest.json')) throw new Error('manifest.json não está na raiz do dist.');

  mkdirSync(DESTINO, { recursive: true });
  const zip = criarZip(arquivos);
  writeFileSync(join(DESTINO, 'vita-zap.zip'), zip);
  writeFileSync(join(DESTINO, 'versao.json'), `${JSON.stringify({ versao, data: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  for (const f of ['Instalar-VitaZap.cmd', 'Atualizar-VitaZap.ps1']) copyFileSync(join(RAIZ, 'instalador', f), join(DESTINO, f));
  console.log(`Publicado: vita-zap ${versao}, ${arquivos.length} arquivos, ${(zip.length / 1024).toFixed(0)} KB -> ${DESTINO}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) publicar();
