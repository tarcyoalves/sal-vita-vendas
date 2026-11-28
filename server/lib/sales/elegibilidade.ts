// Elegibilidade de um contato para PROSPECÇÃO (primeira mensagem fria). V3, seção 4; V3.1, 16.1.
// Função pura, versionada e testada. O código decide; nenhuma IA entra aqui.
//
// Postura conservadora no MVP: na dúvida, NÃO é elegível. Contato institucional publicado não é
// autorização automática de marketing (16.1, item 4): a regra exige canal com política aprovada,
// origem verificável, adequação comercial e histórico limpo — e é reavaliada no instante do envio.
import { isBlockedEmail } from '../../../shared/blockedEmailDomains';
import { normalizarEmail } from '../../../shared/sales';

export const ELEGIBILIDADE_VERSAO = 'eleg-2026-11-28a';

/** Prefixos que indicam caixa de canal comercial (não pessoa). */
const PREFIXOS_INSTITUCIONAIS = [
  'contato', 'comercial', 'compras', 'vendas', 'atendimento', 'sac', 'loja', 'pedidos', 'faleconosco',
  'fale', 'info', 'informacoes', 'administrativo', 'adm', 'financeiro', 'compra', 'suprimentos', 'orcamento',
  'orcamentos', 'emporio', 'mercado', 'naturais', 'natural', 'granel', 'restaurante', 'cozinha', 'contact', 'sales',
] as const;

/** Provedores de e-mail gratuito: muito usados por pequeno negócio, mas também por pessoas. */
const WEBMAIL = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'bol.com.br', 'uol.com.br', 'live.com', 'icloud.com', 'terra.com.br', 'ig.com.br'];

/** De onde veio o e-mail. 'receita' = cadastro do CNPJ (frequentemente é o contador). */
export type FonteEmail = 'site' | 'maps' | 'social' | 'receita' | 'inbound' | 'outra';

export interface EntradaElegibilidade {
  email: string;
  fonteEmail: FonteEmail;
  /** URL de onde o e-mail foi lido (rastreabilidade). Sem origem verificável = inelegível. */
  urlFonte: string | null;
  /** Quantos CNPJs distintos da base usam este mesmo e-mail (inclui o próprio). */
  compartilhadoPor: number;
  empresaAtiva: boolean;
  /** Segmentos-alvo Premium encontrados para a empresa (vazio = fora do público). */
  segmentos: string[];
  /** Evidências de compatibilidade com o produto (nome, site, Maps). */
  evidencias: string[];
  uf: string | null;
  ufsDaOnda: string[];
  /** Resultado da consulta de supressão em cada banco. null = consulta falhou → nega. */
  supressao: { premium: boolean | null; crm: boolean | null };
  /** Passo da cadência que se quer enviar (0 = primeiro contato). */
  passo: number;
  /** Já recebeu mensagem de prospecção numa cadência ANTERIOR (encerrada). No passo 0 isso recusa. */
  jaProspectado: boolean;
  /** Canal de prospecção ativo e com política aprovada pelo dono. */
  canal: { ativo: boolean; politicaAprovada: boolean };
}

export interface ResultadoElegibilidade {
  ok: boolean;
  /** Motivos de recusa (vazio quando ok). Códigos estáveis, para filtro e relatório. */
  motivos: string[];
  versao: string;
}

export function parteLocal(email: string): string {
  return normalizarEmail(email).split('@')[0] ?? '';
}

export function dominioDoEmail(email: string): string {
  return normalizarEmail(email).split('@')[1] ?? '';
}

export function ehWebmail(email: string): boolean {
  return WEBMAIL.includes(dominioDoEmail(email));
}

/** Caixa institucional: parte local começa por um prefixo de canal comercial. */
export function ehInstitucional(email: string): boolean {
  const local = parteLocal(email).replace(/[._-]/g, '');
  return PREFIXOS_INSTITUCIONAIS.some((p) => local.startsWith(p));
}

/**
 * Parece endereço de pessoa: "nome.sobrenome", "nome_sobrenome", "nsobrenome" com letras só.
 * Heurística conservadora: dois blocos de letras separados por ponto/sublinhado/hífen, ou
 * parte local só de letras com 4–20 caracteres que não é institucional.
 */
export function pareceNominal(email: string): boolean {
  if (ehInstitucional(email)) return false;
  const local = parteLocal(email);
  if (/^[a-z]{2,}[._-][a-z]{2,}$/.test(local)) return true;
  return false;
}

export function avaliarElegibilidade(e: EntradaElegibilidade): ResultadoElegibilidade {
  const motivos: string[] = [];
  const email = normalizarEmail(e.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) motivos.push('email_invalido');
  if (isBlockedEmail(email)) motivos.push('dominio_bloqueado');
  if (!e.canal.ativo) motivos.push('canal_desligado');
  if (!e.canal.politicaAprovada) motivos.push('politica_do_canal_nao_aprovada');
  if (!e.empresaAtiva) motivos.push('empresa_inativa');
  if (e.segmentos.length === 0) motivos.push('fora_do_publico');
  if (e.evidencias.length === 0) motivos.push('sem_evidencia_de_compatibilidade');
  if (!e.uf || !e.ufsDaOnda.includes(e.uf)) motivos.push('fora_da_onda');
  if (!e.urlFonte) motivos.push('origem_nao_verificavel');
  if (e.fonteEmail === 'receita') motivos.push('email_do_cadastro_cnpj'); // costuma ser do contador
  if (e.compartilhadoPor > 1) motivos.push('email_compartilhado'); // provável escritório de contabilidade
  if (pareceNominal(email)) motivos.push('email_de_pessoa');
  if (ehWebmail(email) && !(e.fonteEmail === 'site' || e.fonteEmail === 'maps')) {
    motivos.push('webmail_sem_publicacao_comercial');
  }
  if (e.supressao.premium === null || e.supressao.crm === null) motivos.push('supressao_indisponivel');
  if (e.supressao.premium === true || e.supressao.crm === true) motivos.push('suprimido');
  if (e.passo === 0 && e.jaProspectado) motivos.push('ja_prospectado');

  return { ok: motivos.length === 0, motivos, versao: ELEGIBILIDADE_VERSAO };
}

/** Motivos que dependem só do canal (para o painel separar "elegível se o canal ligar"). */
export const MOTIVOS_DE_CANAL = new Set(['canal_desligado', 'politica_do_canal_nao_aprovada']);
