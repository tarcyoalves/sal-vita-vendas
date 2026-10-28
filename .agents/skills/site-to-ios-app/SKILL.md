---
name: site-to-ios-app
description: Converte websites, PWAs e dashboards em apps iOS nativos com compliance estrito ao App Store Review Guideline 4.2, suporte a Capacitor/SwiftUI Shell e estratégia de submissão na App Store.
metadata:
  author: jasoncolapietro
  version: "1.0.0"
---

# Site to iOS App Skill

Guia definitivo de engenharia para conversão de aplicações web (React, Next.js, Vite, PWAs, Dashboards) em aplicativos iOS nativos de alta performance, aprováveis na Apple App Store.

## 1. Arquitetura de Conversão

Escolha a abordagem adequada com base nos requisitos do projeto:

1. **Capacitor Bridge (@capacitor/ios)**:
   - Melhor equilíbrio entre velocidade de entrega e acesso a plugins nativos.
   - Permite empacotar o build do client (`dist`/`build`) ou carregar URLs remotas com fallback offline.
2. **SwiftUI WKWebView Shell com Native Islands**:
   - Casca nativa em Swift utilizando `WKWebView` customizado com handlers de JavaScript bidirecionais (`WKScriptMessageHandler`).
   - Componentes nativos sobrepostos (Navigation Bar, TabBar, Action Sheets, Modais de Checkout/Apple Pay).

## 2. Aprovação na App Store — Como passar no Guideline 4.2 (Minimum Functionality)

A Apple rejeita apps que são "apenas um website empacotado". Para garantir aprovação garantida:

- **Hardware & Capacidades Nativas Reais**:
  - **Biometria**: Login rápido via Face ID / Touch ID (`LocalAuthentication`).
  - **Push Notifications**: Integração com APNs e `UNUserNotificationCenter` com prompts contextuais de permissão.
  - **Feedback Tátil**: Haptic feedback com `UIImpactFeedbackGenerator` em botões principais, conclusões de compra e erros.
  - **Compartilhamento Nativo**: Uso de `UIActivityViewController` para links, recibos e relatórios.
  - **Apple Pay**: Suporte nativo via PassKit para transações no iOS.
  - **Modo Offline & Cache**: Tela dedicada para ausência de conexão, suporte a cache de dados críticos e Service Workers ativos.
  - **Safe Area Insets**: Respeito à Dynamic Island, Notch e barra inferior (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).

## 3. Preparação de Metadados e Submissão na App Store

1. **Screenshots Obrigatórios**:
   - iPhone 6.7" Display (1290 x 2796 px)
   - iPhone 6.5" Display (1242 x 2688 px)
   - iPad Pro 12.9" (se configurado como universal)
2. **Metadados Textuais**:
   - **Nome do App**: Até 30 caracteres.
   - **Subtítulo**: Até 30 caracteres destacando o benefício principal.
   - **Keywords**: 100 caracteres separados por vírgula (sem espaços extras para economizar caracteres).
   - **Descrição**: Parágrafos claros com bullet points dos principais recursos.
   - **URLs**: URL de Suporte e URL da Política de Privacidade (obrigatória).
3. **App Privacy (Nutrition Labels)**:
   - Declare com precisão os dados coletados (Identificadores, Dados de Uso, Informações Financeiras, Contato) e suas finalidades (Analytics, Funcionalidade do App).
4. **App Review Notes**:
   - Forneça uma conta de teste ativa (usuário e senha) no campo "Sign-in required".
   - Explique quaisquer fluxos específicos ou permissões solicitadas pelo app.
