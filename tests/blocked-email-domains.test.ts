import { describe, it, expect } from 'vitest';
import { isBlockedEmail, blockedEmailPattern, BLOCKED_EMAIL_ADDRESSES } from '../shared/blockedEmailDomains';

describe('isBlockedEmail', () => {
  it.each([
    'salves@gruposmabrasil.com.br',
    'SALVES@GrupoSMABrasil.com.br',
    '  salves@gruposmabrasil.com.br  ',
    'qualquer@gruposmabrasil.com.br',
    'a@mail.gruposmabrasil.com.br',
    'Fulano <fulano@gruposmabrasil.com.br>',
    'ok@outro.com; x@gruposmabrasil.com.br',
    'salsalinasrn@gmail.com',
    'SALSALINASRN@GMAIL.COM',
    'salinas.rn@outlook.com',
    'contato@salinasdorn.com.br',
  ])('bloqueia %s', (email) => {
    expect(isBlockedEmail(email)).toBe(true);
  });

  it.each([
    'fulano@salvitarn.com.br',
    'a@gruposmabrasil.com',
    'a@gruposmabrasil.com.br.outro.com',
    'a@xgruposmabrasil.com.br',
    'maria@salvitarn.com.br',
    'noreply@premium.salvitarn.com.br',
    'cliente@gmail.com',
    'salao@gmail.com',
    'gruposmabrasil.com.br',
    '',
    null,
    undefined,
  ])('não bloqueia %s', (email) => {
    expect(isBlockedEmail(email as string | null | undefined)).toBe(false);
  });

  it('todo endereço semeado nas listas de supressão é bloqueado pela regra', () => {
    for (const a of BLOCKED_EMAIL_ADDRESSES) expect(isBlockedEmail(a)).toBe(true);
  });

  it('o padrão usa só sintaxe comum a JavaScript e PostgreSQL', () => {
    const p = blockedEmailPattern(['exemplo.com.br'], []);
    expect(p).toBe('@([a-z0-9-]+\\.)*(?:exemplo\\.com\\.br)([^a-z0-9.-]|$)');
  });
});
