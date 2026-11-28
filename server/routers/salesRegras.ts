// Regras puras do painel "Vendas B2B" (sem banco, sem tRPC): testadas em tests/sales-painel.test.ts.
// O router (sales.ts) só chama estas funções e traduz o resultado em erro para o admin.
import { z } from 'zod';
import type { SalesCanal, SalesModeloEmail, SalesMode } from '../../shared/sales';
import { verificarTextoComercial } from '../lib/sales/conteudo';
import { KB_KINDS } from '../lib/sales/agente/kbTipos';

/** Provedores cujas políticas proíbem prospecção fria (V3.1, seção 2.1). */
export const PROVEDORES_PROIBIDOS = /resend|brevo|sendinblue/i;

/** Pendências para LIGAR o canal. Lista vazia = pode ligar. Só vale quando canal.ativo é true. */
export function pendenciasAtivacaoCanal(canal: SalesCanal): string[] {
  if (!canal.ativo) return [];
  const faltas: string[] = [];
  if (!canal.politicaAprovada) faltas.push('registre que a política do provedor foi aprovada');
  if (!canal.provedor?.trim()) faltas.push('informe o provedor');
  else if (PROVEDORES_PROIBIDOS.test(canal.provedor)) faltas.push('Resend e Brevo não podem ser usados para prospecção: escolha outra caixa de envio');
  if (!canal.termosConferidosEm?.trim()) faltas.push('informe a data em que os termos foram conferidos');
  if (!canal.responsavel?.trim()) faltas.push('informe quem conferiu os termos');
  if (!canal.conclusao?.trim()) faltas.push('escreva a conclusão da conferência');
  return faltas;
}

/** Variáveis que o modelo pode usar (mesmas de server/lib/sales/mensagem.ts). */
export const PLACEHOLDERS_MODELO = [
  { chave: '{empresa}', descricao: 'Nome da empresa' },
  { chave: '{abertura}', descricao: 'Linha de abertura (só se a abertura por IA estiver ligada)' },
  { chave: '{link_site}', descricao: 'Link do site da loja' },
  { chave: '{link_mercado_livre}', descricao: 'Link do anúncio no Mercado Livre' },
  { chave: '{link_descadastro}', descricao: 'Link para não receber mais mensagens (obrigatório)' },
  { chave: '{remetente_nome}', descricao: 'Nome de quem envia' },
  { chave: '{remetente_razao_social}', descricao: 'Razão social' },
  { chave: '{remetente_cnpj}', descricao: 'CNPJ' },
  { chave: '{remetente_endereco}', descricao: 'Endereço' },
] as const;

export type ResultadoAprovacaoModelo =
  | { ok: true; modelo: SalesModeloEmail }
  | { ok: false; motivos: string[] };

const mesmoConteudo = (a: SalesModeloEmail, b: SalesModeloEmail) =>
  JSON.stringify(a.passos) === JSON.stringify(b.passos) && a.aberturaPorIa === b.aberturaPorIa;

/**
 * Prepara o modelo para gravar. Rascunho: apaga qualquer marca de aprovação. Aprovado: o texto precisa
 * passar nas travas de conteúdo e trazer o descadastro; quem aprovou e quando vêm do servidor, nunca do navegador.
 */
export function prepararModeloEmail(
  novo: SalesModeloEmail, atual: SalesModeloEmail | null, por: string, agora: Date,
): ResultadoAprovacaoModelo {
  if (novo.status !== 'aprovado') {
    return { ok: true, modelo: { ...novo, status: 'rascunho', aprovadoPor: null, aprovadoEm: null } };
  }
  const motivos: string[] = [];
  novo.passos.forEach((p, i) => {
    const achados = verificarTextoComercial(`${p.assunto}\n${p.corpo}`).achados;
    if (achados.length) motivos.push(`Passo ${i + 1}: ${achados.join(', ')}`);
    if (!p.assunto.trim() || !p.corpo.trim()) motivos.push(`Passo ${i + 1}: assunto e texto são obrigatórios`);
    if (!p.corpo.includes('{link_descadastro}')) motivos.push(`Passo ${i + 1}: falta {link_descadastro}`);
  });
  if (motivos.length) return { ok: false, motivos };
  if (atual && atual.status === 'aprovado' && atual.aprovadoPor && atual.aprovadoEm && mesmoConteudo(novo, atual)) {
    return { ok: true, modelo: { ...novo, aprovadoPor: atual.aprovadoPor, aprovadoEm: atual.aprovadoEm } };
  }
  return { ok: true, modelo: { ...novo, status: 'aprovado', aprovadoPor: por, aprovadoEm: agora.toISOString() } };
}

export const MODOS_QUE_EXIGEM_CONFIRMACAO: readonly SalesMode[] = ['SEMI_AUTONOMOUS', 'AUTONOMOUS'];

/** Subir para um modo que envia sozinho exige confirmação explícita e motivo. Retorna o erro, ou null. */
export function erroEscalonamentoModo(modo: SalesMode, confirmo: boolean, motivo: string): string | null {
  if (!MODOS_QUE_EXIGEM_CONFIRMACAO.includes(modo)) return null;
  if (!confirmo) return 'Confirme que entende que este modo envia e-mails sem aprovação caso a caso.';
  if (!motivo.trim()) return 'Escreva o motivo para mudar para este modo.';
  return null;
}

export const KB_IMPORT_MAX_ITENS = 200;
export const KB_CONTENT_MAX = 4000;

export const kbItemEntradaSchema = z.object({
  kind: z.enum(KB_KINDS),
  key: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(1).max(KB_CONTENT_MAX),
});
export const kbImportSchema = z.array(kbItemEntradaSchema).min(1).max(KB_IMPORT_MAX_ITENS);

/** Valida o JSON colado no painel. Devolve os itens ou mensagens curtas por posição. */
export function validarImportacaoKb(bruto: unknown): { ok: true; itens: z.infer<typeof kbImportSchema> } | { ok: false; erros: string[] } {
  const r = kbImportSchema.safeParse(bruto);
  if (r.success) return { ok: true, itens: r.data };
  const erros = r.error.issues.slice(0, 8).map((i) => {
    const pos = typeof i.path[0] === 'number' ? `Item ${i.path[0] + 1}` : 'Lista';
    const campo = i.path.slice(1).join('.');
    return `${pos}${campo ? ` (${campo})` : ''}: ${i.message}`;
  });
  return { ok: false, erros };
}
