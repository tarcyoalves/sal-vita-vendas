// Conta do CRM Lembretes (aba Dados): "Conectar ao CRM" (usa a sessão do site, sem senha), login com e-mail e
// senha só se não houver sessão no site, "conectado como", sair, sincronizar e ações guardadas. A senha só atravessa a chamada de login: não é guardada em lugar nenhum (fica só a
// sessão, que é um cookie do navegador). Sem login a extensão continua 100% local (modo misto).

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { normalizarBaseUrl } from '../shared/crm-rede';
import type { EstadoConta, ResultadoConta } from '../shared/leads';
import type { CrmPainel } from './crm';
import { conectarAoCrm, conectarAutomaticamente, dependenciasPadrao, esquecerTentativaAutomatica, type ResultadoConexao } from './conexao';

function hora(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
}

const textoDoErro = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'A extensão não respondeu. Recarregue a extensão em chrome://extensions.');

export function ContaCrm({ crm }: { crm: CrmPainel }) {
  const [conta, setConta] = useState<EstadoConta | null>(null);
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [falhasVistas, setFalhasVistas] = useState(0);
  const [fase, setFase] = useState<ResultadoConexao | { tipo: 'verificando' }>({ tipo: 'verificando' });

  const carregar = useCallback(async () => {
    try {
      const c = await crm.repo.conta();
      setConta(c);
      setUrl((u) => u || c.baseUrl);
    } catch (e) {
      setMsg({ erro: true, texto: textoDoErro(e) });
    }
  }, [crm.repo]);

  useEffect(() => {
    void carregar(); // sem consulta ao CRM aqui: a sessão é conferida pelas ações do usuário
    return crm.repo.aoMudar(() => void carregar());
  }, [crm.repo, carregar]);

  // Abriu a aba: se o Chrome já deu acesso ao CRM, pergunta ao site quem está logado (um auth.me por abertura do painel).
  useEffect(() => {
    let vivo = true;
    void conectarAutomaticamente(dependenciasPadrao(crm.repo)).then((r) => {
      if (!vivo) return;
      setFase(r);
      void carregar();
    });
    return () => {
      vivo = false;
    };
  }, [crm.repo, carregar]);

  /** Clique em "Conectar ao CRM" / "Tentar de novo": pede a permissão (se faltar) e usa a sessão do site. */
  async function conectar() {
    const base = normalizarBaseUrl(url);
    if (!base) {
      setMsg({ erro: true, texto: 'Endereço inválido. Use https://... (http só em localhost).' });
      return;
    }
    setOcupado(true);
    setMsg(null);
    try {
      setFase(await conectarAoCrm(dependenciasPadrao(crm.repo), { pedirPermissao: true, base }));
    } finally {
      setOcupado(false);
      await carregar();
    }
  }

  function mostrar(r: ResultadoConta, okTexto: string) {
    setConta(r.conta);
    setMsg(r.ok ? { erro: false, texto: okTexto } : { erro: true, texto: r.erro.mensagem });
  }

  async function entrar(ev: FormEvent) {
    ev.preventDefault();
    const base = normalizarBaseUrl(url);
    if (!base) {
      setMsg({ erro: true, texto: 'Endereço inválido. Use https://... (http só em localhost).' });
      return;
    }
    setOcupado(true);
    setMsg(null);
    try {
      // O Chrome pede a permissão de acesso a este endereço uma vez (o botão Entrar é o gesto do usuário).
      const origem = `${base}/*`;
      if (!(await chrome.permissions.contains({ origins: [origem] })) && !(await chrome.permissions.request({ origins: [origem] }))) {
        setMsg({ erro: true, texto: `Sem a permissão do Chrome para acessar ${base}, não dá para entrar no CRM.` });
        return;
      }
      if (base !== conta?.baseUrl) await crm.repo.definirUrl(base);
      const r = await crm.repo.entrar(email, senha);
      mostrar(r, 'Conectado ao CRM.');
      esquecerTentativaAutomatica();
    } catch (e) {
      setMsg({ erro: true, texto: textoDoErro(e) });
    } finally {
      setSenha(''); // a senha nunca fica na tela nem no estado do painel depois do login
      setOcupado(false);
    }
  }

  async function executar(fn: () => Promise<void>) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ erro: true, texto: textoDoErro(e) });
    } finally {
      setOcupado(false);
      await carregar();
    }
  }

  const logado = conta?.usuario != null;

  return (
    <div className="cartao">
      <h3>CRM Lembretes</h3>
      {!conta && !msg && <p className="ajuda">Carregando…</p>}
      {conta && !logado && fase.tipo === 'verificando' && <p className="ajuda">Procurando a sua sessão no CRM…</p>}
      {conta && !logado && (fase.tipo === 'sem-permissao' || fase.tipo === 'erro') && (
        <>
          {fase.tipo === 'sem-permissao' ? (
            <p className="ajuda">
              Se você já entrou no site do CRM neste Chrome, o Vita Zap usa a mesma sessão: sem digitar senha. O Chrome vai pedir uma permissão para o site do CRM, uma única vez. Sem conectar, tudo continua só neste navegador.
            </p>
          ) : (
            <p className="erro">{fase.mensagem}</p>
          )}
          <details>
            <summary>Usar outro endereço do CRM</summary>
            <label>
              Endereço do CRM
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
            </label>
          </details>
          <button type="button" disabled={ocupado} onClick={() => void conectar()}>
            {ocupado ? 'Conectando…' : fase.tipo === 'erro' ? 'Tentar de novo' : 'Conectar ao CRM'}
          </button>
        </>
      )}
      {conta && !logado && fase.tipo === 'sem-sessao' && (
        <form onSubmit={(e) => void entrar(e)}>
          <p className="ajuda">
            Você ainda não entrou no site do CRM neste Chrome. Entre aqui com o mesmo e-mail e senha do CRM (ou entre no site e clique em "Já entrei no site"). Sem entrar, tudo continua só neste navegador.
          </p>
          {conta.erro && <p className="erro">{conta.erro.mensagem}</p>}
          <label>
            Endereço do CRM
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
          </label>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
          </label>
          <p className="ajuda">A senha não é guardada: o Chrome mantém só a sessão (cookie de 7 dias).</p>
          <div className="botoes">
            <button type="submit" disabled={ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => void conectar()}>
              Já entrei no site
            </button>
          </div>
        </form>
      )}
      {conta && logado && (
        <>
          <p>
            Conectado como <b>{conta.usuario?.name}</b> <small>({conta.usuario?.email})</small>
          </p>
          <p className="ajuda">
            {conta.baseUrl}
            {conta.sincronizadoEm ? ` · lembretes do CRM atualizados às ${hora(conta.sincronizadoEm)}` : ' · lembretes ainda não sincronizados'}
            {' '}O CRM só é consultado quando você usa (abrir o painel, abrir uma conversa ou "Atualizar do CRM").
          </p>
          {conta.pendentes > 0 && (
            <p className="aviso-pendente">
              {conta.pendentes} ação(ões) esperando a internet voltar. Nada foi perdido: elas são reenviadas sozinhas.{' '}
              <button type="button" className="pequeno" disabled={ocupado} onClick={() => void executar(async () => void (await crm.repo.reenviarFila()))}>
                Reenviar agora
              </button>
            </p>
          )}
          {conta.falhas.length > falhasVistas && (
            <div className="erro">
              <b>O CRM recusou {conta.falhas.length - falhasVistas} ação(ões) guardada(s); refaça se ainda precisar:</b>
              <ul>
                {conta.falhas.slice(0, conta.falhas.length - falhasVistas).map((f) => (
                  <li key={`${f.em}-${f.taskId}`}>
                    {f.resumo} <small>({f.motivo})</small>
                  </li>
                ))}
              </ul>
              <button type="button" className="pequeno" onClick={() => setFalhasVistas(conta.falhas.length)}>
                Ok, entendi
              </button>
            </div>
          )}
          <div className="botoes">
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                void executar(async () => {
                  const r = await crm.repo.sincronizarLembretes('botao');
                  setMsg(r.ok ? { erro: false, texto: `${r.quantidade} lembrete(s) do CRM na janela de ontem até +7 dias.` } : { erro: true, texto: r.erro.mensagem });
                })
              }
            >
              Atualizar do CRM
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                void executar(async () => {
                  setConta(await crm.repo.sair());
                  esquecerTentativaAutomatica();
                  setFase({ tipo: 'sem-sessao' }); // o logout também derrubou a sessão do site: e-mail e senha
                })
              }
            >
              Sair
            </button>
          </div>
        </>
      )}
      {msg && <p className={msg.erro ? 'erro' : 'info'}>{msg.texto}</p>}
    </div>
  );
}
