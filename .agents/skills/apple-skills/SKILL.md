---
name: apple-skills
description: Coleção especializada em desenvolvimento para o ecossistema Apple (iOS, iPadOS, macOS, watchOS), cobrindo SwiftUI, StoreKit 2, APNs, Widgets, Liquid Glass UI e App Store Optimization (ASO).
metadata:
  author: Prisma-Labs-Dev
  version: "1.0.0"
---

# Apple Skills Collection

Conjunto completo de padrões e diretrizes de desenvolvimento nativo para ecossistemas Apple (iOS, iPadOS, macOS, watchOS e visionOS).

## 1. SwiftUI & Arquitetura Moderna

- **Observation Framework (`@Observable`)**:
  - Prefira a macro `@Observable` em vez de `ObservableObject` / `@Published` para atualizações de UI mais granulares e performáticas.
- **Concorrência Moderna com Swift Concurrency**:
  - Use `async/await`, `Task`, `actors` para proteção de estado mutável e `@MainActor` para interações com a UI.
- **Navegação Declarativa**:
  - Utilize `NavigationStack(path: $path)` com destinos tipados via `.navigationDestination(for:)`.

## 2. Monetização e In-App Purchases com StoreKit 2

Implemente fluxos robustos de assinatura e IAP utilizando a API moderna do StoreKit 2:

```swift
import StoreKit

@MainActor
final class SubscriptionManager: ObservableObject {
    @Published var purchasedProductIDs = Set<String>()

    func updatePurchasedProducts() async {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.revocationDate == nil {
                purchasedProductIDs.insert(transaction.productID)
            }
        }
    }

    func purchase(_ product: Product) async throws {
        let result = try await product.purchase()
        if case .success(let verification) = result {
            let transaction = try checkVerified(verification)
            await transaction.finish()
            await updatePurchasedProducts()
        }
    }
}
```

## 3. Notificações, Widgets e Dynamic Island

- **User Notifications & APNs**:
  - Formate payloads com `apns-push-type`, `mutable-content: 1` para rich notifications (imagens e botões de ação).
- **Dynamic Island & Live Activities (`ActivityKit`)**:
  - Apresente status em tempo real (ex.: status de entrega de pedido, rastreamento de envio) com animações compactas e expandidas.
- **WidgetKit**:
  - Crie widgets interativos com suporte a App Intents (`Button(intent:)`) no iOS 17+.

## 4. Human Interface Guidelines (HIG) & Design Estético

- **Liquid Glass & Materials**:
  - Aplique materiais nativos (`.ultraThinMaterial`, `.regularMaterial`) para backgrounds translúcidos e profundidade.
- **Dynamic Type & Acessibilidade**:
  - Utilize fontes semânticas (`.title`, `.headline`, `.body`) com dimensionamento automático para cumprir requisitos de acessibilidade da Apple.
- **SF Symbols**:
  - Use animações nativas de símbolos SF (`.symbolEffect(.bounce)`, `.symbolEffect(.pulse)`).

## 5. App Store Optimization (ASO)

- **Título & Subtítulo**: Balanceie termos de marca com palavras-chave de alta busca (ex.: `Sal Vita: Sal Marinho Integral`).
- **In-App Events**: Configure eventos sazonais no App Store Connect para reengajar usuários existentes.
- **Custom Product Pages (CPP)**: Crie páginas de produto personalizadas vinculadas a campanhas de marketing específicas.
