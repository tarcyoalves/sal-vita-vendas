---
name: mobile-react-native
description: Engenharia especializada de desenvolvimento cross-platform React Native e Expo para iOS e Android, com otimização de performance via Hermes, New Architecture, navegação e integração nativa.
metadata:
  author: ruvnet
  version: "1.0.0"
---

# Mobile Development (React Native & Expo) Skill

Agente especializado no desenvolvimento de aplicativos móveis multiplataforma de alta performance para iOS e Android com React Native, Expo, Hermes engine e New Architecture.

## 1. Arquitetura e Configuração de Alto Desempenho

- **Motor JS & Arquitetura**:
  - Habilite **Hermes** por padrão para tempo de inicialização (TTI) reduzido e menor consumo de memória.
  - Adote a **New Architecture** (Fabric Renderer + TurboModules) para pontes nativas síncronas e renderização sem gargalos.
- **Estrutura de Pastas e Componentes**:
  - `app/` ou `src/navigation/` (rotas e layouts)
  - `src/components/` (componentes atômicos e blocos compostos com TypeScript estrito)
  - `src/hooks/` (lógica de negócios e gerenciamento de ciclo de vida)
  - `src/services/` (clientes de API, tRPC/REST e persistência segura)

## 2. Padrões de Interface e Listas de Alto Desempenho

- **Renderização de Listas Longas**:
  - Prefira `@shopify/flash-list` em vez de `FlatList` padrão para listas com rolagem pesada (60fps garantidos com reciclagem de views).
  - Sempre forneça `estimatedItemSize` e utilize `keyExtractor` com IDs únicos estáveis.
- **Layout Responsivo e Safe Area**:
  - Use `react-native-safe-area-context` para proteger a interface contra recortes de notch, home indicator e dynamic island.
  - Utilize `KeyboardAvoidingView` ou `react-native-keyboard-controller` para formulários fluidos sem sobreposição de teclado.

## 3. Navegação e Deep Linking

- **Expo Router / React Navigation**:
  - Configure rotas tipadas com parâmetros estritos via TypeScript.
  - Estruture Universal Links (iOS `apple-app-site-association`) e Android App Links (`assetlinks.json`) para abertura direta no app a partir da web.

## 4. Segurança e Persistência de Dados

- **Armazenamento Seguro de Tokens**:
  - **NUNCA** salve tokens JWT ou senhas em `AsyncStorage` puro (não criptografado).
  - Utilize `expo-secure-store` ou `react-native-keychain` com biometria opcional.
- **Cache de Rede e Sincronização Offline**:
  - Use TanStack Query (React Query) com persistência via AsyncStorage/MMKV para experiência offline instantânea.
