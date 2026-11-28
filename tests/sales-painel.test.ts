// Painel "Vendas B2B": regras puras do router, tradução de códigos e proteção de todas as procedures.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODELO_EMAIL_RASCUNHO, SALES_SETTINGS_DEFAULTS, type SalesCanal, type SalesModeloEmail } from '../shared/sales';
import {
  erroEscalonamentoModo, pendenciasAtivacaoCanal, prepararModeloEmail, validarImportacaoKb,
  PLACEHOLDERS_MODELO, KB_IMPORT_MAX_ITENS,
} from '../server/routers/salesRegras';
import { MOTIVOS, PLACEHOLDERS, traduzirMotivo, humanizar } from '../client/src/pages/admin/sales/motivos';

const ler = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

const canalCompleto: SalesCanal = {
  ...SALES_SETTINGS_DEFAULTS.canal,
  ativo: true, politicaAprovada: true, provedor: 'Caixa SMTP própria', termosConferidosEm: '2026-11-28',
  responsavel: 'Dono', conclusao: 'Termos permitem e-mail comercial B2B.',
};

describe('ativação do canal', () => {
  it('canal desligado nunca tem pendência (desligar é sempre permitido)', () => {
    expect(pendenciasAtivacaoCanal(SALES_SETTINGS_DEFAULTS.canal)).toEqual([]);
  });
  it('ligar sem política aprovada é recusado', () => {
    expect(pendenciasAtivacaoCanal({ ...canalCompleto, politicaAprovada: false }).join(' ')).toMatch(/política/);
  });
  it.each(['provedor', 'termosConferidosEm', 'responsavel', 'conclusao'] as const)('ligar sem %s é recusado', (campo) => {
    expect(pendenciasAtivacaoCanal({ ...canalCompleto, [campo]: null }).length).toBeGreaterThan(0);
    expect(pendenciasAtivacaoCanal({ ...canalCompleto, [campo]: '   ' }).length).toBeGreaterThan(0);
  });
  it('canal completo liga', () => {
    expect(pendenciasAtivacaoCanal(canalCompleto)).toEqual([]);
  });
  it.each(['Resend', 'brevo (ex-Sendinblue)', 'SendinBlue'])('provedor %s é recusado para prospecção', (p) => {
    expect(pendenciasAtivacaoCanal({ ...canalCompleto, provedor: p }).join(' ')).toMatch(/Resend e Brevo/);
  });
});

describe('aprovação do modelo de e-mail', () => {
  const agora = new Date('2026-11-28T12:00:00Z');
  const limpo: SalesModeloEmail = {
    ...MODELO_EMAIL_RASCUNHO,
    status: 'aprovado',
    passos: [{ assunto: 'Sal marinho para {empresa}', corpo: 'Olá. Sair: {link_descadastro}' }],
  };

  it('o servidor carimba quem aprovou e quando, ignorando o que veio do navegador', () => {
    const r = prepararModeloEmail({ ...limpo, aprovadoPor: 'forjado', aprovadoEm: '2000-01-01' }, null, 'loja:dono@x', agora);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.modelo.status).toBe('aprovado');
      expect(r.modelo.aprovadoPor).toBe('loja:dono@x');
      expect(r.modelo.aprovadoEm).toBe(agora.toISOString());
    }
  });
  it('texto com alegação proibida é recusado com os achados', () => {
    const r = prepararModeloEmail({ ...limpo, passos: [{ assunto: 'Sal', corpo: 'Ajuda a controlar a pressão alta. {link_descadastro}' }] }, null, 'x', agora);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(' ')).toMatch(/Passo 1.*terapêutica/);
  });
  it('sem {link_descadastro} é recusado', () => {
    const r = prepararModeloEmail({ ...limpo, passos: [{ assunto: 'Oi', corpo: 'Compre sal.' }] }, null, 'x', agora);
    expect(r.ok).toBe(false);
  });
  it('o rascunho padrão do projeto passa pelas travas', () => {
    expect(prepararModeloEmail({ ...MODELO_EMAIL_RASCUNHO, status: 'aprovado' }, null, 'x', agora).ok).toBe(true);
  });
  it('salvar como rascunho apaga a aprovação anterior', () => {
    const r = prepararModeloEmail({ ...limpo, status: 'rascunho', aprovadoPor: 'x', aprovadoEm: 'y' }, null, 'z', agora);
    expect(r.ok && r.modelo).toMatchObject({ status: 'rascunho', aprovadoPor: null, aprovadoEm: null });
  });
  it('reaprovar texto idêntico mantém a aprovação original', () => {
    const atual: SalesModeloEmail = { ...limpo, aprovadoPor: 'primeiro', aprovadoEm: '2026-11-01T00:00:00.000Z' };
    const r = prepararModeloEmail(limpo, atual, 'segundo', agora);
    expect(r.ok && r.modelo.aprovadoPor).toBe('primeiro');
  });
  it('a lista de variáveis do cliente espelha a do servidor', () => {
    expect(PLACEHOLDERS.map((p) => p.chave)).toEqual(PLACEHOLDERS_MODELO.map((p) => p.chave));
  });
});

describe('escalonamento de modo', () => {
  it('SEMI_AUTONOMOUS e AUTONOMOUS exigem confirmação explícita', () => {
    expect(erroEscalonamentoModo('SEMI_AUTONOMOUS', false, 'piloto validado')).toMatch(/Confirme/);
    expect(erroEscalonamentoModo('AUTONOMOUS', false, 'ok')).toMatch(/Confirme/);
  });
  it('e um motivo não vazio', () => {
    expect(erroEscalonamentoModo('AUTONOMOUS', true, '   ')).toMatch(/motivo/);
    expect(erroEscalonamentoModo('SEMI_AUTONOMOUS', true, 'piloto ok')).toBeNull();
  });
  it('pausar e voltar a modos seguros nunca exigem confirmação', () => {
    for (const m of ['PAUSED', 'DRY_RUN', 'REVIEW'] as const) expect(erroEscalonamentoModo(m, false, '')).toBeNull();
  });
});

describe('importação da base de conhecimento', () => {
  const item = { kind: 'produto', key: 'caixa-10kg', title: 'Caixa de 10 kg', content: 'Texto.' };
  it('aceita lista válida', () => {
    const r = validarImportacaoKb([item]);
    expect(r.ok).toBe(true);
  });
  it('recusa não-lista, lista vazia e mais de 200 itens', () => {
    expect(validarImportacaoKb({}).ok).toBe(false);
    expect(validarImportacaoKb([]).ok).toBe(false);
    expect(validarImportacaoKb(Array.from({ length: KB_IMPORT_MAX_ITENS + 1 }, (_, i) => ({ ...item, key: `k${i}` }))).ok).toBe(false);
    expect(validarImportacaoKb(Array.from({ length: KB_IMPORT_MAX_ITENS }, (_, i) => ({ ...item, key: `k${i}` }))).ok).toBe(true);
  });
  it('recusa texto acima de 4000 letras, tipo inválido e informa a posição', () => {
    const longo = validarImportacaoKb([item, { ...item, content: 'x'.repeat(4001) }]);
    expect(longo.ok).toBe(false);
    if (!longo.ok) expect(longo.erros[0]).toMatch(/Item 2/);
    expect(validarImportacaoKb([{ ...item, kind: 'qualquer' }]).ok).toBe(false);
    expect(validarImportacaoKb([{ ...item, content: 'x'.repeat(4000) }]).ok).toBe(true);
  });
});

describe('tradução dos códigos de motivo', () => {
  const codigosDe = (arquivo: string, re: RegExp) => [...ler(arquivo).matchAll(re)].map((m) => m[1]);

  const elegibilidade = codigosDe('server/lib/sales/elegibilidade.ts', /motivos\.push\('([a-z_]+)'\)/g);
  const despacho = codigosDe('server/lib/sales/despacho.ts', /negar\(\d+,\s*'([a-z_]+)'/g);
  const arbitro = codigosDe('server/lib/sales/arbitro.ts', /codigo:\s*'([a-z_]+)'/g);

  it('o scan encontra os códigos (evita teste vazio)', () => {
    expect(elegibilidade.length).toBeGreaterThanOrEqual(15);
    expect(despacho.length).toBeGreaterThanOrEqual(10);
    expect(arbitro.length).toBeGreaterThanOrEqual(4);
  });
  it('todo código de elegibilidade, despacho e árbitro tem tradução própria', () => {
    const faltando = [...new Set([...elegibilidade, ...despacho, ...arbitro])].filter((c) => !MOTIVOS[c]);
    expect(faltando).toEqual([]);
  });
  it('tradução não é o código cru nem fica vazia', () => {
    for (const [c, t] of Object.entries(MOTIVOS)) {
      expect(t.trim().length).toBeGreaterThan(5);
      expect(t).not.toContain('_');
      expect(t).not.toBe(c);
    }
  });
  it('código desconhecido cai em texto legível', () => {
    expect(traduzirMotivo('algum_codigo_novo')).toBe('Algum codigo novo');
    expect(humanizar('')).toBe('');
  });
});

describe('proteção do router', () => {
  const fonte = ler('server/routers/sales.ts');
  const corpo = fonte.slice(fonte.indexOf('export const salesRouter'));
  // Cada procedure começa com "nome: <algo>Procedure" no primeiro nível do router.
  const procedures = [...corpo.matchAll(/^ {2}([a-zA-Z]+): ([a-zA-Z]+)/gm)];

  it('encontra todas as procedures esperadas', () => {
    const nomes = procedures.map((m) => m[1]);
    for (const n of ['painel', 'settingsLer', 'settingsSalvar', 'definirModo', 'ciclo', 'lote', 'aprovarLote', 'cortarDoLote', 'jornadas',
      'pausarJornada', 'retomarJornada', 'suprimir', 'excecoes', 'resolverExcecao', 'desconhecidas', 'resolverDesconhecida', 'relatorio',
      'kbListar', 'kbSalvar', 'kbAprovar', 'kbArquivar', 'kbImportar', 'conversas', 'conversa']) {
      expect(nomes, n).toContain(n);
    }
  });
  it('toda procedure usa premiumAdminProcedure', () => {
    const fora = procedures.filter((m) => m[2] !== 'premiumAdminProcedure').map((m) => m[1]);
    expect(fora).toEqual([]);
  });
  it('nenhuma procedure pública ou menos restrita é importada', () => {
    expect(fonte).not.toMatch(/\b(publicProcedure|protectedProcedure|staffProcedure|adminProcedure|premiumStaffProcedure)\b/);
  });
  it('mudar o modo só passa por definirModo e toda escrita é auditada', () => {
    expect(fonte).toMatch(/key === 'modo'[\s\S]{0,200}TRPCError/);
    const escritas = (fonte.match(/\.mutation\(/g) ?? []).length;
    expect(escritas).toBeGreaterThanOrEqual(13);
    // ciclo só audita quando não é simulação; as demais escritas chamam auditar().
    expect((fonte.match(/await auditar\(/g) ?? []).length).toBeGreaterThanOrEqual(escritas - 0);
  });
  it('nunca usa `as any`', () => {
    expect(fonte).not.toMatch(/as any/);
  });
});
