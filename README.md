# 🧂 Sal Vita - Sistema de Gestão de Vendas

Sistema web elegante para gerenciamento de ligações e performance de equipes de vendas.

## 🚀 Quick Start

### 1. Clonar e Instalar
```bash
git clone https://github.com/seu-usuario/sal-vita-vendas.git
cd sal-vita-vendas
npm install
```

### 2. Configurar Banco de Dados
```bash
# Criar arquivo .env
cp .env.example .env

# Adicionar CONNECTION STRING do Neon em DATABASE_URL
# Adicionar NEXTAUTH_SECRET (gerar com: openssl rand -base64 32)
```

### 3. Executar Migrations
```bash
npx prisma migrate dev --name init
```

### 4. Seed do Banco (opcional)
```bash
npx prisma db seed
```

### 5. Rodar Localmente
```bash
npm run dev
```

Acesse: http://localhost:3000

## 📊 Credenciais de Teste

- **Email:** comercial@salvitarn.com.br
- **Senha:** SalVita2024!

## 🏗️ Arquitetura

- **Frontend:** Next.js 14 + React 18 + Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL com Prisma ORM
- **Auth:** NextAuth.js

## 📁 Estrutura

```
app/
├── layout.tsx
├── page.tsx
├── globals.css
├── login/
├── signup/
├── dashboard/
├── api/
│   ├── auth/
│   ├── sellers/
│   ├── reminders/
│   └── metrics/
prisma/
├── schema.prisma
└── migrations/
```

## 🔐 Variáveis de Ambiente

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=sua-secret-key
NEXTAUTH_URL=http://localhost:3000
```

## 📝 Licença

MIT
