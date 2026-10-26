# Vita Zap v0.7.26: novos atalhos de lembrete, tags CRM, pausa na varredura, busca limpa de lead e correções da prévia/envio

- **Agente:** hermes
- **Início:** 2026-10-26 14:41 BRT
- **Fim:** 2026-10-26 15:55 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Implementar melhorias e correções solicitadas no Vita Zap v0.7.26:
1. Correção do envio automático que travava em conversas com anexos/mídias (ex: Victor Luan).
2. Novos atalhos de reagendamento de lembrete: 30 dias, 45 dias e 60 dias.
3. Seleção de tags conforme catálogo do CRM na faixa do lead.
4. Opção de pausar a varredura e salvar o progresso até o momento.
5. Correção na prévia de campanhas: preservar termo de busca ("CLIENTE") e rotinas automáticas trazendo contatos corretamente.
6. Abertura inteligente de lembretes do CRM: busca por telefone primeiro e termos limpos (removendo CNPJ, LTDA, estado) em vez do título corporativo literal.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/`
- `coordenacao/`
- `ESTADO-DO-PROJETO.md`

## Progresso

- [x] Criar claim de coordenação e publicar
- [x] Corrigir classificarConversa para não barrar envio automático com anexos/mídias sem plain text author
- [x] Implementar atalhos 30d, 45d, 60d no reagendamento de lembretes
- [x] Integrar seleção e remoção de tags do catálogo CRM na faixa do lead
- [x] Implementar controle de pausa na varredura salvando contatos processados
- [x] Corrigir preservação do filtro de termo/nome em rotinas e campanhas na prévia
- [x] Ajustar rotinas (ex: 30d+) para considerar contatos elegíveis corretamente (soComMensagemMinha = false) e incluir contatos a revisar desmarcados
- [x] Extração de termos limpos do lead (`extrairTermosLead`) para busca no WhatsApp sem falhar em CNPJs
- [x] Testes automatizados cobrindo as novas regras (51 arquivos, 723 testes passando)
- [x] Testes e build (npm test, tsc, npm run build, npm run publicar)
- [x] Sincronizar pastas locais do Chrome
- [x] Mover claim para registro e atualizar ESTADO-DO-PROJETO.md
- [x] Commit e push origin main
