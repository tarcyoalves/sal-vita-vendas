// O ID fixo da extensão vem da chave pública em `key` do manifest. O servidor (shared/extensao.ts, na raiz)
// só aceita esta origem: se este teste falhar, o CRM vai recusar a extensão (403 "Origem não permitida").

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ID_DA_EXTENSAO, ORIGEM_DA_EXTENSAO } from '../src/shared/constantes';

const manifesto = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'manifest.json'), 'utf8')) as Record<string, unknown>;

describe('ID fixo da extensão', () => {
  it('o ID das constantes é o derivado da chave pública do manifest', () => {
    const der = Buffer.from(String(manifesto.key), 'base64');
    const id = createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    expect(id).toBe(ID_DA_EXTENSAO);
    expect(ORIGEM_DA_EXTENSAO).toBe(`chrome-extension://${id}`);
  });

  it('o mesmo ID está em shared/extensao.ts do servidor (raiz do repositório)', () => {
    const servidor = readFileSync(join(__dirname, '..', '..', '..', 'shared', 'extensao.ts'), 'utf8');
    expect(servidor).toContain(`'${ID_DA_EXTENSAO}'`);
  });

  it('o manifest nunca leva chave privada e o CRM é host opcional (pedido ao usuário no login)', () => {
    expect(JSON.stringify(manifesto)).not.toMatch(/PRIVATE KEY/);
    expect(manifesto.optional_host_permissions).toContain('https://lembretes.salvitarn.com.br/*');
    expect(manifesto.version).toBe('0.5.1');
  });
});
