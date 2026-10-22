// Conectar o painel ao CRM sem digitar senha: o CRM e a extensão usam o MESMO cookie de sessão, então quem já
// está logado no site fica logado aqui. O fluxo é:
//   1. precisa da permissão do domínio do CRM (optional_host_permissions): pedida UMA vez, num clique;
//   2. com a permissão, um auth.me (ServicoCrm.conectarPelaSessao) diz quem está logado no site;
//   3. só se o site disser "ninguém logado" o painel mostra o formulário de e-mail e senha.
// Nada periódico: roda ao abrir o painel (só se a permissão já existe) e no clique em "Conectar ao CRM".

import type { LeadsCRM } from '../shared/leads';

export type ResultadoConexao =
  | { tipo: 'conectado' }
  /** O Chrome ainda não deu acesso ao site do CRM: precisa de um clique do usuário para pedir. */
  | { tipo: 'sem-permissao' }
  /** O CRM respondeu que não há ninguém logado no site neste Chrome: aí sim, e-mail e senha. */
  | { tipo: 'sem-sessao' }
  | { tipo: 'erro'; mensagem: string };

export interface DependenciasConexao {
  repo: Pick<LeadsCRM, 'conta' | 'definirUrl' | 'conectarPelaSessao'>;
  permissoes: {
    contains(filtro: { origins: string[] }): Promise<boolean>;
    request(filtro: { origins: string[] }): Promise<boolean>;
  };
}

const textoDoErro = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'A extensão não respondeu. Recarregue a extensão em chrome://extensions.');

/**
 * `pedirPermissao: true` SÓ dentro de um clique do usuário (o Chrome exige o gesto para abrir o pedido).
 * `base`: outro endereço de CRM (dev); sem ele vale o que já está guardado.
 */
export async function conectarAoCrm(d: DependenciasConexao, opcoes: { pedirPermissao: boolean; base?: string }): Promise<ResultadoConexao> {
  try {
    const conta = await d.repo.conta();
    const base = opcoes.base ?? conta.baseUrl;
    if (conta.usuario && base === conta.baseUrl) return { tipo: 'conectado' };
    const filtro = { origins: [`${base}/*`] };
    if (!(await d.permissoes.contains(filtro))) {
      if (!opcoes.pedirPermissao) return { tipo: 'sem-permissao' };
      if (!(await d.permissoes.request(filtro))) {
        return { tipo: 'erro', mensagem: `Sem a permissão do Chrome para acessar ${base}, não dá para conectar ao CRM.` };
      }
    }
    if (base !== conta.baseUrl) await d.repo.definirUrl(base);
    const r = await d.repo.conectarPelaSessao();
    if (r.ok) return { tipo: 'conectado' };
    return r.erro.tipo === 'nao-autenticado' ? { tipo: 'sem-sessao' } : { tipo: 'erro', mensagem: r.erro.mensagem };
  } catch (e) {
    return { tipo: 'erro', mensagem: textoDoErro(e) };
  }
}

let automatica: Promise<ResultadoConexao> | null = null;

/**
 * Tentativa ao ABRIR o painel: só consulta o CRM se a permissão já existe (senão fica em `sem-permissao`, sem rede).
 * Uma só por abertura do painel, mesmo que o App e a aba Dados peçam juntos.
 */
export function conectarAutomaticamente(d: DependenciasConexao): Promise<ResultadoConexao> {
  automatica ??= conectarAoCrm(d, { pedirPermissao: false });
  return automatica;
}

/** Para testes e para depois de "Sair": a próxima abertura/consulta começa do zero. */
export function esquecerTentativaAutomatica(): void {
  automatica = null;
}

export function dependenciasPadrao(repo: DependenciasConexao['repo']): DependenciasConexao {
  return { repo, permissoes: chrome.permissions };
}
