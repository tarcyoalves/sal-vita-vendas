// Aviso diário de "histórico sumindo" (v0.7.59), no service worker, SEM abrir o WhatsApp.
//
// O WhatsApp Web só guarda ~25–40 dias de conversa. Todo dia (alarme) o service worker conta, só com o que já está salvo
// localmente (a última varredura e os registros da reativação), quantos contatos estão entre a etapa 1 da reativação e etapa 1 + 5
// dias SEM terem sido lidos, e mostra UMA notificação: "N conversas precisam ser lidas até dd/MM senão o histórico some do WhatsApp
// Web". Só se N > 0 e no máximo uma por dia. Usa as permissões que a extensão já tem (alarms, notifications): sem permissão nova.
// Se a notificação não puder ser mostrada, cai para o selo (badge) do ícone.

import { abrirBanco, lerAvisoHistorico, lerConfigReativacao, listarContatos, listarEnvios, listarNaoEnviar, listarReativacoes, salvarAvisoHistorico, type Banco } from '../shared/banco';
import { instanteNoFuso } from '../shared/crm-lembretes';
import { hojeNoFuso, somarDias } from '../shared/datas';
import { ultimoEnvioPorChave } from '../shared/filtros';
import { historicoSumindo, textoDoAviso, type HistoricoSumindo } from '../shared/historico-sumindo';

export const ALARME_HISTORICO = 'vz-historico';
export const NOTIFICACAO_HISTORICO = 'hist-aviso';
/** Hora local de Fortaleza em que o alarme diário dispara. */
export const HORA_DO_AVISO = 9;

export interface DependenciasHistorico {
  abrir: () => Promise<Banco>;
  /** Mostra a notificação. Se lançar erro, o aviso cai para o selo do ícone. */
  notificar: (texto: string) => Promise<void>;
  selo: (texto: string) => Promise<void>;
}

const dependenciasPadrao = (): DependenciasHistorico => ({
  abrir: () => abrirBanco(),
  async notificar(texto) {
    await chrome.notifications.create(NOTIFICACAO_HISTORICO, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-128.png'),
      title: 'Vita Zap: histórico sumindo',
      message: texto,
      priority: 1,
    });
  },
  async selo(texto) {
    await chrome.action.setBadgeText({ text: texto });
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  },
});

/** Conta, só com o que está salvo no IndexedDB, quem está para perder o histórico. */
export async function calcularHistoricoSumindo(db: Banco, agora: Date): Promise<HistoricoSumindo> {
  const [contatos, config, registros, naoEnviar, envios] = await Promise.all([listarContatos(db), lerConfigReativacao(db), listarReativacoes(db), listarNaoEnviar(db), listarEnvios(db)]);
  return historicoSumindo(contatos, config, registros, { agora, naoEnviar: new Set(naoEnviar.map((n) => n.chave)), ultimoEnvioPorChave: ultimoEnvioPorChave(envios) });
}

/** Roda o aviso do dia: no máximo UM por dia (fuso de Fortaleza) e só se houver conversa a ler. Devolve o texto avisado (ou null). */
export async function verificarHistorico(agora: Date = new Date(), d: DependenciasHistorico = dependenciasPadrao()): Promise<string | null> {
  const hoje = hojeNoFuso(agora);
  const db = await d.abrir();
  try {
    if ((await lerAvisoHistorico(db)) === hoje) return null;
    const aviso = await calcularHistoricoSumindo(db, agora);
    const texto = textoDoAviso(aviso);
    if (texto == null) return null;
    try {
      await d.notificar(texto);
    } catch {
      // Sem como notificar (bloqueado no sistema, por exemplo): o selo do ícone avisa.
      await d.selo(String(Math.min(aviso.total, 99))).catch(() => undefined);
    }
    await salvarAvisoHistorico(db, hoje);
    return texto;
  } finally {
    db.close();
  }
}

/** Garante o alarme diário (às 9h de Fortaleza). Idempotente: não recria se já existe. */
export async function garantirAlarmeHistorico(agora: Date = new Date()): Promise<void> {
  const existentes = await chrome.alarms.getAll();
  if (existentes.some((a) => a.name === ALARME_HISTORICO)) return;
  const hoje = hojeNoFuso(agora);
  const hoje9 = instanteNoFuso(hoje, HORA_DO_AVISO, 0);
  const when = hoje9 > agora.getTime() ? hoje9 : instanteNoFuso(somarDias(hoje, 1), HORA_DO_AVISO, 0);
  await chrome.alarms.create(ALARME_HISTORICO, { when, periodInMinutes: 24 * 60 });
}

/** O alarme do dia tocou. Devolve true se era o do histórico (o chamador não precisa tratar mais nada). */
export async function aoAlarmeHistorico(nome: string, agora: Date = new Date()): Promise<boolean> {
  if (nome !== ALARME_HISTORICO) return false;
  await verificarHistorico(agora);
  return true;
}

/** Clique no aviso: só fecha a notificação (o painel abre pelo ícone da extensão). */
export async function aoClicarAvisoHistorico(id: string): Promise<boolean> {
  if (id !== NOTIFICACAO_HISTORICO) return false;
  await chrome.notifications.clear(id);
  return true;
}
