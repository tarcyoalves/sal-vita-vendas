# PROMPT DE TRANSIÇÃO: SAL VITA VENDAS

Olá, Claude! Você está assumindo o desenvolvimento do projeto **Sal Vita Vendas**, um dashboard de vendas inteligente com integração de IA.

## 1. Visão Geral do Projeto
- **Objetivo:** Dashboard para gestão de vendas, chat inteligente e análise de dados.
- **Stack Técnica:**
  - **Frontend:** React (Vite) + Tailwind CSS v3.4 + Lucide Icons.
  - **Backend/API:** tRPC (Type-safe APIs).
  - **Banco de Dados:** PostgreSQL (Neon DB).
  - **IA:** Groq (Llama 3) e Google Gemini (Análise de dados).
  - **Deploy Atual:** Render.com (URL: https://sal-vita-vendas.onrender.com).

## 2. Estado Atual do Desenvolvimento
- O projeto foi migrado da Vercel para o Render devido a erros de build.
- **Correções Realizadas:**
  - Ajuste de caminhos de importação relativos em componentes UI e páginas.
  - Downgrade de diretivas Tailwind v4 para v3.4 para compatibilidade com o ambiente de build.
  - Correção de sintaxe no hook de autenticação (`useAuth.ts`).
- **Funcionalidades Implementadas:**
  - Estrutura base de rotas (Home, Admin, Chat, Dashboard).
  - Integração inicial com Neon DB.
  - Componentes de UI (Shadcn/ui style).

## 3. O Que Precisa Ser Feito (Próximos Passos)
- [ ] Finalizar a lógica de autenticação (Login/Logout).
- [ ] Implementar os gráficos reais no Dashboard usando dados do Neon DB.
- [ ] Refinar o Chat de IA para usar as chaves da Groq/Gemini configuradas.
- [ ] Melhorar a responsividade do layout mobile.

## 4. Instruções Técnicas Importantes
- **Estrutura de Pastas:** O projeto usa uma estrutura de monorepo simplificada. O código do cliente está em `/client`.
- **Importações:** Sempre verifique os caminhos relativos. Use `../` ou `../../` conforme a profundidade do arquivo.
- **Tailwind:** Não use `@theme` ou `@apply border-border`. Use cores padrão do Tailwind ou variáveis CSS definidas no `index.css`.

## 5. Credenciais
As credenciais necessárias (DATABASE_URL, GROQ_API_KEY, GEMINI_API_KEY) estão no arquivo `CREDENCIAIS.txt` anexo.

---
**Claude, por favor, analise o código no ZIP e continue a implementação seguindo o padrão de design e a stack técnica definida.**
