// Linha da tarefa no celular: alvos de toque de 44 px, lápis visível e nome acessível nos botões só com ícone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const f = readFileSync('client/src/pages/Tasks.tsx', 'utf8');
const i = f.indexOf('Atalhos na linha recolhida');
const linha = f.slice(i, i + 2200);

describe('Tasks: atalhos da linha', () => {
  it('WhatsApp, Ligar e Editar têm 44 px no celular (max-md:size-11)', () => {
    expect(linha.match(/max-md:size-11/g)?.length).toBe(3);
  });
  it('o lápis de editar não fica escondido no celular', () => {
    expect(linha).not.toContain('max-md:hidden');
    expect(linha).toContain('aria-label={`Editar ${task.title}`}');
  });
  it('WhatsApp e Ligar têm aria-label com o nome do cliente', () => {
    expect(linha).toContain('aria-label={`Chamar ${task.title} no WhatsApp`}');
    expect(linha).toContain('aria-label={`Ligar para ${task.title}`}');
  });
  it('todo Button de ícone da tela tem aria-label', () => {
    const trechos = [...f.matchAll(/size="icon(-sm)?"/g)].map((m) => f.slice(Math.max(0, m.index! - 200), m.index! + 400));
    expect(trechos.length).toBeGreaterThan(0);
    for (const t of trechos) expect(t).toContain('aria-label');
  });
});
