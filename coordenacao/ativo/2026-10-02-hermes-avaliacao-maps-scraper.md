# Avaliação Comparativa: gosom/google-maps-scraper vs Enriquecedor Maps Atual

- **Agente:** hermes
- **Início:** 2026-10-02 21:00 BRT
- **Fim:** 
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Avaliar o motor `gosom/google-maps-scraper` (v1.18.1) em comparação com a fonte atual de maps (`scripts/radar/enricher/sources/maps.py`) em uma amostra de ~30 empresas já enriquecidas do Radar.
A avaliação é estritamente de teste e isolada:
- Execução isolada em pasta temporária local fora do repositório (`/home/ubuntu/.hermes/cache/scratch/maps-eval/`).
- Imagem Docker pinada em `gosom/google-maps-scraper:v1.18.1`, `DISABLE_TELEMETRY=1`, porta em `127.0.0.1`, sem proxies.
- Zero escrita em `radar_enrichment` ou no banco do CRM.
- Sem alterações em código de produção ou settings do kit.

## Arquivos e áreas que vou tocar

- `coordenacao/ativo/2026-10-02-hermes-avaliacao-maps-scraper.md`
- Pasta local isolada: `/home/ubuntu/.hermes/cache/scratch/maps-eval/`

**Não vou tocar em:**
- Banco de dados (`radar_enrichment`, CRM, Neon)
- Arquivos de código de produção (`scripts/radar/`, `server/`, `client/`)
- SMBI ou qualquer serviço operacional

## Progresso

- [x] Reivindicar tarefa em `coordenacao/ativo/`
- [ ] Checar recursos da VPS (Docker, CPU, RAM)
- [ ] Obter amostra de 30 empresas já enriquecidas do Radar (somente leitura)
- [ ] Configurar e rodar avaliação isolada do scraper
- [ ] Comparar resultados (taxa de acerto, telefones, WhatsApp, balcão vs escritório)
- [ ] Medir consumo de CPU/RAM
- [ ] Mover reivindicação para `coordenacao/registro/` e documentar
