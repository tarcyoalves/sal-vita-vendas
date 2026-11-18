// Teste de CÓDIGO-FONTE do "Pedir à IA" e das orientações (0.7.57): não existe segundo caminho de clique/envio, a IA só fala pelo
// contrato LeadsCRM, as orientações vão em todas as chamadas e a mensagem é do dono.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const ARQUIVOS = ['src/shared/pedido-ia.ts', 'src/shared/orientacoes.ts', 'src/sidepanel/pedido-motor.ts', 'src/sidepanel/PedirIa.tsx', 'src/sidepanel/OrientacoesIa.tsx'];

describe('o Pedir à IA não tem caminho próprio de envio', () => {
  it('nenhum arquivo pede abrirEColar nem toca em clique, teclado ou DOM do WhatsApp', () => {
    for (const f of ARQUIVOS) {
      const c = ler(f);
      expect(c, f).not.toMatch(/abrirEColar|envioAutomatico|\.click\(|dispatchEvent|KeyboardEvent|MouseEvent|document\./);
    }
  });

  it('o painel não cria Executor: mensagem só sai pela campanha comum, iniciada pelo dono na aba 3 (Executor das campanhas)', () => {
    const p = ler('src/sidepanel/PedirIa.tsx');
    expect(p).not.toMatch(/new Executor\(/);
    expect(p).toMatch(/aoAprovar\(c\.id\)/);
    const m = ler('src/sidepanel/pedido-motor.ts');
    expect(m).not.toMatch(/new Executor\(|iniciar\(\)|aoReceberEvento/);
    // campanha comum: sem `tipo` (a aba 3 só lista as comuns) e parada até o dono clicar em Iniciar
    const criar = m.slice(m.indexOf('async criarCampanha'));
    expect(criar).not.toMatch(/tipo:/);
    expect(criar).toMatch(/status: 'pausada'/);
    expect(criar).toMatch(/filtros: \{ \.\.\.FILTROS_PADRAO \}/);
  });

  it('a campanha só nasce depois da prévia: o botão de aprovar só existe com a prévia montada', () => {
    const p = ler('src/sidepanel/PedirIa.tsx');
    expect(p).toMatch(/\{previa && previa\.itens\.length > 0 && \(/);
    expect(p.indexOf('Aprovar e ir para o Envio')).toBeGreaterThan(p.indexOf('Montar a prévia'));
    expect((p.match(/motor\.criarCampanha\(/g) ?? []).length).toBe(1);
  });

  it('a rodada só LÊ a conversa (lerConversa) e fala com a IA/CRM pelo contrato LeadsCRM, nunca por fetch', () => {
    const c = ler('src/sidepanel/pedido-motor.ts');
    expect(c).toMatch(/tipo: 'lerConversa'/);
    expect([...c.matchAll(/tipo: '(\w+)'/g)].map((m) => m[1]).filter((t) => !['pronto', 'livre', 'agendado', 'indisponivel', 'pausada', 'pendente', 'rede'].includes(t))).toEqual(['lerConversa']);
    expect(c).not.toMatch(/fetch\(|XMLHttpRequest|api\/trpc/);
    expect(c).toMatch(/ia: Pick<LeadsCRM, 'interpretarPedido' \| 'conferirPedido' \| 'escreverCobranca'>/);
  });

  it('a trava de agendamento é conferida antes de abrir qualquer conversa e DE NOVO na prévia (consulta forçada)', () => {
    const c = ler('src/sidepanel/pedido-motor.ts');
    expect(c.indexOf('this.d.travar(cand.candidatos')).toBeGreaterThan(0);
    expect(c.indexOf('this.d.travar(cand.candidatos')).toBeLessThan(c.indexOf("tipo: 'lerConversa'"));
    expect(c).toMatch(/this\.d\.travar\(itens\.map\(\(i\) => \(\{ nome: i\.nome, chave: i\.chave \}\)\), true\)/);
    expect(c).toMatch(/podeReceberMensagem\(atual, agora\)/);
  });

  it('o painel fica montado sempre e a lista de abas tem "Pedir à IA"', () => {
    const a = ler('src/sidepanel/App.tsx');
    expect(ler('src/sidepanel/abas.ts')).toMatch(/\{ id: 'pedir', rotulo: 'Pedir à IA' \}/);
    expect(a).toMatch(/<div hidden=\{aba !== 'pedir'\}>/);
  });

  it('o WhatsApp é uma coisa de cada vez: o painel pega a trava "pedido" e a solta no fim', () => {
    const p = ler('src/sidepanel/PedirIa.tsx');
    expect(p).toMatch(/tentarTravar\('pedido'\)/);
    expect(p).toMatch(/liberar\('pedido'\)/);
  });
});

describe('as orientações do dono vão em TODA chamada de IA', () => {
  it('toda chamada zapIa.* do serviço de IA monta o corpo com orientacoesParaEnvio(ap.orientacoes)', () => {
    const c = ler('src/shared/servico-ia.ts');
    const chamadas = [...c.matchAll(/ap\.alterar<unknown>\('(zapIa\.\w+)', ([^\n]*)\)\)/g)];
    expect(chamadas.map((m) => m[1]).sort()).toEqual(['zapIa.avaliarReativacao', 'zapIa.classificarConversas', 'zapIa.conferirPedido', 'zapIa.gerarCobranca', 'zapIa.interpretarPedido']);
    for (const m of chamadas) {
      const corpo = m[2];
      // o corpo é `entrada` já montada com orientações (gerarCobranca/conferirPedido) ou o spread inline
      if (corpo.trim() === 'entrada') continue;
      expect(corpo, m[1]).toMatch(/orientacoesParaEnvio\(ap\.orientacoes\)/);
    }
    expect((c.match(/orientacoesParaEnvio\(ap\.orientacoes\)/g) ?? []).length).toBe(5);
  });

  it('o ServicoCrm lê as orientações a cada chamada (apoioIa) e nenhum método de IA monta o apoio por fora', () => {
    const c = ler('src/shared/servico-crm.ts');
    expect(c).toMatch(/private async apoioIa\(\)/);
    for (const m of ['classificarRespostas', 'escreverCobranca', 'interpretarPedido', 'conferirPedido', 'avaliarReativacao']) {
      expect(c, m).toMatch(new RegExp(`ia\\.${m}\\(await this\\.apoioIa\\(\\)`));
    }
    expect(c).not.toMatch(/ia\.\w+\(\{ alterar/);
    expect((c.match(/\{ orientacoes, alterar: /g) ?? []).length).toBe(1);
  });

  it('o editor limita a 1500 caracteres e a chave de armazenamento não é apagada no login/logout do CRM', () => {
    expect(ler('src/shared/orientacoes.ts')).toMatch(/MAX_ORIENTACOES = 1500/);
    expect(ler('src/sidepanel/OrientacoesIa.tsx')).toMatch(/maxLength=\{MAX_ORIENTACOES\}/);
    expect(ler('src/shared/orientacoes.ts')).toMatch(/CHAVE_ORIENTACOES = 'vz\.ia\.orientacoes'/);
    expect(ler('src/shared/servico-crm.ts')).toMatch(/limparChaves\('vz\.crm\.'/); // prefixo diferente: não apaga 'vz.ia.'
  });
});

describe('a mensagem é do dono', () => {
  it('só há texto com o seletor de modo do dono; nenhum modelo genérico no motor ou no painel', () => {
    const m = ler('src/sidepanel/pedido-motor.ts');
    expect(m).toMatch(/normalizarTextos\(envio\.textos\)/);
    expect(m).not.toMatch(/modeloLocal|MODELOS_1|Passando só para saber/);
    expect(ler('src/sidepanel/PedirIa.tsx')).toMatch(/Escreva pelo menos um texto|errosTextos\.ok/);
    expect(m).toMatch(/Escreva pelo menos um texto seu/);
  });
});
