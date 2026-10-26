// @vitest-environment jsdom
//
// Faixa do lead do CRM Lembretes no cabeçalho da conversa (HTML sintético do WhatsApp + CRM falso):
// sem login não aparece; com login mostra o lead achado pelo telefone; registrar contato, sem rede e
// "Criar lead". Nenhuma mensagem de WhatsApp é enviada em nenhum caminho.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z'); // 12:00 em Fortaleza
const LINHAS: LinhaFalsa[] = [{ nome: 'Ana Souza Cliente', data: '11:40', previa: 'Quanto fica?' }];

let ctrl: ControladorCrm | null = null;
let crm: CrmFalso;
let servico: ServicoCrm;
let repo: ReturnType<typeof criarRepositorioCRM>;

const faixa = (): ShadowRoot | null => document.getElementById('vita-zap-lead')?.shadowRoot ?? null;
const textoFaixa = (): string => faixa()?.textContent ?? '';
const overlay = (): ShadowRoot => document.getElementById('vita-zap-overlay')!.shadowRoot!;
const botao = (raiz: ParentNode, texto: string): HTMLButtonElement => {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};

async function iniciar(logar: boolean): Promise<void> {
  if (logar) {
    await servico.definirUrl(BASE);
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
  }
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });
}

beforeEach(() => {
  limparAvisos();
  instalarChromeFalso();
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Pediu tabela.', tags: ['quente'], reminderDate: new Date('2026-10-22T12:00:00Z'), lastContactedAt: new Date('2026-10-20T15:00:00Z'), contactCount: 2 })]);
  const local = new RepositorioLocal();
  servico = new ServicoCrm(local, crm.transporte);
  repo = criarRepositorioCRM(local, servico);
  montarWhatsApp(LINHAS, 'Ana Souza Cliente'); // as mensagens da conversa têm o telefone 5584999990000
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('faixa do lead', () => {
  it('sem login (modo local) não aparece e o CRM não é consultado', async () => {
    await iniciar(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(document.getElementById('vita-zap-lead')).toBeNull();
    expect(crm.requisicoes).toHaveLength(0);
    // o resto do CRM local continua lá
    expect(document.getElementById('vita-zap-cabecalho')).not.toBeNull();
  });

  it('com login mostra o lead achado pelo telefone: título, etiquetas, próximo lembrete, último contato e notas', async () => {
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    const t = textoFaixa();
    expect(t).toContain('quente');
    expect(t).toContain('Próximo lembrete:');
    expect(t).toContain('Último contato:');
    expect(t).toContain('Notas: Pediu tabela.');
    expect(crm.chamadas('tasks.findForWhatsapp')[0].entrada).toEqual({ phone: '5584999990000' });
    // fica logo abaixo do cabeçalho da conversa
    expect(document.getElementById('vita-zap-lead')?.previousElementSibling?.tagName).toBe('HEADER');
  });

  it('Registrar contato: anexa a linha às notas no CRM e a faixa mostra a nota nova', async () => {
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    botao(faixa()!, 'Registrar contato').click();
    (overlay().querySelector('textarea') as HTMLTextAreaElement).value = 'Fechou 30 sacos para sexta';
    botao(overlay(), 'Registrar no CRM').click();
    await vi.waitFor(() => expect(crm.tasks[0].notes).toMatch(/^Pediu tabela\.\n\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] Fechou 30 sacos para sexta$/));
    await vi.waitFor(() => expect(textoFaixa()).toContain('Fechou 30 sacos para sexta'));
    expect(crm.tasks[0].contactCount).toBe(3);
  });

  it('sem rede: avisa que guardou, mostra a ação pendente e reenvia quando a rede volta; o texto não se perde', async () => {
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    crm.semRede = true;
    botao(faixa()!, 'Registrar contato').click();
    (overlay().querySelector('textarea') as HTMLTextAreaElement).value = 'Pediu desconto';
    botao(overlay(), 'Registrar no CRM').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('guardei a ação'));
    await vi.waitFor(() => expect(textoFaixa()).toContain('1 ação(ões) guardada(s)'));
    expect(crm.tasks[0].notes).toBe('Pediu tabela.');
    crm.semRede = false;
    expect(await servico.reenviarFila()).toEqual({ enviados: 1, restantes: 0 });
    expect(crm.tasks[0].notes).toContain('Pediu desconto');
  });

  it('erro de validação mantém o texto digitado no campo e mostra o motivo', async () => {
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    botao(faixa()!, 'Registrar contato').click();
    const campo = overlay().querySelector('textarea') as HTMLTextAreaElement;
    campo.value = 'x'.repeat(1001);
    botao(overlay(), 'Registrar no CRM').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Texto longo demais'));
    expect(campo.value).toHaveLength(1001);
  });

  it('conversa sem lead: oferece Vincular/Criar; "Criar lead" cria no CRM e já mostra a faixa do lead', async () => {
    crm.tasks.length = 0;
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Sem lead no CRM'));
    expect(textoFaixa()).toContain('Vincular a um lead');
    botao(faixa()!, 'Criar lead').click();
    const campos = overlay().querySelectorAll<HTMLInputElement>('input');
    expect(campos[0].value).toBe('Ana Souza Cliente');
    expect(campos[1].value).toBe('5584999990000');
    botao(overlay(), 'Criar lead').click();
    await vi.waitFor(() => expect(crm.tasks).toHaveLength(1));
    expect(crm.tasks[0]).toMatchObject({ title: 'Ana Souza Cliente', phone: '84999990000' });
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Ana Souza'));
  });

  it('Vincular a um lead: busca por nome e liga a conversa ao lead escolhido', async () => {
    crm.tasks[0].phone = '84911112222'; // outro telefone: o telefone da conversa não acha
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Sem lead no CRM'));
    botao(faixa()!, 'Vincular a um lead').click();
    (overlay().querySelector('input') as HTMLInputElement).value = 'padaria';
    botao(overlay(), 'Buscar').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Padaria da Ana'));
    botao(overlay(), 'Vincular').click();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
  });

  it('Vincular (admin): a lista mostra o responsável de cada lead', async () => {
    crm.tasks[0].phone = '84911112222';
    crm.tasks[0].assignedTo = 'Maria Atendente';
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Sem lead no CRM'));
    botao(faixa()!, 'Vincular a um lead').click();
    (overlay().querySelector('input') as HTMLInputElement).value = 'padaria';
    botao(overlay(), 'Buscar').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Responsável: Maria Atendente'));
  });

  it('Vincular (atendente): sem responsável na resposta, a lista não mostra "Responsável"', async () => {
    crm.tasks[0].phone = '84911112222';
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Sem lead no CRM'));
    botao(faixa()!, 'Vincular a um lead').click();
    (overlay().querySelector('input') as HTMLInputElement).value = 'padaria';
    botao(overlay(), 'Buscar').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Padaria da Ana'));
    expect(overlay().textContent).not.toContain('Responsável');
  });

  it('sessão caída: a faixa explica e manda entrar de novo (o resto do CRM local segue)', async () => {
    await iniciar(true);
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    crm.logado = false; // o cookie expirou no servidor
    // a página não consulta o CRM sozinha: a sessão caída aparece quando o usuário faz uma ação
    botao(faixa()!, 'Registrar contato').click();
    (overlay().querySelector('textarea') as HTMLTextAreaElement).value = 'Pediu desconto';
    botao(overlay(), 'Registrar no CRM').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Sessão não reconhecida'));
    expect((await servico.conta()).usuario).toBeNull();
  });
});
