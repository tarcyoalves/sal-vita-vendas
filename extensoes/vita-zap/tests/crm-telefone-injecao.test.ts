// @vitest-environment jsdom
//
// Telefone e identidade do contato lidos do HTML (sintético) do WhatsApp: nome exibido que é um
// número, id das mensagens (@c.us), vínculo manual, contato renomeado e último contato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { contato, contatosGravados, gravadoPorNome, porId } from './ajuda/fabrica';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z'); // 12:00 em Fortaleza
const LINHAS: LinhaFalsa[] = [{ nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica?' }];
const JID_ANA = '5584999990000'; // o que o fixture põe nos data-id das mensagens

let ctrl: ControladorCrm | null = null;
let chrome: ChromeFalso;

const sombra = (id: string): ShadowRoot => {
  const host = document.getElementById(id);
  if (!host?.shadowRoot) throw new Error(`host ${id} não encontrado`);
  return host.shadowRoot;
};
const popover = () => sombra('vita-zap-overlay');
const botao = (raiz: ParentNode, texto: string): HTMLButtonElement => {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};
const abrirPainelCliente = () => (sombra('vita-zap-cabecalho').querySelector('[title^="Cliente"]') as HTMLButtonElement).click();

async function iniciar(): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  return ctrl;
}

beforeEach(() => {
  limparAvisos();
  chrome = instalarChromeFalso();
  montarWhatsApp(LINHAS, 'Ana Souza');
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('telefone lido do HTML', () => {
  it('o id das mensagens da conversa aberta vira o telefone do contato criado pela primeira nota', async () => {
    await iniciar();
    abrirPainelCliente();
    (popover().querySelector('textarea') as HTMLTextAreaElement).value = 'Quer 200 sacos';
    botao(popover(), 'Salvar nota').click();
    await vi.waitFor(() => expect(gravadoPorNome(chrome, 'Ana Souza')).toBeDefined());
    const c = gravadoPorNome(chrome, 'Ana Souza');
    expect(c?.telefone).toBe(JID_ANA); // só dígitos, com DDI 55
    expect(c?.id).not.toContain('ana'); // id interno, não o nome
  });

  it('contato não salvo (o nome exibido é o número): guarda o telefone normalizado e nenhum alias de nome', async () => {
    montarWhatsApp(LINHAS, '+55 84 98888-7777');
    await iniciar();
    abrirPainelCliente();
    (popover().querySelector('textarea') as HTMLTextAreaElement).value = 'Pediu orçamento';
    botao(popover(), 'Salvar nota').click();
    await vi.waitFor(() => expect(contatosGravados(chrome)).toHaveLength(1));
    expect(contatosGravados(chrome)[0]).toMatchObject({ nome: '+55 84 98888-7777', telefone: '5584988887777', aliases: [] });
  });

  it('contato que já existia só com nome ganha o telefone quando ele aparece no HTML (mesmo registro)', async () => {
    const ana = contato('Ana Souza');
    chrome = instalarChromeFalso({ 'vz.contatos': porId(ana) });
    montarWhatsApp(LINHAS, 'Ana Souza');
    await iniciar();
    await vi.waitFor(() => expect(gravadoPorNome(chrome, 'Ana Souza')?.telefone).toBe(JID_ANA));
    expect(contatosGravados(chrome)).toHaveLength(1);
    expect(gravadoPorNome(chrome, 'Ana Souza')?.id).toBe(ana.id);
  });

  it('o contato foi renomeado no WhatsApp: o telefone liga ao mesmo registro (notas e lembretes não se perdem)', async () => {
    const ana = contato('Ana Souza', { telefone: JID_ANA, notas: [{ id: 'n', texto: 'Quer 200 sacos', criadaEm: 1 }] });
    chrome = instalarChromeFalso({ 'vz.contatos': porId(ana) });
    montarWhatsApp([{ nome: 'Aninha da Loja', data: '11:40', previa: 'Oi' }], 'Aninha da Loja');
    await iniciar();
    expect(sombra('vita-zap-cabecalho').querySelector('[title^="Cliente"] .selo')?.textContent).toBe('1'); // achou as notas da Ana
    abrirPainelCliente();
    expect(popover().textContent).toContain('Quer 200 sacos');
    // novo nome vira alias do mesmo registro, sem criar outro contato
    (popover().querySelector('textarea') as HTMLTextAreaElement).value = 'Agora se chama Aninha';
    botao(popover(), 'Salvar nota').click();
    await vi.waitFor(() => expect(gravadoPorNome(chrome, 'Ana Souza')?.notas).toHaveLength(2));
    expect(contatosGravados(chrome)).toHaveLength(1);
    expect(gravadoPorNome(chrome, 'Ana Souza')?.aliases).toContain('aninha da loja');
  });
});

describe('último contato e vínculo manual', () => {
  it('a leitura da lista guarda o último contato dos contatos que o usuário já anotou (e só deles)', async () => {
    chrome = instalarChromeFalso({ 'vz.contatos': porId(contato('Ana Souza')) });
    montarWhatsApp([...LINHAS, { nome: 'Bruno Lima', data: '10:00', previa: 'Oi' }], null);
    await iniciar();
    await vi.waitFor(() => expect(gravadoPorNome(chrome, 'Ana Souza')?.ultimoContatoEm).toBe(instanteNoFuso('2026-10-21', 11, 40)));
    expect(contatosGravados(chrome)).toHaveLength(1); // Bruno não virou contato só por aparecer na lista
  });

  it('vincular telefone pelo painel: grava normalizado e junta com outro registro do mesmo telefone', async () => {
    const ana = contato('Ana Souza');
    const outro = contato('+55 84 97777-1111', { telefone: '5584977771111', notas: [{ id: 'n', texto: 'nota do número', criadaEm: 1 }] });
    chrome = instalarChromeFalso({ 'vz.contatos': porId(ana, outro) });
    montarWhatsApp(LINHAS, 'Ana Souza');
    // o HTML aberto traz o telefone da Ana; o vínculo manual troca para o do outro registro
    await iniciar();
    abrirPainelCliente();
    const campo = popover().querySelector('input[aria-label="Telefone do contato"]') as HTMLInputElement;
    campo.value = '(84) 97777-1111';
    botao(popover(), 'Vincular telefone').click();
    await vi.waitFor(() => expect(contatosGravados(chrome)).toHaveLength(1));
    expect(contatosGravados(chrome)[0]).toMatchObject({ id: ana.id, telefone: '5584977771111' });
    expect(contatosGravados(chrome)[0].notas.map((n) => n.texto)).toEqual(['nota do número']);
  });

  it('telefone inválido no vínculo mostra o erro e não grava nada', async () => {
    await iniciar();
    abrirPainelCliente();
    (popover().querySelector('input[aria-label="Telefone do contato"]') as HTMLInputElement).value = '123';
    botao(popover(), 'Vincular telefone').click();
    await vi.waitFor(() => expect(popover().textContent).toContain('Telefone inválido'));
  });
});
