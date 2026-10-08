# Instalar a ferramenta multi-item do robô CRM → SMBI

Arquivo: `scripts/smbi-robo/smbi_criar_pedido_express.multi_item.mjs`
SHA-256: `9c11eca833491a36d3559c5c00e2778ae77298fc5b491321d185a41acbb75a9a`

Substitui `/home/ubuntu/.openclaw/workspace/tools/smbi_criar_pedido_express.mjs` (hoje mono-item, root:root 0644).
O daemon já monta o array `itens` e só libera a criação múltipla quando a ferramenta instalada contém
`SUPORTA_MULTI_ITEM = true` — este arquivo contém.

## O que mudou em relação ao candidato do Hermes
- Regex de data da anti-duplicidade corrigida (devolvia 0): `parseDataBR`, testada com `08/10/2026 11:00`.
- Todos os itens validados ANTES da primeira escrita (código, quantidade, preço, limites, produto repetido, máx. 6).
- Cada linha gravada é conferida por CÓDIGO exato (descrição exata só se a tela não traz código), com quantidade,
  valor unitário e subtotal; nunca por substring.
- Depois de salvar, os itens reais são relidos da tela do pedido e conferidos (e a soma dos subtotais bate com o total).
- Falha depois da 1ª escrita → `FALHA_PEDIDO_INCOMPLETO: movsai X` (sem retry); `SALVO_COM_DIVERGENCIA` nunca é reembrulhada.
- `loginTester` carregado sob demanda (helpers puros testáveis); sem lock próprio (o mutex é do wrapper oficial).
- Preservado: pesos unitários, "C. pag. frete motorista" intocado, frete motorista provisório, comissão do cadastro,
  anti-duplicidade, só cria pedido novo.

## Instalação (feita pelo Tarcyo, conta admin; o Hermes não escreve em tools/)
1. Copiar o arquivo do repositório para um local temporário e conferir o hash: `sha256sum <arquivo>` = o de cima.
2. `node --check <arquivo>`.
3. Backup com data: `sudo cp -p /home/ubuntu/.openclaw/workspace/tools/smbi_criar_pedido_express.mjs /home/ubuntu/.openclaw/workspace/tools/smbi_criar_pedido_express.mjs.bak-$(date +%Y%m%d%H%M)`.
4. `sudo install -o root -g root -m 0644 <arquivo> /home/ubuntu/.openclaw/workspace/tools/smbi_criar_pedido_express.mjs`.
5. Conferir: `grep -c "SUPORTA_MULTI_ITEM = true" <destino>` = 1 e `node --check <destino>`.
6. NÃO reiniciar nem ligar nada ainda: pedir ao Hermes a conferência de contrato (`--dry-run` do pedido `2d7z7ng22ub5`,
   que não grava nada) e a busca anti-duplicidade no ERP.
7. Piloto real (1 pedido): só com o OK do Tarcyo, com o robô ligado só durante o piloto, e depois desligado.

## Antes do piloto (checklist)
- Fila exata conferida (nada além do pedido do piloto).
- Cliente cadastrado no SMBI e sem pedido igual nas últimas horas.
- Itens do pedido no CRM: 51 × 1.920 a R$ 12,00 e 55 × 80 a R$ 15,00.
