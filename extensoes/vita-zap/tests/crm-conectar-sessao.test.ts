// Login automático: quem já está logado no site do CRM fica logado na extensão, sem senha (mesmo cookie).
// O formulário de e-mail e senha só aparece quando o auth.me diz que não há sessão. Fetch falso, sem rede real.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conectarAoCrm, conectarAutomaticamente, esquecerTentativaAutomatica, type DependenciasConexao } from '../src/sidepanel/conexao';
import { ServicoCrm } from '../src/shared/servico-crm';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, task, type CrmFalso } from './ajuda/crm-falso';

let crm: CrmFalso;
let servico: ServicoCrm;
let permitidas: Set<string>;
let pedidos: string[];
let concede = true;

function dependencias(): DependenciasConexao {
  return {
    repo: servico,
    permissoes: {
      contains: async ({ origins }) => origins.every((o) => permitidas.has(o)),
      request: async ({ origins }) => {
        pedidos.push(...origins);
        if (concede) origins.forEach((o) => permitidas.add(o));
        return concede;
      },
    },
  };
}

beforeEach(async () => {
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000' })]);
  servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte);
  await servico.definirUrl(BASE);
  permitidas = new Set();
  pedidos = [];
  concede = true;
  esquecerTentativaAutomatica();
});

describe('ServicoCrm.conectarPelaSessao', () => {
  it('logado no site: conecta sem senha, só com auth.me, e já busca os lembretes', async () => {
    crm.logado = true;
    const r = await servico.conectarPelaSessao();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.conta.usuario).toMatchObject({ email: EMAIL, name: 'Ana' });
    expect(crm.chamadas('auth.login')).toHaveLength(0);
    expect(crm.chamadas('auth.me')).toHaveLength(1);
    expect(crm.chamadas('auth.me')[0].credentials).toBe('include');
    expect(crm.chamadas('tasks.reminders')).toHaveLength(1);
  });

  it('sem sessão no site: erro "nao-autenticado" e nada de login nem gravação de usuário', async () => {
    const r = await servico.conectarPelaSessao();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.tipo).toBe('nao-autenticado');
      expect(r.conta.usuario).toBeNull();
      expect(r.conta.erro).toBeUndefined();
    }
    expect(crm.chamadas('auth.login')).toHaveLength(0);
    expect(crm.chamadas('tasks.reminders')).toHaveLength(0);
  });

  it('sem internet: erro de rede (não confunde com "sem sessão")', async () => {
    crm.semRede = true;
    const r = await servico.conectarPelaSessao();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.tipo).toBe('rede');
  });

  it('já conectado como o mesmo usuário: confere a sessão sem buscar tudo de novo', async () => {
    crm.logado = true;
    await servico.conectarPelaSessao();
    await servico.conectarPelaSessao();
    expect(crm.chamadas('auth.me')).toHaveLength(2);
    expect(crm.chamadas('tasks.reminders')).toHaveLength(1);
  });
});

describe('conectarAoCrm (painel)', () => {
  it('sem a permissão do domínio e fora de um clique: não consulta o CRM', async () => {
    crm.logado = true;
    expect(await conectarAoCrm(dependencias(), { pedirPermissao: false })).toEqual({ tipo: 'sem-permissao' });
    expect(crm.requisicoes).toHaveLength(0);
    expect(pedidos).toEqual([]);
  });

  it('no clique: pede a permissão uma vez e conecta pela sessão do site', async () => {
    crm.logado = true;
    expect(await conectarAoCrm(dependencias(), { pedirPermissao: true })).toEqual({ tipo: 'conectado' });
    expect(pedidos).toEqual([`${BASE}/*`]);
    expect(crm.chamadas('auth.login')).toHaveLength(0);
    // Segundo clique: já conectado, não pede nem consulta de novo.
    expect(await conectarAoCrm(dependencias(), { pedirPermissao: true })).toEqual({ tipo: 'conectado' });
    expect(pedidos).toHaveLength(1);
    expect(crm.chamadas('auth.me')).toHaveLength(1);
  });

  it('permissão negada: erro claro, sem consulta ao CRM', async () => {
    concede = false;
    const r = await conectarAoCrm(dependencias(), { pedirPermissao: true });
    expect(r.tipo).toBe('erro');
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('com a permissão mas sem sessão no site: "sem-sessao" (é aqui que aparece e-mail e senha)', async () => {
    permitidas.add(`${BASE}/*`);
    expect(await conectarAoCrm(dependencias(), { pedirPermissao: false })).toEqual({ tipo: 'sem-sessao' });
  });

  it('CRM fora do ar: "erro" (o formulário não aparece por causa de rede)', async () => {
    permitidas.add(`${BASE}/*`);
    crm.semRede = true;
    const r = await conectarAoCrm(dependencias(), { pedirPermissao: false });
    expect(r.tipo).toBe('erro');
  });

  it('ao abrir o painel faz UMA tentativa, mesmo pedida por duas telas', async () => {
    crm.logado = true;
    permitidas.add(`${BASE}/*`);
    const d = dependencias();
    const espiao = vi.spyOn(d.repo, 'conectarPelaSessao');
    const [a, b] = await Promise.all([conectarAutomaticamente(d), conectarAutomaticamente(d)]);
    expect(a).toEqual({ tipo: 'conectado' });
    expect(b).toEqual({ tipo: 'conectado' });
    expect(espiao).toHaveBeenCalledTimes(1);
  });

  it('erro inesperado do repositório vira mensagem, não exceção', async () => {
    const d = dependencias();
    d.repo = { ...d.repo, conta: async () => Promise.reject(new Error('A extensão não respondeu.')) };
    expect(await conectarAoCrm(d, { pedirPermissao: true })).toEqual({ tipo: 'erro', mensagem: 'A extensão não respondeu.' });
  });
});
