# Vita Zap v0.7.26: novos atalhos de lembrete, tags CRM, pausa na varredura e correções da prévia

- **Agente:** hermes
- **Início:** 2026-10-26 14:41 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Implementar melhorias solicitadas no Vita Zap v0.7.26:
1. Novos atalhos de reagendamento de lembrete: 30 dias, 45 dias e 60 dias.
2. Seleção de tags conforme CRM na faixa do lead.
3. Opção de pausar/retomar a varredura.
4. Correção na montagem de campanha e rotinas para não limpar/ignorar termo de busca (ex: CLIENTE).
5. Correção do filtro 30d+ na prévia que puxava poucos contatos.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/`
- `coordenacao/`
- `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** Loja Premium, backend do CRM, banco de dados, arquivos fora de `extensoes/vita-zap/`.

## Progresso

- [ ] Criar claim de coordenação e publicar
- [ ] Implementar atalhos 30d, 45d, 60d no reagendamento
- [ ] Integrar seleção de tags do CRM
- [ ] Implementar controle de pausa/retomada na varredura
- [ ] Corrigir preservação do filtro de termo/nome em rotinas e campanhas na prévia
- [ ] Ajustar rotina 30d+ para considerar contatos elegíveis corretamente
- [ ] Testes automatizados cobrindo as novas regras
- [ ] Testes e build (npm test, tsc, npm run build, npm run publicar)
- [ ] Sincronizar pastas locais do Chrome
- [ ] Mover claim para registro e atualizar ESTADO-DO-PROJETO.md
- [ ] Commit e push origin main
