// Teste de CÓDIGO-FONTE do follow-up: não existe segundo caminho de envio.
//  - quem manda a cobrança é o Executor das campanhas (envio-humano.ts continua sendo o único clique, ver envio-isolado.test.ts);
//  - o motor e as regras nem conhecem `abrirEColar`;
//  - a resposta que o atendente revisa só é COLADA (envioAutomatico: false);
//  - ler a conversa (lerConversa) não escreve na caixa.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('follow-up não tem caminho próprio de envio', () => {
  it('regras e motor não pedem abrirEColar nem tocam em clique/teclado', () => {
    for (const f of ['src/shared/followup.ts', 'src/shared/servico-ia.ts', 'src/sidepanel/followup-motor.ts']) {
      const c = ler(f);
      expect(c, f).not.toMatch(/abrirEColar|envioAutomatico|\.click\(|dispatchEvent|KeyboardEvent|MouseEvent/);
    }
  });

  it('a resposta que você revisa é só colada: envioAutomatico: false, e o painel não usa o Executor para isso', () => {
    const c = ler('src/sidepanel/Followup.tsx');
    const colagens = c.match(/tipo: 'abrirEColar'[^}]*\}/g) ?? [];
    expect(colagens).toHaveLength(1);
    expect(colagens[0]).toMatch(/envioAutomatico: false/);
    expect(c).not.toMatch(/\.click\(|dispatchEvent|KeyboardEvent/);
  });

  it('a cobrança automática é o Executor das campanhas (campanha do tipo followup)', () => {
    const c = ler('src/sidepanel/Followup.tsx');
    expect(c).toMatch(/new Executor\(/);
    expect(c).toMatch(/obterEnvioAutomatico: \(\) => true/);
    expect(ler('src/sidepanel/followup-motor.ts')).toMatch(/tipo: 'followup'/);
  });

  it('lerConversa lê e só: sem colar, sem limpar caixa, sem clicar', () => {
    const fonte = ler('src/content/execucao.ts');
    const ini = fonte.indexOf('export async function lerConversa');
    const corpo = fonte.slice(ini, fonte.indexOf('\nexport', ini + 10));
    expect(corpo.length).toBeGreaterThan(200);
    expect(corpo).not.toMatch(/escreverNoCampo|colar|limparCampo|\.click\(|dispatchEvent|enviarHumano|caixaMensagem/);
  });

  it('a IA não é chamada fora do service worker: o painel só usa os métodos do contrato LeadsCRM', () => {
    const c = ler('src/sidepanel/followup-motor.ts');
    expect(c).not.toMatch(/fetch\(|XMLHttpRequest|api\/trpc/);
    expect(c).toMatch(/ia: Pick<LeadsCRM, 'classificarRespostas' \| 'escreverCobranca'>/);
  });

  it('não existe mais modelo genérico de cobrança para envio (a mensagem é do dono)', () => {
    for (const f of ['src/shared/followup.ts', 'src/sidepanel/followup-motor.ts', 'src/sidepanel/Followup.tsx']) {
      const c = ler(f);
      expect(c, f).not.toMatch(/modeloLocal|MODELOS_1|MODELOS_2|Passando só para saber/);
    }
    // as sugestões vivem só no editor (followup-estilo.ts) e o motor nunca as importa
    expect(ler('src/sidepanel/followup-motor.ts')).not.toMatch(/SUGESTOES_/);
    expect(ler('src/sidepanel/Followup.tsx')).not.toMatch(/SUGESTOES_/);
    expect(ler('src/sidepanel/MensagemCobranca.tsx')).toMatch(/SUGESTOES_1/);
  });

  it('o motor só prepara cobrança com a config do dono (assinatura) e o ligar é bloqueado sem texto', () => {
    const motor = ler('src/sidepanel/followup-motor.ts');
    expect(motor).toMatch(/cobrancaAssinatura: assinatura/);
    expect(motor).toMatch(/refazerFila\(config\)/);
    expect(motor).toMatch(/config\.textos1\.length === 0\) return null/);
    expect(ler('src/sidepanel/Followup.tsx')).toMatch(/podeLigar\(/);
    // o modo só roda com texto do dono (normalizarModo recebe `temTexto`) e "Ligado" exige o placar aprovado
    expect(ler('src/shared/followup.ts')).toMatch(/textos1\.length > 0\)/);
    expect(ler('src/shared/followup.ts')).toMatch(/normalizarModo\(/);
  });
});
