// @vitest-environment jsdom
//
// Testes do Bloqueio de Tela com Vidro Embaçado (Frosted Glass / Glassmorphism):
// Garante que, ao abrir o WhatsApp Web sem autenticação no CRM Sal Vita, a tela inteira é bloqueada
// com desfoque e card de login central. Somente após login com credenciais válidas ou sessão ativa
// o WhatsApp Web e a extensão são liberados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BloqueioTelaCrm } from '../src/content/crm/bloqueio-tela';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const LINHAS: LinhaFalsa[] = [{ nome: 'Ana Souza Cliente', data: '11:40', previa: 'Quanto fica?' }];

describe('BloqueioTelaCrm (componente isolado)', () => {
  let bloqueio: BloqueioTelaCrm;

  beforeEach(() => {
    document.body.innerHTML = '';
    bloqueio = new BloqueioTelaCrm();
  });

  afterEach(() => {
    bloqueio.remover();
    document.body.innerHTML = '';
  });

  it('cria o elemento host com o ID correto e inicialmente oculto', () => {
    expect(bloqueio.h.host.id).toBe('vita-zap-bloqueio');
    expect(bloqueio.h.host.style.display).toBe('none');
    expect(bloqueio.h.host.style.zIndex).toBe('2147483000');
  });

  it('quando logado = false: anexa ao body, fica visível e exibe o card de login', () => {
    const aoEntrar = vi.fn().mockResolvedValue({ ok: true });
    const aoConectarSessao = vi.fn().mockResolvedValue({ ok: true });

    bloqueio.render({
      logado: false,
      aoEntrar,
      aoConectarSessao,
    });

    expect(bloqueio.h.host.isConnected).toBe(true);
    expect(bloqueio.h.host.style.display).toBe('block');

    const overlay = bloqueio.h.conteudo.querySelector('.bloqueio-tela');
    expect(overlay).not.toBeNull();

    const card = bloqueio.h.conteudo.querySelector('.bloqueio-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Vita Zap');
    expect(card?.textContent).toContain('CRM Sal Vita');

    const inputEmail = bloqueio.h.conteudo.querySelector('input[type="email"]') as HTMLInputElement;
    const inputSenha = bloqueio.h.conteudo.querySelector('input[type="password"]') as HTMLInputElement;
    expect(inputEmail).not.toBeNull();
    expect(inputSenha).not.toBeNull();

    const btnSessao = bloqueio.h.conteudo.querySelector('.bloqueio-btn-sessao') as HTMLButtonElement;
    expect(btnSessao).not.toBeNull();
    expect(btnSessao.textContent).toContain('Conectar com sessão ativa');
  });

  it('quando logado = true: remove o bloqueio e oculta o host', () => {
    bloqueio.render({
      logado: true,
      aoEntrar: vi.fn(),
      aoConectarSessao: vi.fn(),
    });

    expect(bloqueio.h.host.style.display).toBe('none');
    expect(bloqueio.h.conteudo.querySelector('.bloqueio-tela')).toBeNull();
  });

  it('permite autenticar via e-mail e senha e exibe mensagem de erro se inválido', async () => {
    const aoEntrar = vi.fn().mockResolvedValue({ ok: false, mensagem: 'Credenciais inválidas' });
    bloqueio.render({
      logado: false,
      aoEntrar,
      aoConectarSessao: vi.fn(),
    });

    const form = bloqueio.h.conteudo.querySelector('form') as HTMLFormElement;
    const inputEmail = bloqueio.h.conteudo.querySelector('input[type="email"]') as HTMLInputElement;
    const inputSenha = bloqueio.h.conteudo.querySelector('input[type="password"]') as HTMLInputElement;

    inputEmail.value = 'atendente@salvitar.com.br';
    inputSenha.value = 'senha123';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(aoEntrar).toHaveBeenCalledWith('atendente@salvitar.com.br', 'senha123');
    const erroEl = bloqueio.h.conteudo.querySelector('.bloqueio-erro');
    expect(erroEl?.textContent).toContain('Credenciais inválidas');
  });

  it('permite autenticar via sessão ativa do CRM', async () => {
    const aoConectarSessao = vi.fn().mockResolvedValue({ ok: true });
    bloqueio.render({
      logado: false,
      aoEntrar: vi.fn(),
      aoConectarSessao,
    });

    const btnSessao = bloqueio.h.conteudo.querySelector('.bloqueio-btn-sessao') as HTMLButtonElement;
    btnSessao.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(aoConectarSessao).toHaveBeenCalled();
    const sucessoEl = bloqueio.h.conteudo.querySelector('.bloqueio-sucesso');
    expect(sucessoEl?.textContent).toContain('Sessão do CRM reconhecida');
  });
});

describe('Integração de Bloqueio no iniciarCrm', () => {
  let ctrl: ControladorCrm | null = null;
  let crm: CrmFalso;
  let servico: ServicoCrm;
  let repo: ReturnType<typeof criarRepositorioCRM>;

  beforeEach(() => {
    limparAvisos();
    instalarChromeFalso();
    crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000' })]);
    const local = new RepositorioLocal();
    servico = new ServicoCrm(local, crm.transporte);
    repo = criarRepositorioCRM(local, servico);
    montarWhatsApp(LINHAS, 'Ana Souza Cliente');
  });

  afterEach(() => {
    ctrl?.parar();
    ctrl = null;
  });

  it('sem login no CRM: ativa a tela de bloqueio com vidro embaçado no WhatsApp Web', async () => {
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });

    // Aguarda resolução de lerConta(true)
    await new Promise((r) => setTimeout(r, 20));

    const host = document.getElementById('vita-zap-bloqueio') as HTMLElement;
    expect(host).not.toBeNull();
    expect(host.style.display).toBe('block');
    expect(host.shadowRoot?.querySelector('.bloqueio-card')).not.toBeNull();
  });

  it('com login ativo no CRM: o bloqueio NÃO é ativado e a tela permanece liberada', async () => {
    await servico.definirUrl(BASE);
    const loginRes = await servico.entrar(EMAIL, SENHA);
    expect(loginRes.ok).toBe(true);

    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });

    // Aguarda resolução de lerConta(true)
    await new Promise((r) => setTimeout(r, 20));

    const host = document.getElementById('vita-zap-bloqueio') as HTMLElement;
    expect(host.style.display).toBe('none');
  });

  it('ao parar o controlador: o bloqueio é removido do DOM', async () => {
    ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });
    await new Promise((r) => setTimeout(r, 20));

    expect(document.getElementById('vita-zap-bloqueio')).not.toBeNull();
    ctrl.parar();
    expect(document.getElementById('vita-zap-bloqueio')).toBeNull();
  });
});
