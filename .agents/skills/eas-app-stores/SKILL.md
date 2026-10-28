---
name: eas-app-stores
description: Deploy automatizado para iOS App Store, Google Play Store e TestFlight via Expo Application Services (EAS), configuração de eas.json com perfis de build, versionamento de build numbers e CI/CD.
metadata:
  author: expo
  version: "1.0.0"
---

# EAS App Store Deployment Skill (Expo)

Especialista em automação de compilação, assinatura e publicação de aplicativos móveis (iOS e Android) através do ecossistema Expo Application Services (EAS).

## 1. Configuração do `eas.json`

Estruture os perfis de build com separação clara de ambientes:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production"
      },
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "simulator": false
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "SEU_APPLE_ID@exemplo.com",
        "ascApiKeyPath": "./credentials/AuthKey_ASC.p8",
        "ascApiKeyId": "SEU_KEY_ID",
        "ascApiIssuerId": "SEU_ISSUER_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./credentials/play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

## 2. Comandos de Build & Submit

- **Build e Submissão Direta (iOS - TestFlight / App Store)**:
  ```bash
  npx eas-cli@latest build -p ios --profile production --submit
  ```
- **Build e Submissão Direta (Android - Google Play Internal Track)**:
  ```bash
  npx eas-cli@latest build -p android --profile production --submit
  ```
- **Build para ambas as plataformas simultaneamente**:
  ```bash
  npx eas-cli@latest build --platform all --profile production --auto-submit
  ```
- **Build de Teste Local / Simulador**:
  ```bash
  npx eas-cli@latest build -p ios --profile development --local
  ```

## 3. Gerenciamento de Versionamento e Credenciais

1. **Versionamento Automático**:
   - Utilize `"appVersionSource": "remote"` no `eas.json` para delegar o incremento do `versionCode` (Android) e `buildNumber` (iOS) aos servidores EAS.
   - Atualize `version` semântica (`x.y.z`) em `app.json` / `app.config.ts` para cada release pública.

2. **Credenciais**:
   - **iOS**: Gere ou sincronize certificados de distribuição e perfis de provisionamento automaticamente com `npx eas-cli credentials`.
   - **Android**: Use a keystore gerenciada pelo EAS ou importe sua keystore corporativa existente.

## 4. Integração CI/CD (GitHub Actions)

Exemplo de workflow automatizado para release:

```yaml
name: EAS Production Deploy
on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npx eas-cli build --platform all --profile production --auto-submit --non-interactive
```
