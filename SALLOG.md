# SALLOG — Prompt de Retomada para IA

## O que é o SalLog

Sistema de gestão logística da Sal Vita para conectar a empresa a motoristas autônomos.
- **Admin Web:** Gerencia motoristas, fretes, mapa GPS, chat, comprovantes, pagamentos
- **App Mobile:** React Native (Expo) para motoristas — marketplace de fretes, GPS, câmera, carteira

---

## Estrutura no repositório

```
/home/user/sal-vita-vendas/
├── sallog/                  ← Projeto Vercel standalone (Root Directory = sallog)
│   ├── api/                 ← Express + tRPC backend
│   │   ├── index.ts         ← Entry point (porta 3001, prod: api/bundle.js)
│   │   ├── auth.ts          ← hashPassword / verifyPassword / signToken / verifyToken
│   │   ├── trpc.ts          ← createContext (cookie + Bearer token)
│   │   ├── db/
│   │   │   ├── schema.ts    ← 7 tabelas Drizzle
│   │   │   ├── migrate.ts   ← ensureTablesExist()
│   │   │   └── index.ts     ← conexão Neon
│   │   └── routers/
│   │       ├── auth.ts      ← login, loginMobile, registerDriver, me, changePassword
│   │       ├── drivers.ts   ← CRUD motoristas, aprovar/rejeitar
│   │       ├── freights.ts  ← CRUD fretes, associar motorista, validar, marcar pago
│   │       ├── freightInterests.ts
│   │       ├── locations.ts ← GPS tracking
│   │       ├── freightChats.ts
│   │       ├── freightDocuments.ts
│   │       └── index.ts
│   ├── admin/               ← Vite + React 19 admin web
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── App.tsx      ← Rotas wouter
│   │       ├── main.tsx
│   │       ├── lib/trpc.ts
│   │       └── pages/
│   │           ├── Login.tsx
│   │           ├── Dashboard.tsx
│   │           ├── Drivers.tsx
│   │           ├── Freights.tsx
│   │           ├── FreightNew.tsx
│   │           └── FreightDetail.tsx  ← mapa Leaflet + chat + comprovantes
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── vercel.json          ← buildCommand + outputDirectory + rewrites
│
└── sallog-app/              ← Expo React Native (motoristas)
    ├── app/
    │   ├── (auth)/login.tsx
    │   ├── (auth)/register.tsx
    │   ├── (tabs)/marketplace.tsx
    │   ├── (tabs)/minhas-viagens.tsx
    │   ├── (tabs)/carteira.tsx
    │   ├── freight/[id].tsx
    │   └── trip/[id].tsx    ← GPS + câmera + chat
    ├── contexts/AuthContext.tsx
    ├── lib/trpc.ts
    └── lib/cloudinary.ts
```

---

## Schema do banco (sallog/api/db/schema.ts)

```
users          → id, name, email, passwordHash, role(admin|driver), createdAt
drivers        → id, userId, cpf, plate, phone, status(pending|approved|rejected)
freights       → id, title, description, cargoType, originCity, originState,
                 destinationCity, destinationState, distance, value, weight,
                 status(available|in_progress|completed|validated|paid),
                 createdBy, assignedDriver, createdAt, updatedAt
freightInterests → id, freightId, driverId, createdAt
driverLocations → id, driverId, freightId, lat, lng, recordedAt
freightChats   → id, freightId, senderId, senderRole, content, createdAt
freightDocuments → id, freightId, driverId, fileUrl, uploadedAt
```

---

## Variáveis de ambiente necessárias (projeto Vercel "sallog")

| Variável | Valor / Descrição |
|----------|-------------------|
| `SALLOG_DATABASE_URL` | Connection string Neon PostgreSQL (pode ser o mesmo banco do lembretes) |
| `SALLOG_JWT_SECRET` | `0f9980016459885bd82218a2d5f969f63efee5001337079bfeceef9b96c45111db9d50fdbf0b8ca55a157e9221b0e403` |
| `SALLOG_SETUP_SECRET` | `cb452a564ec2bea6d1a777cdf2a81e39d0a591105758b24d` |
| `SALLOG_ALLOWED_ORIGINS` | `https://sallog.salvitarn.com.br` |
| `CLOUDINARY_CLOUD_NAME` | *(conta Cloudinary free — criar em cloudinary.com)* |
| `CLOUDINARY_UPLOAD_PRESET` | `sallog_comprovantes` *(unsigned preset)* |

---

## Configuração Vercel (sallog/vercel.json)

```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "admin/dist",
  "functions": { "api/bundle.js": { "memory": 512, "maxDuration": 30 } },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/bundle.js" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`npm run build` executa:
1. `esbuild api/index.ts → api/bundle.js`
2. `vite build admin → admin/dist`

---

## Status do deploy

| Componente | Status | URL |
|-----------|--------|-----|
| Projeto Vercel "sallog" | **PENDENTE — precisa criar** | - |
| Domínio sallog.salvitarn.com.br | **PENDENTE — configurar após criar projeto** | - |
| Banco de dados (tabelas sallog) | **PENDENTE — criado automaticamente no 1º boot** | - |
| Admin web | Código pronto | - |
| App mobile | Código pronto | - |

---

## Como criar o projeto Vercel (AÇÃO NECESSÁRIA DO USUÁRIO)

1. Acessar: **vercel.com → Add New... → Project**
2. Importar repo: `tarcyoalves/sal-vita-vendas`
3. **Root Directory:** `sallog` *(a pasta aparece na lista após o push para main)*
4. Adicionar as 4 variáveis de ambiente da tabela acima
5. Clicar **Deploy**

> **Nota:** A pasta `sallog/` foi adicionada ao branch `main` do GitHub via commit.
> O `SALLOG_DATABASE_URL` pode ser copiado do projeto `sal-vita-vendas` no Vercel
> (Settings → Environment Variables → DATABASE_URL).

---

## Após o deploy: criar usuário admin

```bash
curl -X POST https://<URL-DO-DEPLOY>.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "cb452a564ec2bea6d1a777cdf2a81e39d0a591105758b24d",
    "name": "Tarcyo",
    "email": "tarcyo.alves@gmail.com",
    "password": "SuaSenhaForte123"
  }'
```

Retorno esperado: `{"ok":true,"user":{...}}`
Após isso, o endpoint `/api/setup` fica desativado automaticamente.

---

## Após o deploy: configurar domínio

1. Vercel → projeto sallog → Settings → Domains → adicionar `sallog.salvitarn.com.br`
2. No DNS da Sal Vita: `CNAME sallog → cname.vercel-dns.com`

---

## Fluxo de negócio

```
Admin cria frete (available)
    ↓
Motorista vê no marketplace → clica "Tenho Interesse"
    ↓
Admin vê interessados → associa motorista (in_progress)
    ↓
Motorista viaja → GPS a cada 30s → Admin vê no mapa
    ↓
Motorista tira foto do canhoto → envia pelo app (completed)
    ↓
Admin valida entrega (validated)
    ↓
Admin faz pagamento por fora (PIX/banco) → marca como pago no sistema (paid)
    ↓
Motorista vê na carteira
```

**Importante:** A plataforma NÃO processa pagamentos — só registra que foi pago.

---

## App mobile (sallog-app)

- Stack: Expo SDK 52, React Native, Expo Router, NativeWind
- Testa localmente: `cd sallog-app && npx expo start`
- Gera APK: `cd sallog-app && eas build --platform android --profile preview`
- Precisa configurar em `sallog-app/lib/trpc.ts` a URL da API após deploy

---

## Credenciais relevantes

- **Vercel team:** `tarcyoalves-projects` / team ID: `team_ZHn6TWGLumT9fkcooDeIbHD8`
- **Repositório:** `github.com/tarcyoalves/sal-vita-vendas`
- **Branch de trabalho:** `claude/sallog-deployment-fix-Qkd5b`
- **Deploy automático:** push para `main` → Vercel deploya `sal-vita-vendas` (lembretes)

---

## Próximos passos (por ordem)

- [ ] **1. Criar projeto "sallog" no Vercel** (usuário faz — 5 cliques)
- [ ] **2. Rodar curl de setup** para criar admin Tarcyo
- [ ] **3. Configurar domínio** sallog.salvitarn.com.br
- [ ] **4. Configurar Cloudinary** (conta free + upload preset unsigned)
- [ ] **5. Atualizar URL da API** no sallog-app/lib/trpc.ts
- [ ] **6. Testar o fluxo completo** (criar frete → interesse → associar → GPS → comprovante → pago)
- [ ] **7. Gerar APK** para distribuição aos motoristas
