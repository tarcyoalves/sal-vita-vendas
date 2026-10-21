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

/** Placeholder do primeiro nome no texto. */
export const MARCADOR_PRIMEIRO_NOME = '{primeiroNome}';

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

/** ID FIXO da extensão (derivado da chave pública em `key` do manifest; a chave privada não é versionada). */
export const ID_DA_EXTENSAO = 'anlifdaoagpcbdjpbflodkcialbdbghh';

/** Origem enviada pelo Chrome ao CRM; o servidor (shared/extensao.ts) só aceita esta. */
export const ORIGEM_DA_EXTENSAO = `chrome-extension://${ID_DA_EXTENSAO}`;

/** Endereço padrão do CRM Lembretes (configurável na aba Dados). */
export const URL_CRM_PADRAO = 'https://lembretes.salvitarn.com.br';
