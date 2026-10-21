// Fábricas de dados para os testes do CRM (contatos têm id interno, não o nome, como chave).

import { normalizarTexto } from '../../src/shared/nomes';
import type { Contato } from '../../src/shared/crm-tipos';
import type { ChromeFalso } from './chrome-falso';

export function contato(nome: string, extra: Partial<Contato> = {}): Contato {
  return { id: `id-${normalizarTexto(nome).replace(/\W+/g, '-')}`, nome, aliases: [normalizarTexto(nome)], etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1, ...extra };
}

export function porId(...contatos: Contato[]): Record<string, Contato> {
  return Object.fromEntries(contatos.map((c) => [c.id, c]));
}

/** Contatos gravados no storage falso. */
export function contatosGravados(chrome: ChromeFalso): Contato[] {
  return Object.values((chrome.dados.get('vz.contatos') as Record<string, Contato> | undefined) ?? {});
}

export function gravadoPorNome(chrome: ChromeFalso, nome: string): Contato | undefined {
  return contatosGravados(chrome).find((c) => c.nome === nome);
}
