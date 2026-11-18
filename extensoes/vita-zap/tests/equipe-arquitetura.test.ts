// Testes de CÓDIGO-FONTE do lote 2 (0.7.60): o que não pode acontecer por descuido.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('equipe: nunca vai texto de mensagem ao servidor', () => {
  it('o serviço manda só telefone, hash, nome (opt-out), origem, tipo e data', () => {
    const s = ler('src/shared/servico-equipe.ts');
    // Os campos do fio, um a um: nenhum deles é texto de mensagem.
    for (const campo of ['telefone', 'nomeHash', 'nome', 'origem', 'tipo', 'enviadoEm', 'marcadoEm']) expect(s).toContain(campo);
    expect(s).not.toMatch(/\btexto\b|\bmodelo\b|conversa|mensagens/i);
  });
  it('o orquestrador não passa o texto do item, o modelo nem as notas ao CRM', () => {
    const s = ler('src/sidepanel/sincronia-equipe.ts');
    expect(s).not.toMatch(/\bmodelo\b|textoDoItem|\.texto\b|mensagens\b/);
  });
  it('a contagem por texto fica no IndexedDB local: nada de CRM nem de rede em resultado-texto', () => {
    const s = ler('src/shared/resultado-texto.ts');
    expect(s).not.toMatch(/fetch|chrome\.|crm|repo\./i);
  });
});

describe('equipe: sem segundo caminho de clique e sem armazenamento próprio', () => {
  it('nenhum arquivo novo mexe em teclado, clique, dispatchEvent ou chrome.storage', () => {
    for (const f of ['shared/equipe.ts', 'shared/servico-equipe.ts', 'shared/hash.ts', 'shared/hoje.ts', 'shared/resultado-texto.ts', 'sidepanel/sincronia-equipe.ts', 'sidepanel/equipe.ts', 'sidepanel/Hoje.tsx', 'sidepanel/ResultadosTexto.tsx', 'sidepanel/saude-painel.ts', 'sidepanel/abas.ts']) {
      const s = ler(`src/${f}`);
      expect(s, f).not.toMatch(/dispatchEvent|KeyboardEvent|\.click\(|chrome\s*\.\s*storage|localStorage|indexedDB/);
    }
  });
  it('a tela Hoje não envia, não lê o WhatsApp e não grava: só importa leituras do banco', () => {
    const s = ler('src/sidepanel/Hoje.tsx') + ler('src/shared/hoje.ts');
    expect(s).not.toMatch(/pedir\(|abrirEColar|lerConversa|registrar\w+\(|salvar\w+\(|marcarNaoEnviar|desmarcar|Executor/);
  });
});

describe('a equipe é conferida no ponto ÚNICO de envio', () => {
  it('só o Executor chama a conferência antes de abrir o contato', () => {
    expect(ler('src/sidepanel/executor.ts')).toMatch(/this\.deps\.equipe\(item, c, limiteSemRepetir\)/);
    for (const f of ['Followup.tsx', 'Reativacao.tsx', 'Execucao.tsx']) {
      const s = ler(`src/sidepanel/${f}`);
      expect(s, f).toMatch(/equipe: equipe\?\.executor/);
      expect(s, f).toMatch(/aoEnviar: equipe\?\.aoEnviar/);
    }
  });
  it('o IndexedDB só ganhou uma loja (v5)', () => {
    const b = ler('src/shared/banco.ts');
    expect(b).toMatch(/const VERSAO_BANCO = 5/);
    expect(b).toMatch(/if \(versaoAnterior < 5\) \{\s*db\.createObjectStore\('resultadosTexto', \{ keyPath: 'id' \}\);\s*\}/);
    expect(b.match(/createObjectStore\(/g)?.length).toBe(11); // 10 lojas até a v4 + a nova: nenhuma loja antiga foi mexida
  });
});
