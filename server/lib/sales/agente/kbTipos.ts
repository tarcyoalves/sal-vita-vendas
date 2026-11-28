// Tipos da base do vendedor virtual sem dependência de banco (importável por regras puras e testes).
export const KB_KINDS = ['produto', 'politica', 'objecao', 'resposta_padrao', 'proibido'] as const;
export type KbKind = (typeof KB_KINDS)[number];
