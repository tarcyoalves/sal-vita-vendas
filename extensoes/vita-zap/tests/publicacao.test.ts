// O que `npm run publicar` gera (client/public/vita-zap/) tem que estar em dia com a extensão: se a versão do
// manifest subir e ninguém rodar `npm run publicar`, o site continuaria oferecendo o zip antigo.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs de ferramenta (sem tipos)
import { criarZip } from '../dev/publicar.mjs';

const RAIZ = join(__dirname, '..');
const PUBLICADO = join(RAIZ, '..', '..', 'client', 'public', 'vita-zap');
const manifesto = JSON.parse(readFileSync(join(RAIZ, 'public', 'manifest.json'), 'utf8')) as { version: string; key: string };

/** Leitor mínimo de zip (diretório central) só para conferir o conteúdo. */
function lerZip(zip: Buffer): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    const comprimido = zip.readUInt32LE(p + 20);
    const nomeLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const comentLen = zip.readUInt16LE(p + 32);
    const deslocamento = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + nomeLen).toString('utf8');
    const dados = deslocamento + 30 + zip.readUInt16LE(deslocamento + 26) + zip.readUInt16LE(deslocamento + 28);
    arquivos.set(nome, inflateRawSync(zip.subarray(dados, dados + comprimido)));
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return arquivos;
}

describe('criarZip', () => {
  it('guarda nomes com "/" e conteúdo íntegro, e é determinístico', () => {
    const itens = [
      { nome: 'manifest.json', dados: Buffer.from('{"a":1}') },
      { nome: 'assets/x.js', dados: Buffer.from('console.log("olá")'.repeat(50)) },
    ];
    const zip: Buffer = criarZip(itens);
    const lido = lerZip(zip);
    expect([...lido.keys()]).toEqual(['manifest.json', 'assets/x.js']);
    expect(lido.get('assets/x.js')?.toString()).toBe(itens[1].dados.toString());
    expect(criarZip(itens).equals(zip)).toBe(true);
  });
});

describe('arquivos publicados no site do CRM', () => {
  it('versao.json e o zip têm a versão do manifest (rode `npm run publicar` se falhar)', () => {
    const versao = JSON.parse(readFileSync(join(PUBLICADO, 'versao.json'), 'utf8')) as { versao: string; data: string };
    expect(versao.versao).toBe(manifesto.version);
    expect(versao.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dentro = lerZip(readFileSync(join(PUBLICADO, 'vita-zap.zip')));
    const manifestoDoZip = JSON.parse(dentro.get('manifest.json')?.toString() ?? '{}') as { version: string; key: string };
    expect(manifestoDoZip.version).toBe(manifesto.version);
    expect(manifestoDoZip.key).toBe(manifesto.key); // mesmo ID: o Chrome trata como a mesma extensão
    for (const f of ['background.js', 'content.js', 'sidepanel.html', 'icon-128.png']) expect(dentro.has(f), f).toBe(true);
  });

  it('o instalador publicado é idêntico ao da pasta instalador/', () => {
    for (const f of ['Instalar-VitaZap.cmd', 'Atualizar-VitaZap.ps1']) {
      expect(existsSync(join(PUBLICADO, f)), f).toBe(true);
      expect(readFileSync(join(PUBLICADO, f)).equals(readFileSync(join(RAIZ, 'instalador', f))), f).toBe(true);
    }
  });
});

describe('instalador do Windows (conferência do texto; a lógica roda em Pester: instalador/Atualizar-VitaZap.Tests.ps1)', () => {
  const ps1 = readFileSync(join(RAIZ, 'instalador', 'Atualizar-VitaZap.ps1'), 'utf8');
  const cmd = readFileSync(join(RAIZ, 'instalador', 'Instalar-VitaZap.cmd'), 'utf8');

  it('o .cmd chama o .ps1 com ExecutionPolicy Bypass e não pede administrador', () => {
    expect(cmd).toMatch(/powershell[^\n]*-ExecutionPolicy Bypass -File/);
    expect(cmd).not.toMatch(/runas|Start-Process[^\n]*-Verb/i);
  });

  it('o .ps1 confere o ID, só confia em https (ou localhost), troca por pasta .novo e não mexe em registro nem em serviços', () => {
    expect(ps1).toContain("'anlifdaoagpcbdjpbflodkcialbdbghh'");
    expect(ps1).toMatch(/\^https:\/\//);
    expect(ps1).toContain('.novo');
    expect(ps1).toContain('Id-DaChave');
    expect(ps1).not.toMatch(/HKLM|HKCU|New-Service|Set-ExecutionPolicy|-Verb\s+RunAs/i);
    // Única tarefa agendada permitida (pedido do dono em 22/10/2026): a de hora em hora, do próprio usuário,
    // sem conta de sistema nem privilégio elevado.
    expect(ps1.match(/schtasks\.exe[^\n]*/g)).toEqual(['schtasks.exe /Create /F /SC HOURLY /TN $NomeTarefa /TR $tr 2>&1']);
    expect(ps1).not.toMatch(/\/RU\b|\/RL\s+HIGHEST|SYSTEM/i);
  });

  it('o .ps1 tem BOM UTF-8 (PowerShell 5.1 lê os acentos)', () => {
    expect(readFileSync(join(RAIZ, 'instalador', 'Atualizar-VitaZap.ps1')).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
  });
});
