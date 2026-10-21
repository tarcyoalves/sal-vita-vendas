// Política de proteção do número (docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 4).
//
// Estes valores são o PISO/TETO de segurança. A configuração do painel só pode deixar a
// política mais conservadora — nunca menos (ver `normalizarConfig` em politica.ts).
// Mudar um valor aqui é decisão do dono, não ajuste de conveniência.

/** Fuso de referência para "hoje", horário permitido e datas da lista de conversas. */
export const FUSO = 'America/Fortaleza';

/** Teto diário de mensagens de campanha (decisão do dono: começa em 30). */
export const TETO_DIARIO_PADRAO = 30;

/** Máximo absoluto: nenhuma configuração passa disso. */
export const TETO_DIARIO_MAXIMO = 60;

/** Máximo absoluto no modo automático (0.4.0: a tela de Ajustes pode subir o teto do automático até aqui). */
export const TETO_AUTO_MAXIMO = 60;

/** Intervalo entre um envio e a abertura do próximo contato, em segundos (ritmo de pessoa). */
export const INTERVALO_MIN_SEG = 60;
export const INTERVALO_MAX_SEG = 120;

/** Não reenviar campanha a quem recebeu há menos de N dias. */
export const DIAS_SEM_REPETIR = 14;

/** Freio: N problemas seguidos pausam a campanha. */
export const PROBLEMAS_SEGUIDOS_PARA_PAUSAR = 3;

/** Variações de texto escritas pelo usuário, além do texto base. */
export const MAX_VARIACOES = 3;

/** Primeira mensagem curta. */
export const TAMANHO_MAX_TEXTO = 500;

// Desde a 0.4.0 os valores abaixo (e os do AUTO) são os PADRÕES do painel "Ajustes" (src/shared/ajustes.ts),
// que é a fonte única lida pela política e pelo executor. Os LIMITES ABSOLUTOS ficam em `LIMITES`
// (ajustes.ts): a tela nunca deixa passar deles.

// ── Modo automático (0.3.0, opcional) ───────────────────────────────────────
// ⚠️ Envio automático pelo WhatsApp Web VIOLA os Termos do WhatsApp e pode bloquear o número de
// forma permanente. Foi decisão escrita do dono, para clientes que já conversam com ele, em
// volume baixo. Estes limites são tetos: nada no painel os afrouxa.

/** Palavra que o usuário digita para ligar o modo automático. */
export const PALAVRA_ACEITE_AUTOMATICO = 'AUTOMATICO';

export const AUTO = {
  /** Teto diário no automático (não configurável acima, mesmo que a política manual permita mais). */
  tetoDiario: 30,
  /** Intervalo aleatório entre envios. */
  intervaloMinSeg: 90,
  intervaloMaxSeg: 180,
  /** Pausa longa aleatória, uma a cada `enviosAtePausaLonga` envios. */
  pausaLongaMinSeg: 600,
  pausaLongaMaxSeg: 1200,
  enviosAtePausaLonga: 10,
  /** Freio: este número de problemas seguidos desliga o automático (o manual usa 3). */
  problemasParaDesligar: 2,
  /** Contagem regressiva visível antes de enviar. */
  contagemSeg: 8,
  /** Depois do clique em enviar, quanto esperar o detector confirmar a mensagem. */
  confirmacaoMs: 20_000,
  /** Validade do token de autorização de um envio. */
  tokenValidadeMs: 30_000,
  /** Depois de pular um contato para revisar (conferência falhou antes de colar), espera isto antes do próximo. */
  pausaAposPuladoMs: 10_000,
  /** Se o usuário está digitando, tenta abrir a conversa de novo depois disto. */
  novaTentativaDigitandoMs: 15_000,
  /** O content script só aceita enviar enquanto o painel renovou o modo há menos que isto. */
  validadeModoMs: 45_000,
} as const;

/** Placeholder do primeiro nome no texto. */
export const MARCADOR_PRIMEIRO_NOME = '{primeiroNome}';

/** Placeholder da saudação por horário (bom dia / boa tarde / boa noite), 0.4.0. */
export const MARCADOR_SAUDACAO = '{saudacao}';

/**
 * Horário permitido (hora local de Fortaleza). `fim` é exclusivo: 18 significa até 17:59.
 * Índice = dia da semana (0 = domingo). `null` = dia sem campanha.
 */
export const HORARIO_PERMITIDO: ReadonlyArray<{ inicio: number; fim: number } | null> = [
  null, // domingo
  { inicio: 8, fim: 18 }, // segunda
  { inicio: 8, fim: 18 },
  { inicio: 8, fim: 18 },
  { inicio: 8, fim: 18 },
  { inicio: 8, fim: 18 }, // sexta
  { inicio: 8, fim: 12 }, // sábado
];
