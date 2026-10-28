---
name: supabase
description: Integração nativa com o ecossistema Supabase, incluindo autenticação com JWT, Row Level Security (RLS), Edge Functions, Storage seguro e clientes Supabase JS/SSR.
metadata:
  author: supabase
  version: "1.0.0"
---

# Supabase Integration Skill

Guia de engenharia oficial para integração de serviços Backend-as-a-Service (BaaS) com Supabase. Garante arquitetura segura, uso correto dos SDKs e conformidade com as melhores práticas de nuvem.

## Princípios de Arquitetura Supabase

1. **Autenticação e Sessão (Auth)**:
   - Use o pacote `@supabase/ssr` para ambientes modernos de renderização server-side (Next.js App Router, Remix, Astro, SvelteKit).
   - Armazene tokens de sessão em cookies `HttpOnly`, `SameSite=Lax`, `Secure`.
   - Utilize `supabase.auth.getUser()` no servidor para validação de autenticação em vez de confiar unicamente em `supabase.auth.getSession()` (para checagem criptográfica segura do JWT).

2. **Row Level Security (RLS) - Regra Inviolável**:
   - Toda e qualquer tabela criada no Postgres DEVE ter RLS explicitamente habilitado:
     ```sql
     ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;
     ```
   - Crie políticas granulares para cada operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`):
     ```sql
     CREATE POLICY "Usuários acessam apenas seus próprios dados"
     ON public.minha_tabela
     FOR ALL
     TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
     ```
   - Nunca confie apenas na chave `anon_key` do cliente sem políticas RLS ativas.

3. **Uso dos Clientes (@supabase/supabase-js)**:
   - **Cliente Público (`anon_key`)**: Usado no browser e em rotas públicas. Sempre limitado por RLS.
   - **Cliente Admin (`service_role_key`)**: Usado estritamente em ambientes serverless seguros (APIs backend/cron jobs) para tarefas administrativas. **NUNCA** exponha a `service_role_key` no bundle cliente ou variáveis públicas `VITE_` / `NEXT_PUBLIC_`.

4. **Edge Functions e Storage**:
   - Desenvolva Edge Functions com Deno / TypeScript com tratamento de CORS explícito e verificação de assinatura JWT.
   - Configure Storage Buckets como `public` apenas para assets estáticos não sensíveis. Para documentos privados, utilize buckets restritos com URLs assinadas temporárias (`createSignedUrl`).
