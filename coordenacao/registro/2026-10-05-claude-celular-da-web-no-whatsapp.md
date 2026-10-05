# Buscador: telefones achados na web viram opção de WhatsApp/Ligar

- **Quem:** Claude (sessão claude/magical-fermi-wrdxjy) · **Quando:** 2026-10-05
- `client/src/components/radar/phoneOptions.ts`: `buildPhoneOptions` inclui
  `enrichment.data.telefones` (Maps, site...) depois dos WhatsApps confirmados e
  antes da Receita; campo `daWeb`; `isProvavelCelular`; `phoneKindLabel`
  ("celular (Google Maps) · WhatsApp não confirmado" / "fixo (Google Maps)").
  Número da web igual ao da Receita herda o aviso de contabilidade.
- Padrão: WhatsApp confirmado > celular não compartilhado (web antes da
  Receita) > fixo > compartilhado.
- `LeadCard.tsx`: rótulo no seletor + aviso "pode não ter WhatsApp" quando o
  número escolhido é celular da web. `CreateTaskDialog.tsx`: mesmo rótulo.
- Testes: `tests/radar-lead-card.test.ts` (+3). Gates: check ok, 414 testes.
