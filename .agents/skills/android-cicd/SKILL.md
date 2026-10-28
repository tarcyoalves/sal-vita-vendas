---
name: android-cicd
description: Pipeline automatizado de CI/CD para Android e Google Play Console via GitHub Actions, com suporte a React Native, Expo, Flutter, TWA e Gradle nativo.
metadata:
  author: davila7
  version: "1.0.0"
---

# Android CI/CD Skill

Pipeline automatizado e seguro para compilação, assinatura criptográfica e distribuição de aplicativos Android (.apk / .aab) no Google Play Console utilizando GitHub Actions e Fastlane.

## 1. Estrutura de Segredos e Variáveis no Repositório

Configure os seguintes segredos no GitHub Actions (`Settings -> Secrets and variables -> Actions`):

- `ANDROID_KEYSTORE_BASE64`: Arquivo de keystore (.jks/.keystore) codificado em base64 (`base64 -w 0 release.keystore`).
- `KEYSTORE_PASSWORD`: Senha de proteção da keystore.
- `KEY_ALIAS`: Alias da chave de assinatura.
- `KEY_PASSWORD`: Senha da chave de assinatura.
- `PLAY_SERVICE_ACCOUNT_JSON`: Credencial JSON da conta de serviço do Google Cloud com acesso à Google Play Developer API.

## 2. Configuração do Workflow GitHub Actions (`.github/workflows/android-release.yml`)

```yaml
name: Android Release Pipeline

on:
  push:
    tags:
      - 'android-v*'
  workflow_dispatch:
    inputs:
      track:
        description: 'Google Play Track (internal, alpha, beta, production)'
        required: true
        default: 'internal'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
          cache: 'gradle'

      - name: Set up Node.js (para React Native / Expo)
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Decode Android Keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > android/app/release.keystore

      - name: Build Android App Bundle (AAB)
        run: |
          cd android
          ./gradlew bundleRelease \
            -PMYAPP_UPLOAD_STORE_FILE=release.keystore \
            -PMYAPP_UPLOAD_KEY_ALIAS=${{ secrets.KEY_ALIAS }} \
            -PMYAPP_UPLOAD_STORE_PASSWORD=${{ secrets.KEYSTORE_PASSWORD }} \
            -PMYAPP_UPLOAD_KEY_PASSWORD=${{ secrets.KEY_PASSWORD }}

      - name: Deploy to Google Play Console
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: br.com.salvitarn.app
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: ${{ github.event.inputs.track || 'internal' }}
          status: 'completed'
          whatsNewDirectory: android/whatsnew/
```

## 3. Gestão de Esteiras (Tracks) e Rollout Progressivo

1. **Internal Testing**:
   - Para validação imediata da equipe interna e QA (sem tempo de espera por revisão do Google).
2. **Closed Testing (Alfa / Beta)**:
   - Para grupos de testadores convidados via lista de e-mails ou grupo do Google.
3. **Production Rollout Gradual (Staged Rollout)**:
   - Para deploys seguros em produção, aumente a porcentagem de usuários progressivamente:
     - Dia 1: 10%
     - Dia 2: 25%
     - Dia 3: 50%
     - Dia 4: 100%
   - Monitore o Android Vitals (taxa de ANR e Crash rate) antes de expandir o rollout.
