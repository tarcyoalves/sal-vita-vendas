// Exportar e importar os dados do CRM em JSON (aba Dados do painel). Lógica pura: ler o arquivo e
// gravar ficam com o repositório.

import { acharNoIndice, criarIndice, juntarContatos } from './crm-contatos';
import { sanearDados } from './crm-store';
import type { Contato, DadosCrm } from './crm-tipos';

export const VERSAO_EXPORTACAO = 1;

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Exporta o que o usuário criou (conversas lidas da lista são derivadas e ficam de fora). */
export function exportarJson(dados: DadosCrm, agora: Date = new Date()): string {
  return JSON.stringify(
    {
      app: 'vita-zap-crm',
      versao: VERSAO_EXPORTACAO,
      exportadoEm: agora.toISOString(),
      contatos: dados.contatos,
      etiquetas: dados.etiquetas,
      lembretes: dados.lembretes,
      respostas: dados.respostas,
    },
    null,
    2,
  );
}

export interface ResumoImportacao {
  contatos: number;
  etiquetas: number;
  lembretes: number;
  respostas: number;
}

export type ResultadoImportacao = { ok: true; dados: Partial<DadosCrm>; resumo: ResumoImportacao } | { ok: false; erro: string };

export function lerImportacao(texto: string): ResultadoImportacao {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }
  const o = obj(bruto);
  if (!o || o.app !== 'vita-zap-crm') return { ok: false, erro: 'Este arquivo não é uma exportação do CRM do Vita Zap.' };
  if (typeof o.versao === 'number' && o.versao > VERSAO_EXPORTACAO) return { ok: false, erro: 'Exportação de uma versão mais nova da extensão. Atualize o Vita Zap.' };
  const dados = sanearDados({ contatos: o.contatos ?? {}, etiquetas: o.etiquetas ?? [], lembretes: o.lembretes ?? [], respostas: o.respostas ?? [] });
  return {
    ok: true,
    dados,
    resumo: {
      contatos: Object.keys(dados.contatos ?? {}).length,
      etiquetas: dados.etiquetas?.length ?? 0,
      lembretes: dados.lembretes?.length ?? 0,
      respostas: dados.respostas?.length ?? 0,
    },
  };
}

function mesclarPorId<T extends { id: string }>(atual: T[], novos: T[]): T[] {
  const mapaAtual = new Map(atual.map((x) => [x.id, x]));
  for (const n of novos) if (!mapaAtual.has(n.id)) mapaAtual.set(n.id, n);
  return [...mapaAtual.values()];
}

/**
 * Mescla: o que já existe vence; entra só o que falta. Um contato do arquivo é a mesma pessoa de um
 * existente se tiver o mesmo id, o mesmo telefone ou o mesmo nome (e não telefones diferentes): aí
 * os dois são juntados (notas e etiquetas somam), e os lembretes passam para o id que ficou.
 */
export function mesclarDados(atual: DadosCrm, importado: Partial<DadosCrm>): DadosCrm {
  const r: DadosCrm = { ...atual, contatos: structuredClone(atual.contatos), lembretes: structuredClone(atual.lembretes) };
  const remapa = new Map<string, string>();
  const agora = Date.now();
  for (const c of Object.values(importado.contatos ?? {})) {
    const existente = acharNoIndice(criarIndice(r), { contatoId: c.id, nome: c.nome, telefone: c.telefone });
    if (!existente) {
      r.contatos[c.id] = structuredClone(c);
      continue;
    }
    remapa.set(c.id, existente.id);
    const temp: Contato = structuredClone(c);
    temp.id = `__importado__${c.id}`;
    r.contatos[temp.id] = temp;
    juntarContatos(r, existente.id, temp.id, agora);
    existente.atualizadoEm = atual.contatos[existente.id]?.atualizadoEm ?? existente.atualizadoEm;
  }
  const lembretes = (importado.lembretes ?? []).map((l) => ({ ...l, contatoId: remapa.get(l.contatoId) ?? l.contatoId }));
  return {
    ...r,
    etiquetas: mesclarPorId(atual.etiquetas, importado.etiquetas ?? []),
    lembretes: mesclarPorId(r.lembretes, lembretes),
    respostas: mesclarPorId(atual.respostas, importado.respostas ?? []),
  };
}

/** Substitui o que o usuário criou pelo conteúdo importado (as conversas lidas ficam). */
export function substituirDados(atual: DadosCrm, importado: Partial<DadosCrm>): DadosCrm {
  return {
    ...atual,
    contatos: importado.contatos ?? {},
    etiquetas: importado.etiquetas ?? [],
    lembretes: importado.lembretes ?? [],
    respostas: importado.respostas ?? [],
  };
}
