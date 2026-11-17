// Isola os testes das variáveis de IA do ambiente real. No build da Vercel elas existem
// (ANTIGRAVITY02_*, GROQ_API_KEY...) e vazavam para testes que leem process.env, mudando
// o provedor escolhido. Cada teste que precisa de uma delas define a sua explicitamente.
const PREFIXOS = ['ANTIGRAVITY', 'GROQ_', 'CEREBRAS_', 'OPENROUTER_', 'NVIDIA_', 'OPENAI_', 'ANTHROPIC_'];
for (const k of Object.keys(process.env)) {
  if (PREFIXOS.some((p) => k.startsWith(p))) delete process.env[k];
}
