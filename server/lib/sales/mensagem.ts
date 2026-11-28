// Montagem da mensagem de prospecção a partir do modelo APROVADO pelo dono. Pura.
// Sem modelo aprovado, sem remetente completo ou sem domínio do canal: não gera nada.
import { createHash } from 'node:crypto';
import type { SalesCanal, SalesModeloEmail, SalesRemetente } from '../../../shared/sales';
import { verificarTextoComercial } from './conteudo';

export interface VariaveisMensagem {
  empresa: string;
  abertura: string; // linha escrita por IA (já verificada) ou ''
  linkDescadastro: string;
}

export type MensagemMontada =
  | { ok: true; assunto: string; corpo: string; contentHash: string }
  | { ok: false; motivo: string };

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function remetenteCompleto(r: SalesRemetente): boolean {
  return [r.nome, r.razaoSocial, r.cnpj, r.endereco, r.linkSite].every((v) => v.trim().length > 0);
}

export function montarMensagem(
  modelo: SalesModeloEmail, passo: number, remetente: SalesRemetente, v: VariaveisMensagem,
): MensagemMontada {
  if (modelo.status !== 'aprovado') return { ok: false, motivo: 'modelo de e-mail ainda é rascunho' };
  if (!remetenteCompleto(remetente)) return { ok: false, motivo: 'dados do remetente incompletos (nome, razão social, CNPJ, endereço, site)' };
  const p = modelo.passos[passo];
  if (!p) return { ok: false, motivo: `modelo sem o passo ${passo}` };
  const valores: Record<string, string> = {
    empresa: v.empresa.trim(),
    abertura: v.abertura.trim(),
    link_site: remetente.linkSite,
    link_mercado_livre: remetente.linkMercadoLivre,
    link_descadastro: v.linkDescadastro,
    remetente_nome: remetente.nome,
    remetente_razao_social: remetente.razaoSocial,
    remetente_cnpj: remetente.cnpj,
    remetente_endereco: remetente.endereco,
  };
  const faltando: string[] = [];
  const preencher = (s: string) => s.replace(PLACEHOLDER, (_m, k: string) => {
    if (!(k in valores)) { faltando.push(k); return ''; }
    return valores[k];
  });
  const assunto = preencher(p.assunto).replace(/\s+/g, ' ').trim();
  // Linha de abertura vazia não deixa buraco de linhas em branco.
  const corpo = preencher(p.corpo).replace(/\n{3,}/g, '\n\n').trim();
  if (faltando.length) return { ok: false, motivo: `variáveis desconhecidas no modelo: ${[...new Set(faltando)].join(', ')}` };
  if (!valores.link_mercado_livre && /\{link_mercado_livre\}/.test(p.corpo)) return { ok: false, motivo: 'link do Mercado Livre não configurado' };
  const conteudo = verificarTextoComercial(`${assunto}\n${corpo}`);
  if (!conteudo.ok) return { ok: false, motivo: `texto barrado: ${conteudo.achados.join(', ')}` };
  return { ok: true, assunto, corpo, contentHash: hashConteudo(assunto, corpo) };
}

export function hashConteudo(assunto: string, corpo: string): string {
  return createHash('sha256').update(`${assunto}\n\n${corpo}`).digest('hex');
}

/** Message-ID estável por mensagem lógica (RFC 5322). Sem domínio do canal = não gera. */
export function montarMessageId(logicalKey: string, contentHash: string, canal: SalesCanal): string | null {
  const dominio = canal.dominio?.trim().toLowerCase();
  if (!dominio || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) return null;
  const local = createHash('sha256').update(`${logicalKey}:${contentHash}`).digest('hex').slice(0, 32);
  return `<sv.${local}@${dominio}>`;
}

export function chaveLogicaProspeccao(journeyId: number, passo: number): string {
  return `prosp:${journeyId}:${passo}`;
}
