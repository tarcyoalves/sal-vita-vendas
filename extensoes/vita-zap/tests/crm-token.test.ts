// Ciclo de vida do token Bearer que a extensão guarda (vz.crm.conta): só vai para o servidor configurado,
// some quando a sessão cai (401), no "sair" e ao trocar o endereço do CRM, e nunca é reaproveitado de uma
// sessão anterior. Fetch falso, sem rede real.

import { beforeEach, describe, expect, it } from 'vitest';
import { ServicoCrm } from '../src/shared/servico-crm';
import { CHAVES_CRM } from '../src/shared/crm-remoto';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

let crm: CrmFalso;
let arm: ReturnType<typeof criarArmazemMemoria>;
let servico: ServicoCrm;

const tokenGuardado = () => (arm.dados.get(CHAVES_CRM.conta) as { token?: string | null } | undefined)?.token ?? null;
const ultimaAuth = () => crm.requisicoes.at(-1)?.authorization ?? null;

beforeEach(async () => {
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000' })]);
  crm.token = 'tok-1';
  arm = criarArmazemMemoria();
  servico = new ServicoCrm(arm, crm.transporte);
  await servico.definirUrl(BASE);
});

describe('token da sessão do CRM', () => {
  it('login guarda o token e as chamadas seguintes vão com Bearer, só para o servidor configurado', async () => {
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
    expect(tokenGuardado()).toBe('tok-1');
    await servico.verificarSessao();
    expect(ultimaAuth()).toBe('Bearer tok-1');
    expect(crm.requisicoes.every((r) => r.url.origin === BASE)).toBe(true);
  });

  it('sessão que cai (401) apaga o token guardado', async () => {
    await servico.entrar(EMAIL, SENHA);
    crm.logado = false; // senha trocada, sessão revogada ou expirada no servidor
    await servico.leadDoContato({ chave: 'tel:5584999990000', nome: 'Ana', telefone: '5584999990000' } as never);
    expect((await servico.conta()).usuario).toBeNull();
    expect(tokenGuardado()).toBeNull();
  });

  it('sair apaga o token e a próxima chamada sai sem Authorization', async () => {
    await servico.entrar(EMAIL, SENHA);
    await servico.sair();
    expect(tokenGuardado()).toBeNull();
    await servico.conectarPelaSessao();
    expect(ultimaAuth()).toBeNull();
  });

  it('trocar o endereço do CRM descarta o token (nunca vai para outro servidor)', async () => {
    await servico.entrar(EMAIL, SENHA);
    await servico.definirUrl('https://outro-crm.teste.local');
    expect(tokenGuardado()).toBeNull();
  });

  it('novo login sem token na resposta não reaproveita o token da sessão anterior', async () => {
    await servico.entrar(EMAIL, SENHA);
    crm.token = null; // servidor deixou de devolver token
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
    expect(tokenGuardado()).toBeNull();
  });
});
