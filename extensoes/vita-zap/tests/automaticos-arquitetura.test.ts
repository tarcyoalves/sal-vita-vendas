// Teste de CÓDIGO-FONTE do lote 1 (0.7.59). Garante a arquitetura da segurança:
//  - existe UM único ponto por onde o envio automático passa (o Executor) e é ali que a conversa é relida e o modo é conferido;
//  - não há segundo caminho de clique/envio automático (nem a aba Automáticos, nem os motores, nem o service worker);
//  - o modo Observação nunca grava no CRM nem marca opt-out;
//  - o aviso do histórico não toca o WhatsApp e não pede permissão nova.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const sem = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const ler = (rel: string) => sem(readFileSync(join(RAIZ, rel), 'utf8'));
function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    return statSync(p).isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(nome) ? [p] : [];
  });
}
const fontes = listar(join(RAIZ, 'src')).map((p) => ({ caminho: relative(RAIZ, p).replace(/\\/g, '/'), codigo: sem(readFileSync(p, 'utf8')) }));
const usam = (re: RegExp) => fontes.filter((f) => re.test(f.codigo)).map((f) => f.caminho);

describe('releitura antes do envio: ponto ÚNICO no Executor', () => {
  const ex = ler('src/sidepanel/executor.ts');

  it('só o Executor conhece a releitura (conferirAntesDeEnviar) e só ele pede abrirEColar com envio automático', () => {
    expect(usam(/conferirAntesDeEnviar\(/).sort()).toEqual(['src/shared/reler-antes.ts', 'src/sidepanel/executor.ts']);
    expect(usam(/envioAutomatico:\s*envioAuto\b/)).toEqual(['src/sidepanel/executor.ts']);
    expect(usam(/envioAutomatico:\s*true/)).toEqual([]);
  });

  it('a releitura (lerConversa) vem ANTES da colagem (abrirEColar) no mesmo passo, e depois da trava de agendamento e do modo', () => {
    const modo = ex.indexOf('podeEnviar(cfg)');
    const trava = ex.indexOf('this.deps.trava(item, c)');
    const reler = ex.indexOf('this.relerAntesDeEnviar(item, c)');
    const colar = ex.indexOf("tipo: 'abrirEColar'");
    expect(modo).toBeGreaterThan(0);
    expect(trava).toBeGreaterThan(modo);
    expect(reler).toBeGreaterThan(trava);
    expect(colar).toBeGreaterThan(reler);
    expect(ex).toMatch(/if \(envioAuto && c\.tipo != null\) \{\s*const seguir = await this\.relerAntesDeEnviar/);
    expect(ex).toMatch(/tipo: 'lerConversa'/);
  });

  it('campanha manual/comum não muda: a releitura e o modo só valem para campanhas com `tipo` (follow-up, reativação) em envio automático', () => {
    expect((ex.match(/envioAuto && c\.tipo != null/g) ?? []).length).toBe(2);
  });

  it('o item que o cliente respondeu vira "pulado" com o prefixo combinado (volta para a classificação), sem contar no freio', () => {
    expect(ex).toMatch(/MOTIVO_CLIENTE_RESPONDEU/);
    expect(ex).toMatch(/marcarComo\(item, 'pulado', motivo\)/);
    expect(ex).toMatch(/marcarComo\(item, 'revisar', `não enviei: não consegui reler/);
    expect(ler('src/shared/followup.ts')).toMatch(/MOTIVO_CLIENTE_RESPONDEU/);
    expect(ler('src/shared/reativacao.ts')).toMatch(/MOTIVO_CLIENTE_RESPONDEU/);
  });

  it('o Executor confere o modo na configuração gravada (não confia na tela): Observação e Desligado pausam sem enviar', () => {
    expect(ex).toMatch(/lerConfigFollowup\(db\)/);
    expect(ex).toMatch(/lerConfigReativacao\(db\)/);
    expect(ex).toMatch(/PREFIXO_PAUSA_MODO/);
  });
});

describe('não existe segundo caminho de envio', () => {
  it('a aba Automáticos, o motor dela e o aviso do histórico não pedem colagem nem tocam em clique/teclado/WhatsApp', () => {
    for (const f of ['src/sidepanel/Automaticos.tsx', 'src/sidepanel/automaticos-motor.ts', 'src/sidepanel/registro-ia.ts', 'src/background/historico.ts', 'src/shared/automaticos.ts', 'src/shared/reler-antes.ts', 'src/shared/fila.ts', 'src/shared/historico-sumindo.ts']) {
      const c = ler(f);
      expect(c, f).not.toMatch(/abrirEColar|envioAutomatico|\.click\(|dispatchEvent|KeyboardEvent|MouseEvent|chrome\.tabs|chrome\.scripting|lerConversa/);
    }
  });

  it('a aba Automáticos só muda o modo, julga e desfaz: nenhuma chamada direta à IA nem fetch', () => {
    const c = ler('src/sidepanel/Automaticos.tsx') + ler('src/sidepanel/automaticos-motor.ts');
    expect(c).not.toMatch(/fetch\(|XMLHttpRequest|api\/trpc|new Executor\(/);
  });

  it('as abas Follow-up e Reativação só ENVIAM no modo Ligado (podeEnviar) e a reativação espera a cobrança (prioridade)', () => {
    expect(ler('src/sidepanel/Followup.tsx')).toMatch(/podeEnviar\(config\) && !config\.pausado/);
    const r = ler('src/sidepanel/Reativacao.tsx');
    expect(r).toMatch(/enviar && podeEnviar\(config\) && !config\.pausado/);
    expect(r).toMatch(/reativacaoDeveEsperar\(cfgFollowup/);
    expect(ler('src/sidepanel/reativacao-motor.ts')).toMatch(/\.sort\(compararProntosDaReativacao\)/);
  });
});

describe('modo Observação: nada de efeito colateral', () => {
  it('opt-out, agendamento no CRM e lembrete só acontecem fora da Observação (emObservacao guarda cada um)', () => {
    const f = ler('src/sidepanel/followup-motor.ts');
    expect(f).toMatch(/if \(observando\) \{[\s\S]*?Observação: a IA marcaria "Não enviar mais"/);
    expect(f).toMatch(/if \(observando\) f = \{ \.\.\.f, observado: true \};\s*else \{\s*const erro = await this\.d\.criarLembrete/);
    const r = ler('src/sidepanel/reativacao-motor.ts');
    expect(r).toMatch(/\} else if \(r\.estado === 'agendado'\) r = \{ \.\.\.r, observado: true \};\s*\} else \{\s*if \(plano\.optOut\) \{\s*await marcarNaoEnviar/);
    expect(r).toMatch(/const res = await this\.salvarNoCrm\(pedido\)/);
    expect(r.indexOf('const res = await this.salvarNoCrm(pedido)')).toBeGreaterThan(r.indexOf('} else {\n      if (plano.optOut)'));
    expect(r).toMatch(/devido\.tipo === 'conclusao'\) continue/);
  });

  it('o "O que a IA fez" é gravado pelos motores no IndexedDB (acoesIa) e a loja é nova e aditiva (versão 4)', () => {
    const b = ler('src/shared/banco.ts');
    expect(b).toMatch(/const VERSAO_BANCO = [456]/); // v5 (0.7.60) só acrescenta a loja do resultado por texto
    expect(b).toMatch(/if \(versaoAnterior < 4\) \{\s*db\.createObjectStore\('julgamentos'/);
    expect(b).toMatch(/db\.createObjectStore\('acoesIa'/);
    // nada de apagar/limpar lojas antigas na migração
    expect(b.slice(b.indexOf('upgrade(db'), b.indexOf('export async function salvarContatos'))).not.toMatch(/deleteObjectStore|\.clear\(/);
  });
});

describe('aviso do histórico sumindo', () => {
  it('sem permissão nova no manifest e sem abrir o WhatsApp', () => {
    const m = JSON.parse(readFileSync(join(RAIZ, 'public', 'manifest.json'), 'utf8')) as { permissions: string[]; host_permissions: string[] };
    expect(m.permissions.sort()).toEqual(['alarms', 'notifications', 'scripting', 'sidePanel', 'storage']);
    expect(m.host_permissions).toEqual(['https://web.whatsapp.com/*', 'https://lembretes.salvitarn.com.br/*']);
    expect(ler('src/background/historico.ts')).not.toMatch(/web\.whatsapp|chrome\.tabs|sendMessage/);
  });

  it('o desfazer do agendamento passa pelo contrato LeadsCRM (service worker) e chama só a procedure mínima', () => {
    expect(ler('src/shared/leads.ts')).toMatch(/'desfazerAgendamento'/);
    expect(ler('src/shared/servico-agendamentos.ts')).toMatch(/zapCrm\.desfazerAgendamento/);
  });
});
