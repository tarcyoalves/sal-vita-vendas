// Meu nome no WhatsApp: o autor (data-pre-plain-text) das mensagens que EU mandei.
//
// O WhatsApp de 20/10/2026 não marca a direção da mensagem com classe; só o ícone de status
// (✓, ✓✓…) mostra que é minha. Saber meu nome deixa separar "eu" do "outro lado" da conversa.
// Estado só em memória: o painel guarda o nome no IndexedDB ("meuNomeWhatsApp") e o reenvia a
// cada abertura de conversa; recarregar a aba o apaga e ele é aprendido de novo.

let meuNome: string | null = null;

function limpo(nome: string | null | undefined): string | null {
  const n = (nome ?? '').replace(/\s+/g, ' ').trim();
  return n === '' ? null : n;
}

export function meuNomeAtual(): string | null {
  return meuNome;
}

/** O painel (ou o usuário, na aba Dados) define o nome; vale mais que o aprendido. */
export function definirMeuNome(nome: string | null | undefined): void {
  meuNome = limpo(nome);
}

/** Aprende o nome só se ainda não houver um. */
export function aprenderMeuNome(nome: string | null | undefined): void {
  if (meuNome === null) meuNome = limpo(nome);
}
