// Regras centrais do Sal Vita Sales AI (puras). Projeto V3.1: seções 8, 16.1, 16.2, 16.3, 16.5.
import { describe, it, expect } from 'vitest';
import {
  SALES_SETTINGS_DEFAULTS, SALES_SETTINGS_SCHEMAS, MODELO_EMAIL_RASCUNHO, referenciaMlVigente,
  type SalesLimites, type SalesRemetente,
} from '../shared/sales';
import { transicionar, estadoPermiteProspeccao, prospeccaoEncerrada } from '../server/lib/sales/estados';
import { avaliarElegibilidade, ehInstitucional, pareceNominal, type EntradaElegibilidade } from '../server/lib/sales/elegibilidade';
import { arbitrar, proximoPassoEm } from '../server/lib/sales/arbitro';
import {
  decidirAutorizacao, decidirResultado, decidirConciliacao, modoPermiteDespacho, hashToken, novoToken,
  podeSerReservada, type EntradaAutorizacao,
} from '../server/lib/sales/despacho';
import { verificarTextoComercial, contemValorCritico, removerDadosPessoais } from '../server/lib/sales/conteudo';
import { montarMensagem, montarMessageId, chaveLogicaProspeccao } from '../server/lib/sales/mensagem';
import { pontuar } from '../server/lib/sales/pontuacao';
import { interpretarSetting } from '../server/lib/sales/settingsPuro';

const limites: SalesLimites = SALES_SETTINGS_DEFAULTS.limites;

describe('padrões seguros', () => {
  it('nasce em simulação, com canal, agente e simulador desligados', () => {
    expect(SALES_SETTINGS_DEFAULTS.modo).toBe('DRY_RUN');
    expect(SALES_SETTINGS_DEFAULTS.canal.ativo).toBe(false);
    expect(SALES_SETTINGS_DEFAULTS.canal.politicaAprovada).toBe(false);
    expect(SALES_SETTINGS_DEFAULTS.agente.ativo).toBe(false);
    expect(SALES_SETTINGS_DEFAULTS.simuladorRevenda.ativo).toBe(false);
    expect(SALES_SETTINGS_DEFAULTS.modeloEmail.status).toBe('rascunho');
    expect(SALES_SETTINGS_DEFAULTS.disponibilidade.status).toBe('nao_informado');
  });
  it('todos os padrões passam no próprio schema', () => {
    for (const [k, schema] of Object.entries(SALES_SETTINGS_SCHEMAS)) {
      expect(schema.safeParse(SALES_SETTINGS_DEFAULTS[k as keyof typeof SALES_SETTINGS_DEFAULTS]).success, k).toBe(true);
    }
  });
  it('valor inválido no banco vira o padrão', () => {
    expect(interpretarSetting('modo', 'LIGADO_GERAL')).toBe('DRY_RUN');
    expect(interpretarSetting('limites', { enviosDia: -5 })).toEqual(limites);
    expect(interpretarSetting('modo', 'REVIEW')).toBe('REVIEW');
  });
  it('referência do Mercado Livre vale por 30 dias', () => {
    const agora = new Date('2026-11-28T12:00:00Z');
    expect(referenciaMlVigente({ precoCentavos: 12900, url: null, conferidoEm: '2026-11-20T00:00:00Z' }, agora)).toBe(true);
    expect(referenciaMlVigente({ precoCentavos: 12900, url: null, conferidoEm: '2026-10-01T00:00:00Z' }, agora)).toBe(false);
    expect(referenciaMlVigente({ precoCentavos: null, url: null, conferidoEm: '2026-11-20T00:00:00Z' }, agora)).toBe(false);
  });
});

describe('máquina de estados', () => {
  it('segue o caminho feliz', () => {
    expect(transicionar('IDENTIFIED', 'QUALIFICAR')).toMatchObject({ ok: true, para: 'QUALIFIED' });
    expect(transicionar('QUALIFIED', 'ENTRAR_NO_LOTE')).toMatchObject({ ok: true, para: 'CONTACT_REVIEW' });
    expect(transicionar('CONTACT_REVIEW', 'PRIMEIRO_ENVIO')).toMatchObject({ ok: true, para: 'CONTACTED' });
    expect(transicionar('CONTACTED', 'RESPOSTA_INTERESSE')).toMatchObject({ ok: true, para: 'INTERESTED' });
    expect(transicionar('INTERESTED', 'PEDIDO_PAGO')).toMatchObject({ ok: true, para: 'CUSTOMER' });
    expect(transicionar('CUSTOMER', 'JANELA_REPOSICAO')).toMatchObject({ ok: true, para: 'REPLENISHMENT' });
  });
  it('supressão vale de qualquer estado e é terminal', () => {
    for (const de of ['IDENTIFIED', 'CONTACTED', 'CUSTOMER', 'CLOSED'] as const) {
      expect(transicionar(de, 'SUPRIMIR')).toMatchObject({ ok: true, para: 'SUPPRESSED' });
    }
    expect(transicionar('SUPPRESSED', 'PEDIDO_PAGO').ok).toBe(false);
    expect(transicionar('SUPPRESSED', 'REABRIR').ok).toBe(false);
  });
  it('compra sempre vira cliente (inclusive vinda do marketplace)', () => {
    for (const de of ['IDENTIFIED', 'QUALIFIED', 'CONTACT_REVIEW', 'CONTACTED', 'NEGOTIATION', 'CLOSED'] as const) {
      expect(transicionar(de, 'PEDIDO_PAGO')).toMatchObject({ ok: true, para: 'CUSTOMER' });
    }
  });
  it('evento fora de ordem é recusado, não regride', () => {
    expect(transicionar('CUSTOMER', 'PRIMEIRO_ENVIO').ok).toBe(false);
    expect(transicionar('CONTACTED', 'ENTRAR_NO_LOTE').ok).toBe(false);
  });
  it('prospecção só no estado certo para cada passo', () => {
    expect(estadoPermiteProspeccao('CONTACT_REVIEW', 0)).toBe(true);
    expect(estadoPermiteProspeccao('CONTACTED', 0)).toBe(false);
    expect(estadoPermiteProspeccao('CONTACTED', 1)).toBe(true);
    expect(estadoPermiteProspeccao('INTERESTED', 1)).toBe(false);
    expect(prospeccaoEncerrada('CUSTOMER')).toBe(true);
  });
});

function elegivel(over: Partial<EntradaElegibilidade> = {}): EntradaElegibilidade {
  return {
    email: 'contato@emporionatural.com.br', fonteEmail: 'site', urlFonte: 'https://emporionatural.com.br/contato',
    compartilhadoPor: 1, empresaAtiva: true, segmentos: ['loja_natural'], evidencias: ['nome contém empório'],
    uf: 'CE', ufsDaOnda: ['RN', 'CE', 'PB', 'PE'], supressao: { premium: false, crm: false },
    passo: 0, jaProspectado: false, canal: { ativo: true, politicaAprovada: true }, ...over,
  };
}

describe('elegibilidade', () => {
  it('caso completo é elegível', () => {
    expect(avaliarElegibilidade(elegivel())).toMatchObject({ ok: true, motivos: [] });
  });
  it('canal desligado ou sem política = não elegível', () => {
    expect(avaliarElegibilidade(elegivel({ canal: { ativo: false, politicaAprovada: true } })).motivos).toContain('canal_desligado');
    expect(avaliarElegibilidade(elegivel({ canal: { ativo: true, politicaAprovada: false } })).motivos).toContain('politica_do_canal_nao_aprovada');
  });
  it('falha na consulta de supressão = não elegível', () => {
    expect(avaliarElegibilidade(elegivel({ supressao: { premium: false, crm: null } })).motivos).toContain('supressao_indisponivel');
  });
  it('recusa e-mail do cadastro CNPJ, compartilhado, nominal e sem origem', () => {
    expect(avaliarElegibilidade(elegivel({ fonteEmail: 'receita' })).motivos).toContain('email_do_cadastro_cnpj');
    expect(avaliarElegibilidade(elegivel({ compartilhadoPor: 3 })).motivos).toContain('email_compartilhado');
    expect(avaliarElegibilidade(elegivel({ email: 'maria.silva@emporio.com.br' })).motivos).toContain('email_de_pessoa');
    expect(avaliarElegibilidade(elegivel({ urlFonte: null })).motivos).toContain('origem_nao_verificavel');
  });
  it('webmail só se a empresa publicou no site ou no Maps', () => {
    expect(avaliarElegibilidade(elegivel({ email: 'emporiodavila@gmail.com', fonteEmail: 'social' })).motivos).toContain('webmail_sem_publicacao_comercial');
    expect(avaliarElegibilidade(elegivel({ email: 'emporiodavila@gmail.com', fonteEmail: 'maps' })).ok).toBe(true);
  });
  it('fora da onda, sem segmento ou sem evidência não entra', () => {
    expect(avaliarElegibilidade(elegivel({ uf: 'SP' })).motivos).toContain('fora_da_onda');
    expect(avaliarElegibilidade(elegivel({ segmentos: [] })).motivos).toContain('fora_do_publico');
    expect(avaliarElegibilidade(elegivel({ evidencias: [] })).motivos).toContain('sem_evidencia_de_compatibilidade');
  });
  it('já prospectado recusa só o primeiro contato', () => {
    expect(avaliarElegibilidade(elegivel({ jaProspectado: true })).motivos).toContain('ja_prospectado');
    expect(avaliarElegibilidade(elegivel({ jaProspectado: true, passo: 1 })).ok).toBe(true);
  });
  it('domínio bloqueado pelo dono nunca recebe', () => {
    expect(avaliarElegibilidade(elegivel({ email: 'contato@salina.com.br' })).motivos).toContain('dominio_bloqueado');
  });
  it('heurísticas de caixa', () => {
    expect(ehInstitucional('compras@x.com.br')).toBe(true);
    expect(pareceNominal('joao.silva@x.com.br')).toBe(true);
    expect(pareceNominal('contato.loja@x.com.br')).toBe(false);
  });
});

describe('árbitro', () => {
  const base = {
    agora: new Date('2026-12-01T13:00:00Z'), limites, ultimoEnvioMarketingEm: null,
    enviosHoje: 0, novasHoje: 0, ehPrimeiroContato: true, enviadasParaEmpresa: 0,
  };
  it('respeita os tetos', () => {
    expect(arbitrar(base).ok).toBe(true);
    expect(arbitrar({ ...base, enviosHoje: 60 })).toMatchObject({ ok: false, codigo: 'teto_diario' });
    expect(arbitrar({ ...base, novasHoje: 20 })).toMatchObject({ ok: false, codigo: 'teto_novas' });
    expect(arbitrar({ ...base, novasHoje: 20, ehPrimeiroContato: false }).ok).toBe(true);
    expect(arbitrar({ ...base, enviadasParaEmpresa: 3 })).toMatchObject({ ok: false, codigo: 'teto_empresa' });
  });
  it('48 h entre mensagens ao mesmo endereço, somando todas as jornadas', () => {
    expect(arbitrar({ ...base, ultimoEnvioMarketingEm: new Date('2026-11-30T14:00:00Z') })).toMatchObject({ ok: false, codigo: 'intervalo_minimo' });
    expect(arbitrar({ ...base, ultimoEnvioMarketingEm: new Date('2026-11-29T12:00:00Z') }).ok).toBe(true);
  });
  it('cadência 0, 4, 10 e para no terceiro', () => {
    const t0 = new Date('2026-12-01T13:00:00Z');
    expect(proximoPassoEm(0, t0, limites)?.toISOString()).toBe('2026-12-05T13:00:00.000Z');
    expect(proximoPassoEm(1, t0, limites)?.toISOString()).toBe('2026-12-07T13:00:00.000Z');
    expect(proximoPassoEm(2, t0, limites)).toBeNull();
  });
});

describe('despacho', () => {
  const agora = new Date('2026-12-01T13:00:00Z');
  const reservaToken = novoToken();
  function entrada(over: Partial<EntradaAutorizacao> = {}): EntradaAutorizacao {
    return {
      agora, modo: 'REVIEW', canal: { ativo: true, politicaAprovada: true },
      mensagem: {
        status: 'RESERVED', reservedBy: 'hermes-vps-1', reservedUntil: new Date(agora.getTime() + 5 * 60_000),
        reservationTokenHash: hashToken(reservaToken), fence: 4, approvedAt: new Date('2026-12-01T11:00:00Z'), step: 0,
      },
      pedido: { executor: 'hermes-vps-1', reservaToken, fence: 4 },
      jornada: { state: 'CONTACT_REVIEW', pausedReason: null },
      segmentosEmpresa: ['loja_natural'], segmentosValidados: [],
      supressao: { premium: false, crm: false }, arbitro: { ok: true }, elegibilidade: { ok: true, motivos: [] },
      ...over,
    };
  }
  it('autoriza o caso completo', () => {
    expect(decidirAutorizacao(entrada())).toEqual({ ok: true });
  });
  it('descadastro, resposta, compra ou pausa depois da reserva impedem o envio', () => {
    expect(decidirAutorizacao(entrada({ supressao: { premium: true, crm: false } }))).toMatchObject({ ok: false, codigo: 'suprimido', cancelar: true });
    expect(decidirAutorizacao(entrada({ jornada: { state: 'INTERESTED', pausedReason: null } }))).toMatchObject({ ok: false, codigo: 'estado_mudou' });
    expect(decidirAutorizacao(entrada({ jornada: { state: 'CUSTOMER', pausedReason: null } }))).toMatchObject({ ok: false, codigo: 'estado_mudou' });
    expect(decidirAutorizacao(entrada({ modo: 'PAUSED' }))).toMatchObject({ ok: false, codigo: 'pausado' });
  });
  it('falha na consulta de supressão nega', () => {
    expect(decidirAutorizacao(entrada({ supressao: { premium: false, crm: null } }))).toMatchObject({ ok: false, http: 503 });
  });
  it('reserva vencida, número de ordem antigo, outro executor ou token errado negam', () => {
    expect(decidirAutorizacao(entrada({ mensagem: { ...entrada().mensagem, reservedUntil: new Date(agora.getTime() - 1) } }))).toMatchObject({ ok: false, codigo: 'reserva_vencida' });
    expect(decidirAutorizacao(entrada({ pedido: { executor: 'hermes-vps-1', reservaToken, fence: 3 } }))).toMatchObject({ ok: false, codigo: 'fence_antigo' });
    expect(decidirAutorizacao(entrada({ pedido: { executor: 'outro', reservaToken, fence: 4 } }))).toMatchObject({ ok: false, codigo: 'outro_executor' });
    expect(decidirAutorizacao(entrada({ pedido: { executor: 'hermes-vps-1', reservaToken: novoToken(), fence: 4 } }))).toMatchObject({ ok: false, codigo: 'token_invalido' });
  });
  it('DRY_RUN nunca despacha; REVIEW exige lote aprovado; semiautônomo só segmento validado', () => {
    expect(modoPermiteDespacho('DRY_RUN', true, ['loja_natural'], ['loja_natural'])).toBe(false);
    expect(modoPermiteDespacho('REVIEW', false, ['loja_natural'], [])).toBe(false);
    expect(modoPermiteDespacho('SEMI_AUTONOMOUS', false, ['loja_natural'], ['loja_natural'])).toBe(true);
    expect(modoPermiteDespacho('SEMI_AUTONOMOUS', false, ['loja_natural', 'granel_cerealista'], ['loja_natural'])).toBe(false);
    expect(decidirAutorizacao(entrada({ mensagem: { ...entrada().mensagem, approvedAt: null } }))).toMatchObject({ ok: false, codigo: 'modo_nao_permite' });
  });
  it('canal desligado nega mesmo com tudo aprovado', () => {
    expect(decidirAutorizacao(entrada({ canal: { ativo: false, politicaAprovada: true } }))).toMatchObject({ ok: false, codigo: 'canal_fechado' });
  });

  const tok = novoToken();
  const res = {
    status: 'DISPATCHING' as const, dispatchTokenHash: hashToken(tok), dispatchExpiresAt: new Date(agora.getTime() + 60_000),
    despachoToken: tok, resultado: 'ACCEPTED' as const, resultadoGravado: null, attempts: 1, maxTentativas: 3, agora,
  };
  it('resultado: aceita, repete sem duplicar e recusa troca', () => {
    expect(decidirResultado(res)).toMatchObject({ tipo: 'aplicar', novoStatus: 'ACCEPTED' });
    expect(decidirResultado({ ...res, resultadoGravado: 'ACCEPTED' })).toEqual({ tipo: 'repeticao' });
    expect(decidirResultado({ ...res, resultadoGravado: 'ACCEPTED', resultado: 'PERMANENT_FAILURE' })).toMatchObject({ tipo: 'conflito', http: 409 });
    expect(decidirResultado({ ...res, despachoToken: novoToken() })).toMatchObject({ tipo: 'negado' });
  });
  it('executor que volta depois do prazo ainda pode informar ACCEPTED de uma tentativa UNKNOWN', () => {
    expect(decidirResultado({ ...res, status: 'UNKNOWN' })).toMatchObject({ tipo: 'aplicar', novoStatus: 'ACCEPTED' });
  });
  it('falha temporária com espera crescente; esgotou vira permanente', () => {
    expect(decidirResultado({ ...res, resultado: 'RETRYABLE_FAILURE', attempts: 1 })).toMatchObject({ novoStatus: 'RETRYABLE_FAILURE', agendarRetentativaEmMs: 5 * 60_000 });
    expect(decidirResultado({ ...res, resultado: 'RETRYABLE_FAILURE', attempts: 3 })).toMatchObject({ novoStatus: 'PERMANENT_FAILURE' });
  });
  it('conciliação: reserva vencida volta; despacho vencido vira desconhecido (sem reenvio)', () => {
    expect(decidirConciliacao('RESERVED', new Date(agora.getTime() - 1), null, agora)).toEqual({ tipo: 'liberar_reserva' });
    expect(decidirConciliacao('DISPATCHING', null, new Date(agora.getTime() - 1), agora)).toEqual({ tipo: 'marcar_desconhecido' });
    expect(decidirConciliacao('UNKNOWN', null, null, agora)).toEqual({ tipo: 'nada' });
    expect(podeSerReservada('UNKNOWN', null, agora)).toBe(false);
    expect(podeSerReservada('RETRYABLE_FAILURE', new Date(agora.getTime() + 1000), agora)).toBe(false);
  });
});

describe('conteúdo', () => {
  it('barra a família semântica vetada', () => {
    for (const t of ['Ajuda na hidratação', 'Mais saudável que o refinado', 'Com +80 minerais', 'Sem aditivos', '100% natural', 'Evita câimbras', 'Reposição mineral para treinos']) {
      expect(verificarTextoComercial(t).ok, t).toBe(false);
    }
  });
  it('deixa passar origem, processo, sabor e textura', () => {
    expect(verificarTextoComercial('Sal marinho integral de Mossoró, secagem por evaporação solar, granulometria média.').ok).toBe(true);
  });
  it('detecta número crítico em texto livre', () => {
    expect(contemValorCritico('Sai por R$ 129,00')).toBe(true);
    expect(contemValorCritico('Chega em 5 dias úteis')).toBe(true);
    expect(contemValorCritico('Posso calcular o frete para o seu CEP.')).toBe(false);
  });
  it('remove dados pessoais antes de ir para a IA', () => {
    expect(removerDadosPessoais('meu cpf 123.456.789-00 e email a@b.com')).toBe('meu cpf [número] e email [e-mail]');
  });
});

describe('mensagem', () => {
  const remetente: SalesRemetente = {
    nome: 'Equipe Comercial Sal Vita', razaoSocial: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00',
    endereco: 'Rua Exemplo, 1, Mossoró/RN', linkSite: 'https://premium.salvitarn.com.br/atacado', linkMercadoLivre: 'https://exemplo/ml',
  };
  const vars = { empresa: 'Empório da Vila', abertura: '', linkDescadastro: 'https://x/u' };
  it('rascunho não gera mensagem', () => {
    expect(montarMensagem(MODELO_EMAIL_RASCUNHO, 0, remetente, vars)).toMatchObject({ ok: false });
  });
  it('modelo aprovado gera texto com identidade e descadastro', () => {
    const r = montarMensagem({ ...MODELO_EMAIL_RASCUNHO, status: 'aprovado' }, 0, remetente, vars);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assunto).toBe('Sal marinho integral de Mossoró para a Empório da Vila');
      expect(r.corpo).toContain('CNPJ 00.000.000/0001-00');
      expect(r.corpo).toContain('https://x/u');
      expect(r.corpo).not.toMatch(/\n{3,}/);
    }
  });
  it('remetente incompleto bloqueia', () => {
    expect(montarMensagem({ ...MODELO_EMAIL_RASCUNHO, status: 'aprovado' }, 0, { ...remetente, cnpj: '' }, vars)).toMatchObject({ ok: false });
  });
  it('Message-ID estável e só com domínio configurado', () => {
    const canal = { ...SALES_SETTINGS_DEFAULTS.canal, dominio: 'vendas.exemplo.com.br' };
    const a = montarMessageId(chaveLogicaProspeccao(7, 0), 'abc', canal);
    expect(a).toMatch(/^<sv\.[0-9a-f]{32}@vendas\.exemplo\.com\.br>$/);
    expect(montarMessageId(chaveLogicaProspeccao(7, 0), 'abc', canal)).toBe(a);
    expect(montarMessageId(chaveLogicaProspeccao(7, 0), 'abc', SALES_SETTINGS_DEFAULTS.canal)).toBeNull();
  });
});

describe('pontuação', () => {
  it('soma com motivos e satura em 100', () => {
    const r = pontuar({ segmentos: ['loja_natural'], evidencias: ['a', 'b'], email: 'contato@x.com.br', fonteEmail: 'site', temSite: true, uf: 'CE', ufsDaOnda: ['CE'] });
    expect(r.score).toBe(30 + 10 + 15 + 10 + 10 + 10);
    expect(r.motivos.length).toBeGreaterThan(3);
    expect(pontuar({ segmentos: [], evidencias: [], email: null, fonteEmail: null, temSite: false, uf: null, ufsDaOnda: [] }).score).toBe(0);
  });
});
