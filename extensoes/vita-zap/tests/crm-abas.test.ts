// Regras puras das abas da barra superior: ordem, filtro por aba (fixa, funil, personalizada), contagens,
// ocultar grupos, ponto verde e a leitura segura da configuração.

import { describe, expect, it } from 'vitest';
import { ABAS_FIXAS, abaEfetiva, abasVisiveis, contarAbas, filtroDaConfig, filtroLigado, itensDaAba, temNovidade, todasAsAbas } from '../src/shared/crm-abas';
import { chavesDoVinculo } from '../src/shared/crm-remoto';
import { passaNoFiltro } from '../src/shared/crm-regras';
import { CONFIG_PADRAO, sanearDados } from '../src/shared/crm-store';
import type { ConfigCrm, Conversa } from '../src/shared/crm-tipos';
import { contato } from './ajuda/fabrica';

const AGORA = new Date('2026-10-21T15:00:00Z');

function conversa(nome: string, extra: Partial<Conversa> = {}): Conversa {
  return { chave: nome.toLowerCase(), nome, ultimaDeMim: false, naoLida: false, naoLidas: 0, grupo: false, arquivada: false, rotuloData: null, dataMsg: null, hora: null, previa: 'oi', ass: nome, desdeEm: 1, vistaEm: 1, ...extra };
}

const ana = contato('Ana', { etiquetas: ['quente'], fase: 'orcamento' });
const bruno = contato('Bruno', { fase: 'novo' });
const contatoDe = (c: Conversa) => [ana, bruno].find((x) => x.nome === c.nome);
const cfg = (extra: Partial<ConfigCrm> = {}): ConfigCrm => ({ ...CONFIG_PADRAO, ...extra });

describe('abas da barra superior', () => {
  it('a ordem fixa é Todas, Não lidas, Aguardando resposta, Precisa de resposta, Acompanhar, depois o funil e as personalizadas', () => {
    expect(ABAS_FIXAS.map((a) => a.rotulo)).toEqual(['Todas', 'Não lidas', 'Aguardando resposta', 'Precisa de resposta']);
    const todas = todasAsAbas(cfg({ abasPersonalizadas: [{ id: 'x1', nome: 'Padarias', etiquetas: ['quente'], fases: [] }] })).map((a) => a.rotulo);
    expect(todas).toEqual(['Todas', 'Não lidas', 'Aguardando resposta', 'Precisa de resposta', 'Acompanhar', 'Novo', 'Orçamento', 'Negociando', 'Fechado', 'Perdido', 'Padarias']);
  });

  it('aba Acompanhar: só existe com login no CRM, filtra pelas conversas dos leads e volta para Todas sem login', () => {
    const c = cfg({ aba: 'acompanhar' });
    expect(abasVisiveis(c).map((a) => a.id)).toContain('acompanhar');
    expect(abasVisiveis(c, false).map((a) => a.id)).not.toContain('acompanhar');
    expect(abaEfetiva(c)).toBe('acompanhar');
    expect(abaEfetiva(c, false, false)).toBe('todas');
    expect(abaEfetiva(c, true)).toBe('todas'); // layout antigo só tem as 4 fixas
    expect(filtroDaConfig(c, false, null).aba).toBe('todas');
    const f = filtroDaConfig(c, false, new Set(chavesDoVinculo({ nome: 'Ana', telefone: '5584999990000' })));
    expect(f.aba).toBe('acompanhar');
    expect(filtroLigado(f)).toBe(true);
    expect(passaNoFiltro(conversa('Ana'), ana, f, AGORA)).toBe(true);
    expect(passaNoFiltro(conversa('Bruno'), bruno, f, AGORA)).toBe(false);
    expect(passaNoFiltro(conversa('Zé', { telefone: '5584999990000' }), undefined, f, AGORA)).toBe(true); // pelo telefone
    expect(passaNoFiltro(conversa('Ana', { grupo: true }), ana, f, AGORA)).toBe(false);
    expect(passaNoFiltro(conversa('Ana', { arquivada: true }), ana, f, AGORA)).toBe(false);
  });

  it('a configuração guardada com a aba Acompanhar não é descartada', () => {
    expect(sanearDados({ config: { aba: 'acompanhar' } }).config?.aba).toBe('acompanhar');
  });

  it('aba de funil e aba escondida: escondida some da barra e "Todas" nunca some', () => {
    const c = cfg({ abasOcultas: ['fase:perdido', 'todas'] });
    const ids = abasVisiveis(c).map((a) => a.id);
    expect(ids).not.toContain('fase:perdido');
    expect(ids).toContain('todas');
  });

  it('aba apagada ou escondida volta para Todas', () => {
    expect(abaEfetiva(cfg({ aba: 'p:nao-existe' }))).toBe('todas');
    expect(abaEfetiva(cfg({ aba: 'fase:novo', abasOcultas: ['fase:novo'] }))).toBe('todas');
    expect(abaEfetiva(cfg({ aba: 'fase:novo' }), true)).toBe('todas'); // layout antigo só tem as 4 fixas
    expect(abaEfetiva(cfg({ aba: 'precisa' }), true)).toBe('precisa');
  });

  it('filtro de aba personalizada: basta uma etiqueta ou fase bater; combina com o chip de etiquetas por E', () => {
    const c = cfg({ aba: 'p:a', abasPersonalizadas: [{ id: 'a', nome: 'Meus', etiquetas: ['quente'], fases: ['novo'] }] });
    const f = filtroDaConfig(c);
    expect(itensDaAba(c, 'p:a')).toEqual(['quente', 'fase:novo']);
    expect(passaNoFiltro(conversa('Ana'), ana, f, AGORA)).toBe(true);
    expect(passaNoFiltro(conversa('Bruno'), bruno, f, AGORA)).toBe(true);
    expect(passaNoFiltro(conversa('Zé'), undefined, f, AGORA)).toBe(false);
    expect(passaNoFiltro(conversa('Bruno'), bruno, { ...f, etiquetas: ['quente'] }, AGORA)).toBe(false);
  });

  it('ocultar grupos esconde grupos na lista e nos contadores', () => {
    const conversas = [conversa('Ana'), conversa('Grupo Sal', { grupo: true, naoLida: true, naoLidas: 1 })];
    expect(contarAbas(conversas, contatoDe, cfg()).todas).toBe(2);
    expect(contarAbas(conversas, contatoDe, cfg({ ocultarGrupos: true })).todas).toBe(1);
    const f = filtroDaConfig(cfg({ ocultarGrupos: true }));
    expect(filtroLigado(f)).toBe(true);
    expect(passaNoFiltro(conversas[1], undefined, f, AGORA)).toBe(false);
    expect(filtroLigado(filtroDaConfig(cfg()))).toBe(false);
  });

  it('conta as abas fixas, de funil e personalizadas (arquivadas nunca entram)', () => {
    const conversas = [conversa('Ana'), conversa('Bruno', { ultimaDeMim: true }), conversa('Zé', { arquivada: true })];
    const r = contarAbas(conversas, contatoDe, cfg({ abasPersonalizadas: [{ id: 'q', nome: 'Quentes', etiquetas: ['quente'], fases: [] }] }));
    expect(r).toMatchObject({ todas: 2, precisa: 1, aguardando: 1, 'fase:orcamento': 1, 'fase:novo': 1, 'fase:perdido': 0, 'p:q': 1 });
  });

  it('ponto verde só quando a aba cresceu desde a última vez que o usuário olhou', () => {
    expect(temNovidade(5, undefined)).toBe(false);
    expect(temNovidade(5, 5)).toBe(false);
    expect(temNovidade(6, 5)).toBe(true);
    expect(temNovidade(3, 5)).toBe(false);
  });

  it('a configuração lida do storage ganha padrões e descarta lixo', () => {
    const vazio = sanearDados({ config: { aba: 'todas' } }).config;
    expect(vazio).toMatchObject({ barraSuperior: true, ocultarGrupos: false, abasOcultas: [], abasPersonalizadas: [], abasVistas: {} });
    const lixo = sanearDados({ config: { aba: 'p:zz', barraSuperior: false, abasPersonalizadas: [{ id: 'a', nome: ' ', etiquetas: [], fases: [] }, { id: 'b', nome: 'Boa', etiquetas: ['x', 1], fases: ['novo', 'xx'] }], abasVistas: { todas: 4, lixo: 'a' } } }).config;
    expect(lixo?.barraSuperior).toBe(false);
    expect(lixo?.abasPersonalizadas).toEqual([{ id: 'b', nome: 'Boa', etiquetas: ['x'], fases: ['novo'] }]);
    expect(lixo?.abasVistas).toEqual({ todas: 4 });
    expect(sanearDados({ config: { aba: 'qualquer coisa' } }).config?.aba).toBe('todas');
  });
});
