// Filtros da campanha. Cada contato sai com uma decisão e o MOTIVO, que a prévia mostra.

import { maisRecenteIso } from './equipe';
import { DIAS_SEM_REPETIR } from './constantes';

/** A reativação respeita o mesmo piso entre campanhas da política (quem recebeu campanha há menos disso não entra). */
export const DIAS_SEM_REPETIR_PADRAO_REATIVACAO = DIAS_SEM_REPETIR;
import type { ContatoVarrido } from './contatos';
import { rotuloDaFase, type Contato, type Fase } from './crm-tipos';
import { diferencaDias, formatarDataBr, hojeNoFuso, type DataIso } from './datas';
import { nomeTemTermo, normalizarTexto, palavrasDoNome } from './nomes';
import { dddDoTelefone, lerRegiao, regiaoVazia } from './regiao';

export interface Filtros {
  /** Nome precisa conter TODOS estes termos (sem diferenciar maiúscula/acento). */
  contem: string[];
  /** Nome não pode conter NENHUM destes. */
  naoContem: string[];
  /** Última conversa nesta data ou antes (inclusive). */
  ultimaConversaAntesDe: DataIso | null;
  /** Última conversa nesta data ou depois (inclusive). */
  ultimaConversaDepoisDe: DataIso | null;
  /** Excluir quem recebeu campanha há menos de N dias (nunca menos que DIAS_SEM_REPETIR). */
  excluirContatadosHaDias: number;
  incluirSemConversa?: boolean;
  /** Tags do CRM selecionadas: se houver alguma, o contato precisa ter ao menos UMA delas. */
  tags?: string[];
  /** Fases do funil do CRM selecionadas: se houver alguma, o contato precisa estar em uma delas. */
  fases?: Fase[];
  /** Se true, filtra conversas onde o atendente falou por último (aguardando resposta). */
  aguardandoResposta?: boolean;
  /**
   * "Só contatos com conversa já feita por mim": fica de fora quem não tem nenhum sinal de que o atendente já
   * mandou mensagem (ver `falouComOContato`). Ligado por padrão no painel (aba Varredura); aqui o padrão é desligado.
   */
  soComMensagemMinha?: boolean;
  /**
   * Termos "contém"/"não contém" casam por PALAVRA inteira do nome ("PR" não casa com "COMPRAS"). Ausente ou false = comportamento
   * antigo (pedaço do texto): filtro salvo antes da 0.7.63 não muda. O painel cria os novos com isto LIGADO.
   */
  palavraInteira?: boolean;
  /**
   * Região (v0.7.63): itens "PR", "45" (ver `lerRegiao`). O contato atende se o nome tem a UF como palavra inteira ou se o
   * telefone conhecido tem um dos DDDs. Vazio/ausente = sem filtro de região.
   */
  regiao?: string[];
}

export const FILTROS_PADRAO: Filtros = {
  contem: [],
  naoContem: [],
  ultimaConversaAntesDe: null,
  ultimaConversaDepoisDe: null,
  excluirContatadosHaDias: DIAS_SEM_REPETIR,
  incluirSemConversa: false,
  tags: [],
  fases: [],
  aguardandoResposta: false,
  soComMensagemMinha: false,
};

export interface ContextoFiltro {
  agora: Date;
  /** Chaves marcadas "Não enviar mais" (ou "Não é cliente"). */
  naoEnviar: ReadonlySet<string>;
  /** Último envio de campanha por chave (ISO data-hora), de qualquer campanha. */
  ultimoEnvioPorChave: ReadonlyMap<string, string>;
  /** Mapa chave do contato → conjunto de tags do CRM (nomes normalizados). */
  tagsPorChave?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Mapa chave do contato → fase do funil no CRM. */
  fasePorChave?: ReadonlyMap<string, Fase>;
  /** Mapa chave do contato → boolean indicando se está aguardando resposta do cliente. */
  aguardandoPorChave?: ReadonlyMap<string, boolean>;
  /** Chaves de contatos com registro do atendente no CRM da extensão (nota, fase ou conversão). */
  comRegistroDoAtendente?: ReadonlySet<string>;
  /** Telefone conhecido por chave (normalizado 55+DDD+número), do CRM da extensão. Usado só no filtro de região. */
  telefonePorChave?: ReadonlyMap<string, string>;
  /**
   * Último contato da EQUIPE por chave (ISO, de qualquer atendente/computador; v0.7.60). Só entra no intervalo mínimo entre contatos
   * (NÃO conta como "o atendente já falou com este contato": quem decide isso é `ultimoEnvioPorChave`).
   */
  contatadoPelaEquipePorChave?: ReadonlyMap<string, string>;
}

export type Situacao = 'incluido' | 'excluido' | 'revisar';

export interface Decisao {
  situacao: Situacao;
  motivo: string;
}

export function diasSemRepetir(filtros: Filtros): number {
  const n = Number.isFinite(filtros.excluirContatadosHaDias) ? Math.floor(filtros.excluirContatadosHaDias) : 0;
  return Math.max(DIAS_SEM_REPETIR, n);
}

export const MOTIVO_SEM_TELEFONE_PARA_DDD = 'sem telefone conhecido para conferir o DDD';
export const MOTIVO_SEM_MENSAGEM_MINHA = 'sem mensagem sua (nenhum sinal de conversa feita por você)';
export const MOTIVO_POSSIVEL_GRUPO = 'pode ser grupo (a prévia da lista começa com "Fulano:") — confira antes de incluir';
export const MOTIVO_SINAL_DESCONHECIDO = 'sinal de conversa sua desconhecido — varra de novo';

/** Ajuda do campo "Só contatos com conversa já feita por mim" (aba Varredura). */
export const TEXTO_AJUDA_SO_MINHA =
  'Entra quem tem algum sinal de que você já mandou mensagem: a última mensagem da lista é sua (✓, ✓✓, relógio ou "Você:"), o contato está no histórico de envios da extensão ou tem nota/fase/conversão sua no CRM da extensão. ' +
  'Limites: se o cliente respondeu por último e a lista não mostra nada seu, o contato fica fora (aparece na prévia como "sem mensagem sua" e dá para incluir à mão); contatos varridos antes da versão 0.7.21 precisam ser varridos de novo.';

/** Contato do CRM da extensão em que o atendente já mexeu: nota, fase do funil ou conversão. */
export function temRegistroDoAtendente(c: Pick<Contato, 'notas' | 'fase' | 'convertidoEm'>): boolean {
  return c.notas.length > 0 || c.fase != null || c.convertidoEm != null;
}

/**
 * O atendente já falou com este contato? Verdade se QUALQUER sinal existir:
 * (a) a prévia da última mensagem na lista é minha (ícone de entrega/leitura ou "Você:");
 * (b) o contato está no histórico de envios da extensão;
 * (c) o contato tem registro do atendente no CRM da extensão (nota, fase ou conversão).
 * Limite: se a conversa é antiga e o cliente respondeu por último, a lista não mostra nada meu; sem (b) nem (c) o
 * contato fica de fora (dá para incluir à mão na prévia).
 */
export function falouComOContato(c: ContatoVarrido, ctx: ContextoFiltro): boolean {
  return c.ultimaDeMim === true || ctx.ultimoEnvioPorChave.has(c.chave) || ctx.comRegistroDoAtendente?.has(c.chave) === true;
}

export function avaliarContato(c: ContatoVarrido, filtros: Filtros, ctx: ContextoFiltro): Decisao {
  const d = avaliarSemFiltroDeMensagemMinha(c, filtros, ctx);
  if (filtros.soComMensagemMinha && d.situacao !== 'excluido') {
    // Possível grupo (grupo com foto): fica em "revisar" mesmo sem sinal meu; nunca vira "sem mensagem sua + incluir".
    if (c.possivelGrupo && d.situacao === 'revisar') return d;
    if (falouComOContato(c, ctx)) {
      return d;
    }
    // Só excluir quando ultimaDeMim === false E não houver histórico de envios nem registro no CRM
    if (c.ultimaDeMim === false) {
      return { situacao: 'excluido', motivo: MOTIVO_SEM_MENSAGEM_MINHA };
    }
    // Contato sem o campo ultimaDeMim (varrido antes da 0.7.21, valor undefined) ou desconhecido:
    // Trata como 'revisar' com motivo "sinal de conversa sua desconhecido — varra de novo"
    if (d.situacao === 'revisar') {
      return d;
    }
    return { situacao: 'revisar', motivo: MOTIVO_SINAL_DESCONHECIDO };
  }
  return d;
}

/** "a palavra "PR"" / "as palavras "salto do lontra"" (palavra inteira) ou só `"PR"` (comportamento antigo). */
export function descreverTermo(termo: string, palavraInteira: boolean): string {
  if (!palavraInteira) return `"${termo}"`;
  return palavrasDoNome(termo).length > 1 ? `as palavras "${termo}"` : `a palavra "${termo}"`;
}

interface DecisaoRegiao {
  /** 'incluido' = atende (ou não há filtro: motivo vazio); 'excluido' = fora; 'revisar' = não dá para conferir. */
  situacao: Situacao;
  motivo: string;
}

/**
 * Filtro de região. Atende se (a) o nome tem a UF como palavra inteira ou (b) o telefone conhecido tem um dos DDDs.
 * Sem UF no nome e sem telefone conhecido: revisar (nunca entra direto, nunca some).
 */
function avaliarRegiao(c: ContatoVarrido, nomeNormalizado: string, filtros: Filtros, ctx: ContextoFiltro): DecisaoRegiao {
  const r = lerRegiao(filtros.regiao);
  if (regiaoVazia(r)) return { situacao: 'incluido', motivo: '' };
  const palavras = palavrasDoNome(nomeNormalizado);
  const ufNoNome = r.ufs.find((uf) => palavras.includes(uf.toLowerCase()));
  if (ufNoNome) return { situacao: 'incluido', motivo: `UF ${ufNoNome} no nome` };
  const telefone = ctx.telefonePorChave?.get(c.chave);
  if (!telefone) return { situacao: 'revisar', motivo: MOTIVO_SEM_TELEFONE_PARA_DDD };
  const ddd = dddDoTelefone(telefone);
  if (ddd && r.ddds.includes(ddd)) return { situacao: 'incluido', motivo: `DDD ${ddd}` };
  return { situacao: 'excluido', motivo: `fora da região (${ddd ? `DDD ${ddd}` : 'telefone fora do Brasil'})` };
}

function avaliarSemFiltroDeMensagemMinha(c: ContatoVarrido, filtros: Filtros, ctx: ContextoFiltro): Decisao {
  const nome = normalizarTexto(c.nome);

  if (ctx.naoEnviar.has(c.chave)) return { situacao: 'excluido', motivo: 'marcado "Não enviar mais"' };
  if (c.soNumero) return { situacao: 'excluido', motivo: 'não salvo na agenda (aparece só o número)' };
  if (c.pareceGrupo) return { situacao: 'excluido', motivo: 'grupo ou lista de transmissão' };
  if (!filtros.incluirSemConversa && !c.temConversa) return { situacao: 'excluido', motivo: 'sem conversa anterior' };

  const inteira = filtros.palavraInteira === true;
  for (const termo of filtros.contem) {
    if (!nomeTemTermo(c.nome, termo, inteira)) return { situacao: 'excluido', motivo: `nome não contém ${descreverTermo(termo, inteira)}` };
  }
  for (const termo of filtros.naoContem) {
    if (normalizarTexto(termo) === '' || (inteira && palavrasDoNome(termo).length === 0)) continue;
    if (nomeTemTermo(c.nome, termo, inteira)) return { situacao: 'excluido', motivo: `nome contém ${descreverTermo(termo, inteira)}` };
  }

  const regiao = avaliarRegiao(c, nome, filtros, ctx);
  if (regiao.situacao === 'excluido') return { situacao: 'excluido', motivo: regiao.motivo };

  const envioLocal = ctx.ultimoEnvioPorChave.get(c.chave);
  const envioEquipe = ctx.contatadoPelaEquipePorChave?.get(c.chave);
  const ultimoEnvio = maisRecenteIso(envioLocal, envioEquipe);
  if (ultimoEnvio) {
    const dias = diferencaDias(hojeNoFuso(ctx.agora), hojeNoFuso(new Date(ultimoEnvio)));
    const limite = diasSemRepetir(filtros);
    if (dias < limite) {
      const deOutro = envioEquipe != null && ultimoEnvio === envioEquipe && ultimoEnvio !== envioLocal;
      return { situacao: 'excluido', motivo: `recebeu campanha há ${dias} dia(s) ${deOutro ? 'de outro atendente ou computador ' : ''}(mínimo ${limite})` };
    }
  }

  if (c.duplicado) return { situacao: 'revisar', motivo: 'mais de uma conversa com este nome' };

  if (filtros.tags && filtros.tags.length > 0) {
    const tagsContato = ctx.tagsPorChave?.get(c.chave);
    const temTag = tagsContato && filtros.tags.some((t) => tagsContato.has(normalizarTexto(t)));
    if (!temTag) {
      return { situacao: 'excluido', motivo: `não possui as tags do CRM selecionadas (${filtros.tags.join(', ')})` };
    }
  }

  if (filtros.fases && filtros.fases.length > 0) {
    const faseContato = ctx.fasePorChave?.get(c.chave);
    if (!faseContato || !filtros.fases.includes(faseContato)) {
      const rotulos = filtros.fases.map((f) => rotuloDaFase(f)).join(', ');
      return { situacao: 'excluido', motivo: `fase do CRM não é (${rotulos})` };
    }
  }

  if (filtros.aguardandoResposta) {
    const estaAguardando = ctx.aguardandoPorChave?.get(c.chave);
    if (estaAguardando === false) {
      return { situacao: 'excluido', motivo: 'conversa não está aguardando resposta (cliente já respondeu)' };
    }
  }

  const usaData = filtros.ultimaConversaAntesDe != null || filtros.ultimaConversaDepoisDe != null;
  const partes: string[] = [];
  for (const termo of filtros.contem) partes.push(`contém ${descreverTermo(termo, inteira)}`);
  if (regiao.situacao === 'incluido' && regiao.motivo) partes.push(regiao.motivo);

  if (usaData) {
    if (c.ultimaConversa == null) {
      if (!c.temConversa) {
        if (!filtros.incluirSemConversa) {
          return { situacao: 'excluido', motivo: 'sem conversa anterior (agenda)' };
        }
        return { situacao: 'revisar', motivo: 'contato da agenda (sem data recente no WhatsApp)' };
      }
      return { situacao: 'revisar', motivo: `data da última conversa incerta (${c.revisarData ?? 'sem data'})` };
    }
    if (filtros.ultimaConversaAntesDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaAntesDe) <= 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa posterior a ${formatarDataBr(filtros.ultimaConversaAntesDe)}`,
      };
    }
    if (filtros.ultimaConversaDepoisDe && !(diferencaDias(c.ultimaConversa, filtros.ultimaConversaDepoisDe) >= 0)) {
      return {
        situacao: 'excluido',
        motivo: `última conversa anterior a ${formatarDataBr(filtros.ultimaConversaDepoisDe)}`,
      };
    }
    partes.push(`última conversa ${formatarDataBr(c.ultimaConversa)}`);
  } else if (c.ultimaConversa) {
    partes.push(`última conversa ${formatarDataBr(c.ultimaConversa)}`);
  }

  const tagsContato = ctx.tagsPorChave?.get(c.chave);
  if (tagsContato && tagsContato.size > 0 && filtros.tags && filtros.tags.length > 0) {
    const marcadas = filtros.tags.filter((t) => tagsContato.has(normalizarTexto(t)));
    if (marcadas.length > 0) partes.push(`tag: ${marcadas.join(', ')}`);
  }

  if (filtros.fases && filtros.fases.length > 0) {
    const faseContato = ctx.fasePorChave?.get(c.chave);
    if (faseContato) partes.push(`fase: ${rotuloDaFase(faseContato)}`);
  }

  if (filtros.aguardandoResposta) {
    partes.push('aguardando resposta');
  }

  // Região sem como conferir (sem a UF no nome e sem telefone conhecido): nunca entra sozinho e nunca some.
  if (regiao.situacao === 'revisar') return { situacao: 'revisar', motivo: regiao.motivo };

  // Grupo com foto não tem o ícone padrão: só a prévia "Fulano: texto" denuncia. Nunca entra sozinho.
  if (c.possivelGrupo) return { situacao: 'revisar', motivo: MOTIVO_POSSIVEL_GRUPO };

  return { situacao: 'incluido', motivo: partes.length ? partes.join('; ') : 'contato salvo com conversa' };
}

export interface ContatoAvaliado {
  contato: ContatoVarrido;
  decisao: Decisao;
}

export function aplicarFiltros(contatos: ContatoVarrido[], filtros: Filtros, ctx: ContextoFiltro): ContatoAvaliado[] {
  const ordem: Record<Situacao, number> = { incluido: 0, revisar: 1, excluido: 2 };
  return contatos
    .map((contato) => ({ contato, decisao: avaliarContato(contato, filtros, ctx) }))
    .sort((a, b) => {
      // 1. Agrupamento por situação: incluídos primeiro, depois revisar, depois excluídos
      const diffSituacao = ordem[a.decisao.situacao] - ordem[b.decisao.situacao];
      if (diffSituacao !== 0) return diffSituacao;

      // 2. Ordem por data da última conversa decrescente (mais recente primeiro: 10/09, 09/09, 08/09, etc.)
      const dataA = a.contato.ultimaConversa ?? '';
      const dataB = b.contato.ultimaConversa ?? '';
      if (dataA && dataB && dataA !== dataB) {
        return dataB.localeCompare(dataA);
      }
      if (dataA && !dataB) return -1;
      if (!dataA && dataB) return 1;

      // 3. Desempate por nome alfabético
      return a.contato.nome.localeCompare(b.contato.nome, 'pt-BR');
    });
}

/** Mapa chave → último envio (ISO), a partir do histórico de envios. */
export function ultimoEnvioPorChave(envios: ReadonlyArray<{ chave: string; enviadoEm: string }>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const e of envios) {
    const atual = mapa.get(e.chave);
    if (!atual || e.enviadoEm > atual) mapa.set(e.chave, e.enviadoEm);
  }
  return mapa;
}
