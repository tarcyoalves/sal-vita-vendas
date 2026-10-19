import { describe, it, expect } from 'vitest';
import { ehErroDeCotaDoBanco, mensagemSeguraDeBanco } from '../server/lib/dbErro';

describe('erros de banco na tela', () => {
  const sql = 'Failed query: select "id" from "users" where lower("users"."email") = $1 params: fulano@x.com,fulano@x.com,1';
  it('esconde SQL/parâmetros', () => {
    const m = mensagemSeguraDeBanco(sql);
    expect(m).toBeTruthy();
    expect(m).not.toMatch(/select|users|fulano/i);
  });
  it('cota do Neon vira aviso ao administrador', () => {
    expect(ehErroDeCotaDoBanco('Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota."}')).toBe(true);
    expect(mensagemSeguraDeBanco(sql, 'Server error (HTTP status 402): exceeded the quota')).toMatch(/limite do plano/);
  });
  it('mensagens do próprio sistema passam intactas', () => {
    expect(mensagemSeguraDeBanco('E-mail ou senha incorretos')).toBeNull();
  });
});
