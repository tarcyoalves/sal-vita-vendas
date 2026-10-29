// Bloqueio de Tela — Vidro Embaçado (Frosted Glass / Glassmorphism)
//
// Quando a extensão Vita Zap está instalada mas o atendente NÃO está autenticado no CRM:
// A tela inteira do WhatsApp Web fica desfocada como vidro embaçado (backdrop-filter: blur(20px)),
// exibindo apenas um card central de login seguro para autenticação com a conta do CRM Sal Vita.
// Só libera o WhatsApp Web e as ferramentas da extensão para quem estiver logado corretamente no CRM.

import { criarHost, h, isolarCliques, logoVz, sincronizarTema, type Host } from './ui';

export interface PropsBloqueio {
  logado: boolean;
  aoEntrar: (email: string, senha: string) => Promise<{ ok: boolean; mensagem?: string }>;
  aoConectarSessao: () => Promise<{ ok: boolean; mensagem?: string }>;
  aoAbrirPainel?: () => void;
}

export class BloqueioTelaCrm {
  readonly h: Host = criarHost('vita-zap-bloqueio');
  private ocupado = false;
  private erroMsg: string | null = null;
  private sucessoMsg: string | null = null;
  private propsAtuais: PropsBloqueio | null = null;
  private estaVisivel = false;

  constructor() {
    Object.assign(this.h.host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '2147483000',
      display: 'none',
    });
    isolarCliques(this.h.host);
  }

  garantirNoLugar(): void {
    sincronizarTema(this.h.host);
    if (!this.h.host.isConnected && document.body) {
      document.body.prepend(this.h.host);
    }
  }

  render(props: PropsBloqueio): void {
    this.propsAtuais = props;
    sincronizarTema(this.h.host);
    this.garantirNoLugar();

    // Se o usuário está logado, remove o bloqueio
    if (props.logado) {
      if (this.estaVisivel) {
        this.desbloquear();
      } else {
        this.h.host.style.display = 'none';
      }
      return;
    }

    // Não logado: ativa a tela de vidro embaçado
    this.estaVisivel = true;
    this.h.host.style.display = 'block';
    this.desenhar();
  }

  private desbloquear(): void {
    const overlay = this.h.conteudo.querySelector('.bloqueio-tela');
    if (overlay) {
      overlay.classList.add('desbloqueando');
      setTimeout(() => {
        this.h.host.style.display = 'none';
        this.estaVisivel = false;
        this.h.conteudo.innerHTML = '';
      }, 350);
    } else {
      this.h.host.style.display = 'none';
      this.estaVisivel = false;
    }
  }

  private desenhar(): void {
    const props = this.propsAtuais;
    if (!props) return;

    this.h.conteudo.innerHTML = '';

    let inputEmail: HTMLInputElement;
    let inputSenha: HTMLInputElement;

    const form = h(
      'form',
      {
        class: 'bloqueio-form',
        onsubmit: async (ev: Event) => {
          ev.preventDefault();
          if (this.ocupado) return;
          const email = inputEmail.value.trim();
          const senha = inputSenha.value;
          if (!email || !senha) {
            this.erroMsg = 'Preencha o e-mail e a senha do CRM.';
            this.desenhar();
            return;
          }
          this.ocupado = true;
          this.erroMsg = null;
          this.sucessoMsg = null;
          this.desenhar();
          try {
            const res = await props.aoEntrar(email, senha);
            if (res.ok) {
              this.sucessoMsg = 'Autenticado com sucesso! Desbloqueando...';
              this.desenhar();
              setTimeout(() => this.desbloquear(), 400);
            } else {
              this.erroMsg = res.mensagem || 'E-mail ou senha incorretos.';
              this.ocupado = false;
              this.desenhar();
            }
          } catch (e) {
            this.erroMsg = e instanceof Error ? e.message : 'Falha ao conectar com o CRM.';
            this.ocupado = false;
            this.desenhar();
          }
        },
      },
      h(
        'div',
        {},
        h('label', { class: 'bloqueio-campo-label' }, 'E-mail do CRM'),
        (inputEmail = h('input', {
          type: 'email',
          class: 'bloqueio-input',
          placeholder: 'seu-email@salvitar.com.br',
          required: true,
          disabled: this.ocupado,
        })),
      ),
      h(
        'div',
        {},
        h('label', { class: 'bloqueio-campo-label' }, 'Senha'),
        (inputSenha = h('input', {
          type: 'password',
          class: 'bloqueio-input',
          placeholder: '••••••••',
          required: true,
          disabled: this.ocupado,
        })),
      ),
      this.erroMsg ? h('div', { class: 'bloqueio-erro', role: 'alert' }, this.erroMsg) : null,
      this.sucessoMsg ? h('div', { class: 'bloqueio-sucesso', role: 'status' }, this.sucessoMsg) : null,
      h(
        'button',
        {
          type: 'submit',
          class: 'bloqueio-btn-entrar',
          disabled: this.ocupado,
        },
        this.ocupado ? 'Autenticando no CRM…' : 'Entrar e Desbloquear WhatsApp',
      ),
    );

    const btnSessao = h(
      'button',
      {
        type: 'button',
        class: 'bloqueio-btn-sessao',
        disabled: this.ocupado,
        onclick: async () => {
          if (this.ocupado) return;
          this.ocupado = true;
          this.erroMsg = null;
          this.sucessoMsg = null;
          this.desenhar();
          try {
            const res = await props.aoConectarSessao();
            if (res.ok) {
              this.sucessoMsg = 'Sessão do CRM reconhecida! Desbloqueando...';
              this.desenhar();
              setTimeout(() => this.desbloquear(), 400);
            } else {
              this.erroMsg = res.mensagem || 'Nenhuma sessão ativa encontrada no site do CRM. Use o formulário abaixo.';
              this.ocupado = false;
              this.desenhar();
            }
          } catch (e) {
            this.erroMsg = e instanceof Error ? e.message : 'Falha ao verificar sessão do site.';
            this.ocupado = false;
            this.desenhar();
          }
        },
      },
      '⚡ Conectar com sessão ativa do CRM',
    );

    const card = h(
      'div',
      { class: 'bloqueio-card' },
      h(
        'div',
        { class: 'bloqueio-marca' },
        h(
          'div',
          { class: 'bloqueio-logo-wrapper' },
          logoVz(48),
          h('span', { class: 'bloqueio-cadeado', title: 'Segurança Obrigatória' }, '🔒'),
        ),
        h('h2', { class: 'bloqueio-titulo' }, 'Vita Zap', h('span', { class: 'bloqueio-badge' }, 'CRM Sal Vita')),
      ),
      h(
        'p',
        { class: 'bloqueio-desc' },
        'Acesso restrito à equipe comercial autorizada. Para desbloquear o WhatsApp Web e os recursos comerciais, autentique-se com sua conta do CRM.',
      ),
      btnSessao,
      h('div', { class: 'bloqueio-divisor' }, h('span', {}, 'ou entre com e-mail e senha')),
      form,
      h(
        'div',
        { class: 'bloqueio-link-wrapper', style: 'text-align: center; margin: 10px 0 4px;' },
        h(
          'a',
          {
            href: 'https://lembretes.salvitarn.com.br',
            target: '_blank',
            rel: 'noreferrer',
            class: 'bloqueio-link-externo',
            style: 'color: var(--vz-primaria, #25d366); font-size: 12px; text-decoration: underline;'
          },
          'Abrir CRM Sal Vita em outra aba ↗'
        )
      ),
      h(
        'div',
        { class: 'bloqueio-rodape' },
        h('span', {}, '🔒 Sal Vita · Segurança e Proteção Comercial'),
      ),
    );

    const overlay = h('div', { class: 'bloqueio-tela', role: 'dialog', 'aria-modal': 'true' }, card);
    this.h.conteudo.append(overlay);
  }

  remover(): void {
    this.estaVisivel = false;
    this.h.host.remove();
  }
}
