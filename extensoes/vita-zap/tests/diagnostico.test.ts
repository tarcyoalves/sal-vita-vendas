// @vitest-environment jsdom
// Diagnóstico: registro circular, privacidade, retrato da página (somente leitura) e o
// resumo "Concluída com problemas".

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, salvarConfig } from '../src/shared/banco';
import { type Campanha, motivosAgrupados, terminouComProblemas } from '../src/shared/campanha';
import { diagnosticarPagina, mascararDataId } from '../src/content/diagnostico';
import { MAX_EVENTOS_DIAGNOSTICO, RegistroDiagnostico, mascararTelefones, resumirPagina, textoDiagnostico } from '../src/shared/diagnostico';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { Executor } from '../src/sidepanel/executor';

let n = 0;
const novoBanco = () => abrirBanco(`diag-${Date.now()}-${(n += 1)}`);

describe('mascarar telefones', () => {
  it('mascara números com formatação e mantém só os 2 últimos dígitos', () => {
    expect(mascararTelefones('Ligar para +55 (84) 99999-1234 agora')).toBe('Ligar para ••••34 agora');
    expect(mascararTelefones('5584999991234')).toBe('••••34');
  });
  it('não mexe em números curtos', () => {
    expect(mascararTelefones('3 problemas em 2026')).toBe('3 problemas em 2026');
  });
});

describe('registro circular', () => {
  it('guarda só os últimos 200, em memória e no IndexedDB', async () => {
    const db = await novoBanco();
    const reg = new RegistroDiagnostico(db, '0.2.1');
    for (let i = 0; i < 230; i += 1) reg.registrar({ fase: 'abrindo', pedido: 'abrirEColar', resposta: { ok: true }, item: `Fulano ${i}`, pagina: null });
    expect(reg.lista()).toHaveLength(MAX_EVENTOS_DIAGNOSTICO);
    expect(reg.lista()[0].item).toBe('Fulano 30');
    await new Promise((r) => setTimeout(r, 200));
    const outro = new RegistroDiagnostico(db, '0.2.1');
    await outro.carregar();
    expect(outro.lista()).toHaveLength(MAX_EVENTOS_DIAGNOSTICO);
    expect(outro.lista().at(-1)?.item).toBe('Fulano 229');
  });

  it('o texto exportado tem versão, fase, pedido e resposta, e mascara telefone', () => {
    const reg = new RegistroDiagnostico(null, '0.2.1', () => new Date('2026-10-20T10:00:00Z'));
    reg.registrar({
      fase: 'abrindo',
      pedido: 'abrirEColar',
      resposta: { ok: false, codigo: 'nao_encontrado', erro: 'não achei 5584999991234' },
      item: '+55 84 99999-1234',
      pagina: resumirPagina({
        url: 'https://web.whatsapp.com/',
        idioma: 'pt-BR',
        seletores: [{ chave: 'painelLateral', casou: '#pane-side', quantidade: 1 }, { chave: 'caixaMensagem', casou: null, quantidade: 0 }],
        linhasNaLista: 3,
        conversaAberta: false,
        tituloCabecalho: false,
        caixaMensagem: false,
        dataIds: { total: 0, amostras: [] },
        estruturaMensagem: [],
        caixaBusca: null,
        linhasMensagem: { convMsg: 0, renderizadas: 0, autores: [], elementosAutor: 0 },
        classificacao: { tipo: 'desconhecido', iconeGrupo: false, recebidas: 0, enviadas: 0, recebidasComAutor: 0, autoresDistintos: 0, autorIgualAoTitulo: null, elementoAutor: false, comIconeDeStatus: 0, sistema: 0, meuNome: null, autoresDoOutroLado: 0, iconesNasLinhas: [] },
      }),
    });
    const t = textoDiagnostico(reg.lista(), '0.2.1', new Date('2026-10-20T10:00:00Z'));
    expect(t).toContain('Vita Zap 0.2.1');
    expect(t).toContain('fase=abrindo pedido=abrirEColar resposta=ERRO nao_encontrado');
    expect(t).toContain('seletor painelLateral: #pane-side');
    expect(t).toContain('seletor caixaMensagem: nenhuma');
    expect(t).toContain('idioma="pt-BR"');
    expect(t).not.toContain('5584999991234');
    expect(t).not.toContain('99999-1234');
  });
});

describe('retrato da página (somente leitura)', () => {
  it('mascara data-id mantendo prefixo, sufixo e os 4 últimos dígitos', () => {
    expect(mascararDataId('true_5584999991234@c.us_3EB0A1B2C3')).toBe('true_*********1234@c.us_3EB0A1B2C3');
    expect(mascararDataId('false_120363012345678901@g.us_ABCDEF')).toBe('false_**************8901@g.us_ABCDEF');
  });

  it('relata seletor que casou, contagens, data-id mascarados e atributos', () => {
    document.body.innerHTML = `
      <div id="side"><div id="pane-side"><div role="listitem">a</div><div role="listitem">b</div></div></div>
      <div id="main"><header><span dir="auto" title="Fulano">Fulano</span></header>
        <div role="row" data-id="false_5584999991234@c.us_AAA111" data-x="1"><div class="copyable-text" data-pre-plain-text="[10:00]">oi</div></div>
        <footer><div contenteditable="true" role="textbox"></div></footer></div>`;
    const antes = document.body.innerHTML;
    const d = diagnosticarPagina(document);
    expect(document.body.innerHTML).toBe(antes); // nada mudou
    expect(d.seletores.find((s) => s.chave === 'painelLateral')).toEqual({ chave: 'painelLateral', casou: '#pane-side', quantidade: 1 });
    expect(d.seletores.find((s) => s.chave === 'iconeGrupo')?.casou).toBeNull();
    expect(d.linhasNaLista).toBe(2);
    expect(d.conversaAberta).toBe(true);
    expect(d.tituloCabecalho).toBe(true);
    expect(d.caixaMensagem).toBe(true);
    expect(d.dataIds).toEqual({ total: 1, amostras: ['false_*********1234@c.us_AAA111'] });
    expect(d.estruturaMensagem).toEqual(expect.arrayContaining(['attr:data-id', 'attr:data-x', 'copyable-text attr:data-pre-plain-text', 'seletor:#main [role="row"] (1)']));
    expect(JSON.stringify(d)).not.toContain('Fulano');
  });
});

function campanha(nomes: string[]): Campanha {
  return {
    id: 'camp',
    nome: 't',
    criadaEm: '2026-10-19T12:00:00.000Z',
    aprovadaEm: '2026-10-19T12:00:00.000Z',
    termoBusca: 'X',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi {primeiroNome} texto-secreto'],
    status: 'pausada',
    motivoPausa: null,
    itens: nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: 'Oi {primeiroNome} texto-secreto', status: 'pendente' as const, motivo: null, atualizadoEm: null })),
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  };
}

describe('campanha de 1 contato que falha (caso de campo)', () => {
  it('vira "concluída com problemas", guarda código/motivo e registra o diagnóstico sem o texto', async () => {
    const db = await novoBanco();
    await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
    const reg = new RegistroDiagnostico(db, '0.2.1');
    const pedidos: PedidoConteudo[] = [];
    const ex = new Executor(
      {
        db,
        pedir: async (p): Promise<RespostaConteudo> => {
          pedidos.push(p);
          if (p.tipo === 'diagnosticar') {
            return {
              ok: true,
              diagnostico: {
                url: 'https://web.whatsapp.com/',
                idioma: 'pt-BR',
                seletores: [{ chave: 'mensagem', casou: null, quantidade: 0 }],
                linhasNaLista: 1,
                conversaAberta: true,
                tituloCabecalho: true,
                caixaMensagem: true,
                dataIds: { total: 2, amostras: ['true_*****1234@lid_X'] },
                estruturaMensagem: ['attr:data-id'],
                caixaBusca: null,
                linhasMensagem: { convMsg: 0, renderizadas: 0, autores: [], elementosAutor: 0 },
                classificacao: { tipo: 'desconhecido', iconeGrupo: false, recebidas: 0, enviadas: 0, recebidasComAutor: 0, autoresDistintos: 0, autorIgualAoTitulo: null, elementoAutor: false, comIconeDeStatus: 0, sistema: 0, meuNome: null, autoresDoOutroLado: 0, iconesNasLinhas: [] },
              },
            };
          }
          return { ok: false, codigo: 'nao_confirmado', erro: 'Não consegui confirmar que "Ana" é conversa individual.' };
        },
        agora: () => new Date('2026-10-19T13:00:00Z'),
        aleatorio: () => 0.5,
        agendar: () => () => undefined,
        diagnostico: reg,
      },
      campanha(['Ana']),
    );
    await ex.iniciar();

    const c = ex.atual.campanha;
    expect(c.status).toBe('concluida');
    expect(c.itens[0]).toMatchObject({ status: 'pulado', codigo: 'nao_confirmado' });
    expect(terminouComProblemas(c)).toBe(true);
    expect(motivosAgrupados(c)).toEqual([{ codigo: 'nao_confirmado', quantidade: 1, mensagem: expect.stringContaining('Ana') }]);
    expect(ex.atual.mensagem).toMatch(/com problemas/);

    const t = textoDiagnostico(reg.lista(), reg.versao);
    expect(t).toContain('pedido=abrirEColar resposta=ERRO nao_confirmado');
    expect(t).toContain('pedido=diagnosticar');
    expect(t).toContain('seletor mensagem: nenhuma');
    expect(t).toContain('data-id: true_*****1234@lid_X');
    expect(t).not.toContain('texto-secreto');
  });

  it('com pelo menos um envio não é "com problemas"', () => {
    const c = campanha(['A', 'B']);
    c.status = 'concluida';
    c.itens[0].status = 'enviado';
    c.itens[1].status = 'problema';
    expect(terminouComProblemas(c)).toBe(false);
  });
});
