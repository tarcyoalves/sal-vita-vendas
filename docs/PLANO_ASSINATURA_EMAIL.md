# Plano — Assinatura de E-mail por Atendente

> **Status:** 📋 ESPECIFICAÇÃO (não implementar a tela dos atendentes ainda).
> **Para:** sessão futura (modelo Sonnet) executar.
> **Autor do plano:** Opus.
>
> **Objetivo do usuário (admin):** poder cadastrar a assinatura de e-mail de cada
> atendente — idealmente **colar/enviar uma imagem da assinatura** — para que o
> sistema **anexe automaticamente** essa assinatura quando e-mails forem enviados
> (campanhas, sequências e, no futuro, e-mails individuais do atendente).

---

## 0. Regras de execução para o Sonnet

1. **NÃO** criar nada na interface do atendente (`/meu-progresso` etc.) nesta fase.
   Toda a configuração fica **só no painel do admin** por enquanto.
2. Seguir as regras do `CLAUDE.md`: Wouter, tRPC (sem `fetch` direto para rotas próprias),
   Drizzle (sem SQL raw nos routers), não editar `components/ui/*` diretamente, commits em inglês.
3. Banco: adicionar coluna em `schema.ts` **e** o `CREATE TABLE`/`ALTER` correspondente
   em `server/db/migrate.ts` (`ensureTablesExist`) — migração idempotente (`ADD COLUMN IF NOT EXISTS`).
4. Backend de produção é `api/index.ts` (rebundla no build da Vercel).
5. Trabalhar na branch de feature designada; não fazer merge em `main` sem pedido explícito.

---

## 1. Decisão técnica importante: imagem vs. HTML

O usuário pediu para **"colar uma imagem da assinatura"**. Antes de implementar,
o Sonnet precisa entender os trade-offs — porque **assinatura só-imagem é frágil em e-mail**:

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Imagem hospedada** (`<img src="https://...">`) | Fácil de "colar"; visual idêntico ao que o atendente desenhou | Muitos clientes (Gmail, Outlook) **bloqueiam imagens por padrão** → assinatura some; links dentro da imagem **não são clicáveis**; ruim para acessibilidade/spam |
| **Imagem em base64 / data URI** inline | Sem hospedagem externa | ❌ **Gmail remove data URIs** — não renderiza. **Não usar.** |
| **Imagem como anexo + CID** (`cid:...`) | Robusto, Resend suporta `attachments` | Mais complexo; ainda pode ser bloqueado; sem links clicáveis |
| **HTML** (texto estilado, opcionalmente com 1 `<img>` de logo/foto) | Funciona mesmo com imagens bloqueadas; links clicáveis; leve; acessível | Admin precisa de um editor, não só "colar imagem" |

### Recomendação (caminho híbrido)
Armazenar a assinatura como **HTML** (`emailSignatureHtml`). A UI do admin oferece **duas formas** de preencher esse HTML:

- **(A) Enviar imagem** → o sistema faz upload para storage (ver §2.1), gera a URL e
  monta automaticamente `<img src="URL" alt="Assinatura de {nome}" style="max-width:100%">`.
  Atende ao pedido literal ("colar imagem"), mas com aviso na UI: *"Algumas pessoas
  têm imagens bloqueadas no e-mail; recomendamos também uma versão em texto."*
- **(B) Editor de texto simples / HTML** → nome, cargo, telefone, links — renderiza
  mesmo com imagens bloqueadas.

Guardar **um único campo HTML** mantém o ponto de injeção no envio **idêntico** para os
dois casos (a imagem é só um `<img>` dentro do HTML). Isso simplifica muito o backend.

---

## 2. Modelo de dados

### 2.1. Onde guardar a assinatura
Adicionar à tabela **`sellers`** (`server/db/schema.ts`, bloco `sellers`):

```ts
emailSignatureHtml: text('email_signature_html'),      // HTML final injetado no e-mail (pode conter <img>)
emailSignatureImageUrl: text('email_signature_image_url'), // opcional: URL da imagem enviada (origem)
emailSignatureEnabled: boolean('email_signature_enabled').default(true).notNull(),
```

Migração em `server/db/migrate.ts`:
```sql
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email_signature_html TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email_signature_image_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email_signature_enabled BOOLEAN NOT NULL DEFAULT true;
```

### 2.2. Hospedagem da imagem (se usar o caminho A)
Opções, em ordem de preferência **neste projeto** (já está na Vercel):
1. **Vercel Blob** (`@vercel/blob`) — upload server-side, retorna URL pública estável. Mais simples no ecossistema atual.
2. Cloudinary / S3 — se já houver conta.
3. ❌ **Não** usar o WordPress do site (`salvitarn.com.br`) — ele **bloqueia hotlink** (ver `CLAUDE.md`).
4. ❌ **Não** usar base64/data URI (Gmail descarta).

> Decisão de produto pendente para o admin: qual storage usar. O Sonnet deve
> **perguntar** (via AskUserQuestion) ou usar Vercel Blob como padrão se já houver `BLOB_READ_WRITE_TOKEN`.

Limites recomendados no upload: PNG/JPG/WebP, **máx ~200 KB**, largura recomendada ≤ 600px
(largura do corpo do e-mail), validar `content-type`.

---

## 3. Ponto de injeção no envio (backend)

Hoje cada e-mail é montado assim (já existe):

- **Campanhas** — `server/routers/emailMarketing.ts:339-341`:
  ```ts
  subject: renderTemplate(campaign.subject, { nome: r.name ?? '' }),
  html: layout(renderTemplate(campaign.htmlBody, { nome: r.name ?? '', unsubscribe: unsubUrl }), unsubUrl),
  replyTo: r.replyTo ?? undefined,   // r.replyTo = e-mail do atendente (via task.assignedTo → sellerMap)
  ```
- **Sequências** — composição análoga no processador de passos (procurar as outras
  chamadas de `layout(renderTemplate(...))` no mesmo arquivo / no cron de sequências).
- `layout()` está em `server/email/marketing.ts:273` e renda o cartão + rodapé com unsubscribe.

### 3.1. Resolver a assinatura por destinatário
Já existe um `sellerMap` (nome→email) construído por `assignedTo`
(ex.: `emailMarketing.ts:48-49, 227-228, 524-525`). **Estender** para carregar também a assinatura:

```ts
const sellerRows = await db.select({
  name: sellers.name, email: sellers.email,
  sig: sellers.emailSignatureHtml, sigOn: sellers.emailSignatureEnabled,
}).from(sellers);
const signatureMap = new Map(
  sellerRows.filter(s => s.sigOn && s.sig).map(s => [s.name.toLowerCase(), s.sig!])
);
```

E ao montar `AudienceRow` / `BatchMessage`, adicionar `signatureHtml` resolvido por
`t.assignedTo` (mesmo caminho do `replyTo`).

### 3.2. Injetar no HTML
Preferir injetar **dentro do `layout()`**, logo **acima do rodapé** (assim a assinatura
fica entre o corpo e o footer de unsubscribe). Alterar a assinatura da função:

```ts
export function layout(body: string, unsubUrl: string, signatureHtml?: string): string {
  const sigBlock = signatureHtml
    ? `<tr><td style="padding:0 32px 24px;border-top:1px solid #eee;">
         <div style="padding-top:16px;font-size:13px;color:#444;">${signatureHtml}</div>
       </td></tr>`
    : '';
  // ...inserir ${sigBlock} entre a célula do body e a do footer...
}
```

E no call site:
```ts
html: layout(renderTemplate(campaign.htmlBody, {...}), unsubUrl, r.signatureHtml),
```

> ⚠️ **Sanitização:** o HTML da assinatura é input do admin e vai para e-mails.
> Sanitizar no salvamento (remover `<script>`, handlers `on*=`, `javascript:`),
> permitir só tags seguras (`a, img, b, strong, i, em, br, span, div, p, table, tr, td, font`)
> e atributos seguros (`href, src, alt, style, width, height`). Reaproveitar/!criar um helper
> de sanitização no backend (não confiar só no front).

### 3.3. Personalização (tokens) na assinatura
Permitir tokens na assinatura para reaproveitar dados do atendente:
`{atendente_nome}`, `{atendente_telefone}`, `{atendente_email}`, `{atendente_cargo/department}`.
Estender `renderTemplate()` (ou criar `renderSignature()`) para substituir esses tokens
com os dados do `seller` no envio.

---

## 4. UI do admin (FASE 1 — implementar)

Onde: na gestão de atendentes — `client/src/pages/Attendants.tsx` e/ou
`client/src/components/AttendantDetailModal.tsx` (modal de detalhe do atendente).

Adicionar uma seção **"Assinatura de e-mail"** com:
- Toggle **"Anexar assinatura nos e-mails"** (`emailSignatureEnabled`).
- Opção **(A) Enviar imagem da assinatura** → upload → preview → gera o `<img>`.
- Opção **(B) Editor de assinatura** (textarea HTML simples, ou um mini-editor) com tokens disponíveis.
- **Pré-visualização** renderizada (como vai aparecer no e-mail) — importante para o admin conferir.
- Aviso sobre imagens bloqueadas (recomendar versão texto).

Backend tRPC:
- Estender `server/routers/sellers.ts` (mutation de update do seller) para aceitar
  `emailSignatureHtml`, `emailSignatureImageUrl`, `emailSignatureEnabled`.
- Nova mutation/endpoint de **upload de imagem** (se caminho A) → retorna URL do storage.

---

## 5. Cenários de uso por atendente (analisar / suportar)

1. **Atendente com assinatura própria** (nome, cargo, telefone, foto/logo).
   → Cada campanha/sequência usa a assinatura do atendente **dono do lead** (`task.assignedTo`).
2. **Lead sem atendente** (`assignedTo` vazio) → usar uma **assinatura padrão da empresa**
   (config global) ou nenhuma. Definir fallback. Sugestão: campo global `DEFAULT_EMAIL_SIGNATURE`
   ou um "seller virtual" da empresa.
3. **Atendente sem assinatura cadastrada** → não injeta nada (e-mail segue só com rodapé padrão).
4. **Campanha "Ambos/Clientes"** (não vem de tarefa com `assignedTo`): clientes não têm atendente
   → cair no fallback do cenário 2.
5. **Sequência global** disparada para vários leads de atendentes diferentes → cada destinatário
   recebe a assinatura do **seu** atendente (resolução por destinatário, já que `signatureMap` é por nome).
6. **Atendente desligado/inativo** (`status != 'active'`) → decidir: manter assinatura nos e-mails
   já agendados? Sugestão: se o lead foi reatribuído, usa o novo; senão, fallback empresa.
7. **Futuro — e-mail individual 1:1 do atendente** (FASE 2): quando o atendente enviar um e-mail
   manual, usar **a própria** assinatura automaticamente. (Não implementar agora.)
8. **Troca de assinatura no meio de uma sequência** → como a assinatura é resolvida **no envio**
   (não no agendamento), a mudança vale para os próximos passos automaticamente. ✅ (documentar isso).

---

## 6. Casos de borda / riscos

- **Imagens bloqueadas** → sempre incluir `alt` significativo; recomendar versão texto.
- **HTML quebrando o layout do e-mail** → sanitizar + envolver em `<div>` com `max-width:100%` e
  `overflow-wrap`; testar em Gmail, Outlook, Apple Mail, mobile.
- **Dark mode** de clientes de e-mail → evitar texto preto puro sobre fundo transparente;
  usar cores que funcionem nos dois modos.
- **Peso do e-mail** → imagem grande aumenta tamanho e risco de spam; impor limite de KB.
- **Deliverability** → assinatura com muitos links/imagens pode aumentar score de spam;
  manter enxuta. O `text` alternativo (`renderPlainText`) já existe e deve incluir uma versão
  texto da assinatura também (senão a parte texto fica "incompleta").
- **LGPD** → não colocar dados sensíveis de terceiros na assinatura; é dado do próprio atendente.
- **Segurança (XSS no admin/preview)** → ao pré-visualizar no painel, renderizar de forma
  controlada; nunca `dangerouslySetInnerHTML` sem sanitizar.
- **Tokens não preenchidos** → se `{atendente_telefone}` estiver vazio, remover a linha toda,
  não deixar "Tel: " solto.

---

## 7. Plano de execução em fases

### FASE 1 — agora/próxima sessão (admin + backend) ✅ implementar
1. Schema + migração (`emailSignatureHtml`, `emailSignatureImageUrl`, `emailSignatureEnabled`).
2. Sanitização no backend + `renderSignature()` (tokens) + `layout(..., signatureHtml)`.
3. Resolver `signatureMap` por `assignedTo` em **campanhas e sequências**; incluir no `text` alternativo.
4. (Se caminho A) endpoint de upload de imagem (Vercel Blob) — **perguntar storage ao admin**.
5. UI no painel do admin (Attendants / AttendantDetailModal): toggle, upload/editor, preview, aviso.
6. Fallback de assinatura da empresa (cenário 2/4).
7. Testar envio real em sandbox/preview e conferir render em Gmail + mobile.

### FASE 2 — futuro (atendentes) 🚫 NÃO implementar agora
- Tela do atendente para editar a **própria** assinatura (autosserviço).
- E-mail individual 1:1 enviado pelo atendente, com assinatura automática.
- Possível biblioteca de templates de assinatura prontos.

---

## 8. Arquivos que o Sonnet vai tocar (FASE 1)

| Arquivo | Mudança |
|---------|---------|
| `server/db/schema.ts` | +3 colunas em `sellers` |
| `server/db/migrate.ts` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `server/routers/sellers.ts` | aceitar os campos no update; (opcional) endpoint de upload |
| `server/email/marketing.ts` | `layout(..., signatureHtml?)`; `renderSignature()`/tokens; sanitização |
| `server/routers/emailMarketing.ts` | estender `sellerMap`→`signatureMap`; passar `signatureHtml` no `layout()` de campanhas **e** sequências; incluir no `text` |
| `client/src/pages/Attendants.tsx` e/ou `AttendantDetailModal.tsx` | seção "Assinatura de e-mail" (admin) |
| `docs/COTAS-E-LIMITES.md` | nada — mas lembrar: assinaturas com imagem **não** mudam a cota de envio |

> Observação final: a assinatura **não consome cota extra** de e-mail (continua 1 e-mail = 1 envio),
> mas imagens hospedadas geram requisições ao storage quando o destinatário abre — irrelevante para
> cota Resend, relevante só se o storage tiver limite de banda.
