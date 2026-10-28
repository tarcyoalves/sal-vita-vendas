// RepositorioCRM: o adaptador do RepositorioContatos para o CRM Lembretes (modo misto).
//
// - Sem login: tudo vai direto para o RepositorioLocal, exatamente como antes.
// - Com login: os lembretes do CRM (tasks.reminders, em cache) entram junto com os locais na central,
//   nos alarmes e no selo; o lead da conversa vem do CRM (métodos de LeadsCRM, via ServicoCrm). O que
//   está em chrome.storage é só cache.
// - Nada aqui toca em chrome.storage: usa o RepositorioLocal (único dono) e o ArmazemChaves dele.
// - Nada aqui envia mensagem de WhatsApp.

import { CHAVES_CRM, ehLembreteCrm, idLembreteCrm, lembreteParaCentral, taskIdDoLembrete, type LembreteCrm, type UsuarioCrm } from './crm-remoto';
import type { Colecao } from './crm-store';
import type { DadosCrm, Lembrete } from './crm-tipos';
import type { ArmazemChaves, LeadsCRM } from './leads';
import type { RepositorioContatos } from './repositorio';

export type RepositorioComCrm = RepositorioContatos & LeadsCRM;

export class RepositorioCRM {
  constructor(
    private readonly local: RepositorioContatos & ArmazemChaves,
    private readonly servico: LeadsCRM,
    private readonly relogio: () => number = Date.now,
  ) {}

  /** Lembretes do CRM em cache, no formato da central (vazio se não há login). */
  private async lembretesDoCrm(): Promise<Lembrete[]> {
    const conta = await this.local.lerChave<{ usuario: UsuarioCrm | null }>(CHAVES_CRM.conta);
    if (!conta?.usuario) return [];
    const cache = await this.local.lerChave<{ itens: LembreteCrm[] }>(CHAVES_CRM.lembretes);
    if (!cache) return [];
    const avisados = (await this.local.lerChave<Record<string, number>>(CHAVES_CRM.avisados)) ?? {};
    const dispensados = (await this.local.lerChave<Record<string, number>>(CHAVES_CRM.dispensados)) ?? {};
    const vinculos = (await this.local.lerChave<Record<string, number>>(CHAVES_CRM.vinculos)) ?? {};
    return cache.itens.map((l) => {
      let tel = l.telefone;
      let nomeDica: string | undefined;
      if (!tel) {
        const achadoTel = Object.entries(vinculos).find(([k, id]) => id === l.taskId && k.startsWith('tel:'));
        if (achadoTel) tel = achadoTel[0].slice(4);
      }
      const achadoNome = Object.entries(vinculos).find(([k, id]) => id === l.taskId && k.startsWith('nome:'));
      if (achadoNome) nomeDica = achadoNome[0].slice(5);

      const item = tel ? { ...l, telefone: tel } : l;
      const id = idLembreteCrm(l.taskId, l.venceEm);
      const lemb =
        id in dispensados
          ? lembreteParaCentral(item, 'concluido')
          : id in avisados
            ? lembreteParaCentral(item, 'disparado', avisados[id])
            : lembreteParaCentral(item, 'pendente');
      if (nomeDica) (lemb as any).nomeDica = nomeDica;
      return lemb;
    });
  }

  private async marcar(chave: string, id: string, quando: number): Promise<void> {
    const mapa = (await this.local.lerChave<Record<string, number>>(chave)) ?? {};
    if (mapa[id] === quando) return;
    mapa[id] = quando;
    await this.local.gravarChave(chave, mapa);
  }

  // ── Lembretes: locais + CRM ────────────────────────────────────────────────

  async listarLembretes(): Promise<Lembrete[]> {
    return [...(await this.local.listarLembretes()), ...(await this.lembretesDoCrm())];
  }

  async carregar(colecoes?: readonly Colecao[]): Promise<DadosCrm> {
    const d = await this.local.carregar(colecoes);
    if (!colecoes || colecoes.includes('lembretes')) d.lembretes = [...d.lembretes, ...(await this.lembretesDoCrm())];
    return d;
  }

  async atualizarLembrete(id: string, patch: Partial<Pick<Lembrete, 'status' | 'rascunho' | 'disparadoEm'>>): Promise<void> {
    if (!ehLembreteCrm(id)) return this.local.atualizarLembrete(id, patch);
    // Lembrete do CRM: a extensão só guarda "já avisei" (dedupe) e "dispensei"; o CRM não é alterado.
    if (patch.status === 'disparado') await this.marcar(CHAVES_CRM.avisados, id, patch.disparadoEm ?? this.relogio());
    else if (patch.status === 'concluido') await this.marcar(CHAVES_CRM.dispensados, id, this.relogio());
  }

  async excluirLembrete(id: string): Promise<void> {
    if (!ehLembreteCrm(id)) return this.local.excluirLembrete(id);
    await this.marcar(CHAVES_CRM.dispensados, id, this.relogio());
  }

  async adiarLembrete(id: string, venceEm: number, agora: Date): Promise<void> {
    const taskId = taskIdDoLembrete(id);
    if (taskId == null) return this.local.adiarLembrete(id, venceEm, agora);
    // Adiar é pedido explícito do usuário: muda a data no CRM (com fila se estiver sem rede).
    const r = await this.servico.reagendarTask(taskId, Math.max(venceEm, agora.getTime() + 60_000));
    if (r.ok) await this.marcar(CHAVES_CRM.dispensados, id, this.relogio());
    else console.warn('[Vita Zap] não consegui adiar o lembrete no CRM:', r.erro.mensagem);
  }
}

/**
 * Junta o RepositorioLocal, o RepositorioCRM (lembretes) e o serviço (LeadsCRM) num objeto só:
 * os métodos que o RepositorioCRM não define caem no RepositorioLocal; os de LeadsCRM vão ao serviço.
 */
export function criarRepositorioCRM(local: RepositorioContatos & ArmazemChaves, servico: LeadsCRM, relogio: () => number = Date.now): RepositorioComCrm {
  const crm = new RepositorioCRM(local, servico, relogio);
  return new Proxy(crm as unknown as RepositorioComCrm, {
    get(alvo, nome) {
      if (nome in alvo) return Reflect.get(alvo, nome, alvo) as unknown;
      const fonte = (nome in servico ? servico : local) as unknown as Record<string | symbol, unknown>;
      const v = fonte[nome];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(fonte) : v;
    },
  });
}
