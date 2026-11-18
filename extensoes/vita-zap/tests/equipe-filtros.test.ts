// "Contatado há menos de X dias por QUALQUER atendente" na regra de não reenviar (0.7.60): prévia (filtros), cobrança e reativação.
// O contato da equipe NÃO conta como "o atendente já falou com este contato" (isso continua sendo só o envio local).

import { describe, expect, it } from 'vitest';
import type { ContatoVarrido } from '../src/shared/contatos';
import { aplicarFiltros, avaliarContato, FILTROS_PADRAO } from '../src/shared/filtros';
import { decidirCobranca, type Followup } from '../src/shared/followup';
import { chaveContato } from '../src/shared/nomes';

const AGORA = new Date('2026-11-18T15:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
function contato(nome: string, p: Partial<ContatoVarrido> = {}): ContatoVarrido {
  return { chave: chaveContato(nome), nome, rotuloData: '10/09/2026', ultimaConversa: '2026-09-10', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, duplicado: false, varridoEm: AGORA.toISOString(), ...p };
}
const ctx = (extra: Record<string, unknown> = {}) => ({ agora: AGORA, naoEnviar: new Set<string>(), ultimoEnvioPorChave: new Map<string, string>(), ...extra });

describe('prévia: o contato da equipe entra no intervalo mínimo entre campanhas (14 dias)', () => {
  it('outro atendente falou com o contato há 5 dias: excluído, com o motivo', () => {
    const d = avaliarContato(contato('Ana'), FILTROS_PADRAO, ctx({ contatadoPelaEquipePorChave: new Map([['ana', dias(5)]]) }));
    expect(d).toEqual({ situacao: 'excluido', motivo: 'recebeu campanha há 5 dia(s) de outro atendente ou computador (mínimo 14)' });
  });
  it('há mais de 14 dias: segue elegível', () => {
    expect(avaliarContato(contato('Ana'), FILTROS_PADRAO, ctx({ contatadoPelaEquipePorChave: new Map([['ana', dias(20)]]) })).situacao).toBe('incluido');
  });
  it('vale o mais recente entre o envio local e o da equipe', () => {
    const d = avaliarContato(contato('Ana'), FILTROS_PADRAO, ctx({ ultimoEnvioPorChave: new Map([['ana', dias(2)]]), contatadoPelaEquipePorChave: new Map([['ana', dias(30)]]) }));
    expect(d.motivo).toBe('recebeu campanha há 2 dia(s) (mínimo 14)'); // o local é o mais recente: sem "de outro atendente"
  });
  it('o intervalo escolhido na prévia (ex.: 30 dias) vale para a equipe também', () => {
    const f = { ...FILTROS_PADRAO, excluirContatadosHaDias: 30 };
    expect(avaliarContato(contato('Ana'), f, ctx({ contatadoPelaEquipePorChave: new Map([['ana', dias(20)]]) })).situacao).toBe('excluido');
  });
  it('NÃO conta como "falei com o contato" (filtro "só com mensagem minha" continua dependendo do envio local)', () => {
    const f = { ...FILTROS_PADRAO, soComMensagemMinha: true };
    const c = contato('Ana', { ultimaDeMim: false });
    const r = aplicarFiltros([c], f, ctx({ contatadoPelaEquipePorChave: new Map([['ana', dias(40)]]) }));
    expect(r[0].decisao.situacao).toBe('excluido');
    expect(r[0].decisao.motivo).toMatch(/sem mensagem sua/);
  });
  it('"não enviar mais" continua vencendo tudo', () => {
    expect(avaliarContato(contato('Ana'), FILTROS_PADRAO, ctx({ naoEnviar: new Set(['ana']) })).motivo).toBe('marcado "Não enviar mais"');
  });
});

describe('cobrança: o contato da equipe conta no intervalo de X dias', () => {
  const f: Followup = { id: 'o:ana', campanhaId: 'o', chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', mensagemCampanha: 'x', enviadoEm: dias(5), estado: 'monitorando', motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: dias(5) };
  const c = (extra: Record<string, unknown> = {}) => ({ agora: AGORA, dias: 3, naoEnviar: new Set<string>(), ultimoEnvioPorChave: new Map([['ana', dias(5)]]), ...extra });
  it('sem contato da equipe: cobra', () => {
    expect(decidirCobranca(f, c())).toEqual({ pode: true });
  });
  it('outro atendente falou com ela ontem: espera (volta a ser lida depois)', () => {
    expect(decidirCobranca(f, c({ contatadoPelaEquipePorChave: new Map([['ana', dias(1)]]) }))).toMatchObject({ pode: false, destino: 'espera' });
  });
  it('contato da equipe antigo: cobra', () => {
    expect(decidirCobranca(f, c({ contatadoPelaEquipePorChave: new Map([['ana', dias(10)]]) }))).toEqual({ pode: true });
  });
});
