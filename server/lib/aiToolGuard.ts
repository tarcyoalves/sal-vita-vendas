// O LLM pode devolver qualquer nome de ferramenta; só executamos as que foram
// oferecidas a ele para o papel do chamador (TOOLS para admin, ATTENDANT_TOOLS para atendente).
export function isToolAllowed(name: unknown, offered: { function?: { name?: string } }[]): boolean {
  return typeof name === 'string' && offered.some(t => t.function?.name === name);
}
