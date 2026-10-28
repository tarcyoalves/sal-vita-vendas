---
name: security-auditor
description: Execução de auditorias automatizadas de segurança, threat modeling, mitigação de vulnerabilidades OWASP Top 10 e eliminação de falsos positivos com validação rigorosa.
metadata:
  author: cloudflare
  version: "1.0.0"
---

# Security Auditor Skill

Framework de auditoria contínua de segurança de software para agentes de codificação. Foca na identificação de vulnerabilidades reais e exploráveis com baixo ruído e validação adversarial.

## Pipeline de Auditoria em 6 Fases

1. **Reconhecimento (Reconnaissance)**:
   - Mapeamento de superfície de ataque: endpoints HTTP/API, rotas públicas vs autenticadas, webhooks, uploads de arquivo, cron jobs e workers em background.
   - Identificação de pontos de entrada de dados não confiáveis (`req.body`, `req.query`, `headers`, cookies).

2. **Modelagem de Ameaças e Caça (Threat Hunting)**:
   - **Autenticação & Sessão**: Validação de JWT, HttpOnly/Secure cookies, expiração, rotação de tokens.
   - **Controle de Acesso & Autorização**: Broken Object Level Authorization (BOLA/IDOR), bypass de RBAC, Row Level Security (RLS) ausente ou mal formulado.
   - **Injeções & Sanitização**: SQL Injection (raw queries vs parameterized/ORM), XSS (dangerouslySetInnerHTML, HTML injection), SSRF em fetches externos.
   - **Lógica de Negócios & Concorrência**: Race conditions em mutações de saldo/estoque/cupons, verificação de idempotência em pagamentos, fail-open vs fail-closed.
   - **Segredos & Dependências**: Chaves de API vazadas, variáveis de ambiente sensíveis no bundle cliente, CVEs críticas em pacotes npm.

3. **Validação & Redução de Falsos Positivos**:
   - Para cada vulnerabilidade potencial, construa um cenário de ataque com passos de reprodução (Proof of Concept - PoC).
   - Rejeite achados teóricos que sejam protegidos por camadas de rede superiores ou restrições de tipagem.

4. **Verificação Adversarial Cruzada**:
   - Assuma a postura do atacante para confirmar se a barreira de defesa pode ser contornada por encoding, métodos alternativos ou variações de payload.

5. **Relatório Estruturado com Severidade**:
   - Classificação: **Crítica**, **Alta**, **Média**, **Baixa**, **Informativa**.
   - Descrição do impacto real no negócio.
   - Código vulnerável vs Correção recomendada (Diff).

6. **Implementação de Remediações Seguras**:
   - Aplique o princípio de privilégio mínimo e defesa em profundidade.
   - Implemente validação em tempo de execução com schemas rígidos (ex.: Zod).
   - Configure cabeçalhos de segurança HTTP (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
