// Teste de CÓDIGO-FONTE da reativação (0.7.56): não existe segundo caminho de envio, a IA só fala pelo contrato LeadsCRM,
// a trava de agendamento está em TODO ponto que abre contato, e a mensagem é do dono.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const ARQUIVOS_DA_REATIVACAO = ['src/shared/reativacao.ts', 'src/shared/trava-agendamento.ts', 'src/shared/servico-agendamentos.ts', 'src/sidepanel/reativacao-motor.ts', 'src/sidepanel/trava.ts'];

describe('a reativação não tem caminho próprio de envio', () => {
  it('regras, motor e trava não pedem abrirEColar nem tocam em clique/teclado/DOM', () => {
    for (const f of ARQUIVOS_DA_REATIVACAO) {
      const c = ler(f);
      expect(c, f).not.toMatch(/abrirEColar|envioAutomatico|\.click\(|dispatchEvent|KeyboardEvent|MouseEvent|document\./);
    }
  });

  it('o painel não tem abrirEColar próprio: quem manda é o Executor das campanhas (campanha do tipo reativacao)', () => {
    const c = ler('src/sidepanel/Reativacao.tsx');
    expect(c).not.toMatch(/tipo: 'abrirEColar'|\.click\(|dispatchEvent|KeyboardEvent/);
    expect(c).toMatch(/new Executor\(/);
    expect(c).toMatch(/obterEnvioAutomatico: \(\) => true/);
    expect(ler('src/sidepanel/reativacao-motor.ts')).toMatch(/tipo: 'reativacao'/);
  });

  it('"Avaliar agora" só avalia: chama a rodada com enviar = false e nunca monta campanha nessa chamada', () => {
    const c = ler('src/sidepanel/Reativacao.tsx');
    expect(c).toMatch(/executarCiclo\(true, false\)/);
    expect(c).toMatch(/if \(enviar && config\.ligado && !config\.pausado/);
  });

  it('a rodada só LÊ a conversa (lerConversa) e fala com a IA/CRM pelo contrato LeadsCRM, nunca por fetch', () => {
    const c = ler('src/sidepanel/reativacao-motor.ts');
    expect(c).toMatch(/tipo: 'lerConversa'/);
    expect(c).not.toMatch(/fetch\(|XMLHttpRequest|api\/trpc/);
    expect(c).toMatch(/ia: Pick<LeadsCRM, 'avaliarReativacao' \| 'classificarRespostas' \| 'escreverCobranca' \| 'registrarReativacao'>/);
  });
});

describe('a trava de agendamento está em todo lugar que abre um contato', () => {
  it('o Executor confere ANTES de abrir cada contato e pausa sem enviar se não conseguir (envio automático)', () => {
    const c = ler('src/sidepanel/executor.ts');
    const trava = c.indexOf('this.deps.trava(item, c)');
    const abrir = c.indexOf("tipo: 'abrirEColar'");
    expect(trava).toBeGreaterThan(0);
    expect(abrir).toBeGreaterThan(trava); // a conferência vem antes da colagem
    expect(c).toMatch(/PREFIXO_PAUSA_CRM/);
    expect(c).toMatch(/if \(envioAuto\) \{[\s\S]*?await this\.pausar\(/);
  });

  it('TODO Executor do painel recebe a trava (campanha comum, cobrança, reativação, retomada em voo)', () => {
    expect(ler('src/sidepanel/Execucao.tsx')).toMatch(/trava: trava\?\.executor/);
    const f = ler('src/sidepanel/Followup.tsx');
    expect((f.match(/new Executor\(/g) ?? []).length).toBe(2);
    expect((f.match(/trava: trava\?\.executor/g) ?? []).length).toBe(2);
    const r = ler('src/sidepanel/Reativacao.tsx');
    expect((r.match(/new Executor\(/g) ?? []).length).toBe(2);
    expect((r.match(/trava: trava\?\.executor/g) ?? []).length).toBe(2);
  });

  it('a Prévia tira da campanha quem tem agendamento, em todos os caminhos que montam itens', () => {
    const c = ler('src/sidepanel/Previa.tsx');
    expect(c).toMatch(/useTrava\(db, crm\)/);
    expect(c).toMatch(/const avaliados = useMemo\(\(\) => comTrava\(avaliadosBase\)/);
    expect((c.match(/comTrava\(aplicarFiltros\(/g) ?? []).length).toBe(2); // rotina rápida e "incluir contatos da agenda"
  });

  it('o motor do follow-up (cobrança) confere antes de cobrar', () => {
    const c = ler('src/sidepanel/followup-motor.ts');
    expect(c).toMatch(/this\.d\.travar\(devidos/);
    expect(c).toMatch(/trava\.tipo === 'agendado'/);
    expect(ler('src/sidepanel/Followup.tsx')).toMatch(/travar: trava \?/);
  });

  it('a reativação confere ANTES de abrir a conversa e de novo quando aprende o telefone', () => {
    const c = ler('src/sidepanel/reativacao-motor.ts');
    expect(c.indexOf('this.d.travar(lote')).toBeLessThan(c.indexOf("tipo: 'lerConversa'"));
    expect(c).toMatch(/this\.d\.travar\(\[\{ nome: t\.nome, chave: t\.chave, telefone \}\], false\)/);
  });

  it('o serviço consulta o CRM com UMA query por lista (cache de 5 min) e nunca devolve "livre" em falha', () => {
    const c = ler('src/shared/servico-agendamentos.ts');
    expect(c).toMatch(/zapCrm\.agendamentosFuturos/);
    expect(c).toMatch(/VALIDADE_AGENDAMENTOS_MS/);
    expect(c).toMatch(/return todos\(refs\.length, \{ tipo: 'indisponivel'/);
  });
});

describe('a mensagem é do dono e a configuração nasce desligada', () => {
  it('o motor só prepara texto com a assinatura da config do dono e a campanha exige texto da etapa 1', () => {
    const c = ler('src/sidepanel/reativacao-motor.ts');
    expect(c).toMatch(/assinatura: assinaturaReativacao\(config\)/);
    expect(c).toMatch(/config\.textos1\.length === 0\) return null/);
    expect(c).not.toMatch(/modeloLocal|MODELOS_1|Passando só para saber|SUGESTOES_/);
    expect(ler('src/sidepanel/Reativacao.tsx')).toMatch(/podeLigarReativacao\(/);
    expect(ler('src/shared/reativacao.ts')).toMatch(/ligado: querLigar && textos1\.length > 0/);
    expect(ler('src/shared/reativacao.ts')).toMatch(/ligado: false,/);
  });

  it('o ligar pede a confirmação do risco (window.confirm) antes de gravar confirmouRisco', () => {
    const c = ler('src/sidepanel/Reativacao.tsx');
    expect(c.indexOf('window.confirm(')).toBeGreaterThan(0);
    expect(c.indexOf('window.confirm(')).toBeLessThan(c.indexOf('confirmouRisco: true'));
  });

  it('lerConversa devolve o telefone só lendo (ids/título), sem escrever', () => {
    const fonte = ler('src/content/execucao.ts');
    const ini = fonte.indexOf('export async function lerConversa');
    const corpo = fonte.slice(ini, fonte.indexOf('\nexport', ini + 10));
    expect(corpo).toMatch(/telefoneDoJid/);
    expect(corpo).not.toMatch(/escreverNoCampo|colar|limparCampo|\.click\(|dispatchEvent|enviarHumano|caixaMensagem/);
  });
});
