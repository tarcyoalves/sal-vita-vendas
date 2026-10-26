// CSS da UI injetada (dentro do Shadow DOM). Verde do WhatsApp, abas com sublinhado, chips
// arredondados; tema claro e escuro conforme o WhatsApp (atributo data-tema no host).

export const ESTILO = `
:host { all: initial; display: block; font-family: inherit; font-size: 13px; line-height: 1.35; color: #111b21;
  --verde: #00a884; --texto: #111b21; --suave: #667781; --fundo: #ffffff; --fundo2: #f0f2f5; --borda: #e9edef; --hover: #f5f6f6;
  --texto-aba: #3b4a54; --chip-borda: #d1d7db; --chip-ativo-fundo: #d9fdd3; --chip-ativo-texto: #0a6c46;
  --perigo: #d93025; --aviso: #8a5a00; --aviso-fundo: #fff4d6; --sombra: 0 2px 10px rgba(11,20,26,.25); }
:host([data-tema="escuro"]) { color: #e9edef; --texto: #e9edef; --suave: #8696a0; --fundo: #111b21; --fundo2: #202c33; --borda: #222d34;
  --hover: #1a262d; --texto-aba: #aebac1; --chip-borda: #2f3b43; --chip-ativo-fundo: #103529; --chip-ativo-texto: #21c063; --perigo: #ff8a80; --aviso: #ffd27a; --aviso-fundo: #3a3020; --sombra: 0 2px 12px rgba(0,0,0,.6); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
.vz { color: var(--texto); }

/* Barra de abas */
.barra { background: var(--fundo); border-bottom: 1px solid var(--borda); }
.abas { display: flex; align-items: stretch; gap: 0; overflow-x: auto; scrollbar-width: none; padding: 0 6px; }
.abas::-webkit-scrollbar { display: none; }
.aba { display: flex; align-items: center; gap: 5px; padding: 9px 8px 7px; white-space: nowrap; color: var(--suave); border-bottom: 3px solid transparent; font-weight: 500; font-size: 12.5px; }
.aba:hover { background: var(--hover); }
.aba.ativa { color: var(--verde); border-bottom-color: var(--verde); font-weight: 600; }
.n { min-width: 18px; padding: 0 6px; border-radius: 9px; background: var(--fundo2); color: var(--suave); font-size: 11px; line-height: 18px; text-align: center; font-weight: 600; }
.aba.ativa .n { background: var(--verde); color: #fff; }
.esp { flex: 1; }
.iconebtn { position: relative; display: flex; align-items: center; justify-content: center; width: 34px; color: var(--suave); border-radius: 50%; }
.iconebtn:hover { background: var(--hover); color: var(--texto); }
.selo { position: absolute; top: 3px; right: 1px; min-width: 16px; padding: 0 4px; border-radius: 8px; background: var(--perigo); color: #fff; font-size: 10px; line-height: 16px; font-weight: 700; text-align: center; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px 2px; }
/* Chips: mesma pílula dos chips nativos do WhatsApp (Tudo, Não lidas, Favoritas) */
.chips.compacta { padding: 2px 16px 6px; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border-radius: 999px; background: var(--fundo); color: var(--texto-aba); font-size: 14px; line-height: 20px; border: 1px solid var(--chip-borda); }
.chip:hover { background: var(--hover); }
.chip.ativo { background: var(--chip-ativo-fundo); color: var(--chip-ativo-texto); border-color: transparent; }
.chip.rotulo { background: none; color: var(--suave); padding-left: 0; cursor: default; border: 0; }
.nota { padding: 3px 12px 6px; font-size: 11px; color: var(--suave); }
.nota button { color: var(--verde); text-decoration: underline; }
.aviso { margin: 4px 10px; padding: 5px 8px; border-radius: 6px; background: var(--aviso-fundo); color: var(--aviso); font-size: 11.5px; }

/* Selo dentro de uma linha da lista */
.linha { position: absolute; right: 8px; bottom: 5px; z-index: 5; display: flex; gap: 4px; }
.mini { padding: 1px 8px; border-radius: 10px; font-size: 11px; background: var(--fundo2); color: var(--suave); border: 1px solid var(--borda); white-space: nowrap; }
button.mini:hover { color: var(--verde); border-color: var(--verde); }
.mini.idade { color: var(--aviso); background: var(--aviso-fundo); border-color: transparent; }

/* Botões do cabeçalho e da caixa de digitação */
.topbtn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; color: var(--suave); position: relative; }
.topbtn:hover { background: var(--hover); color: var(--verde); }
.topbtn.ativo { color: var(--verde); }
.flutuante { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 14px; background: var(--fundo); color: var(--suave); border: 1px solid var(--borda); box-shadow: var(--sombra); font-size: 12px; }
.flutuante:hover { color: var(--verde); border-color: var(--verde); }

/* Popover */
.pop { position: fixed; pointer-events: auto; background: var(--fundo2); color: var(--texto); border: 1px solid var(--borda); border-radius: 10px; box-shadow: var(--sombra);
  max-height: min(78vh, 640px); overflow: auto; padding: 12px; font-size: 13px; }
.pop h4 { margin: 0 0 6px; font-size: 14px; }
.pop h5 { margin: 12px 0 5px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); }
.cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.cab strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--suave); }
.x:hover { background: var(--hover); }
.campo { width: 100%; padding: 7px 9px; border: 1px solid var(--borda); border-radius: 8px; background: var(--fundo); color: var(--texto); font: inherit; outline: none; }
.campo:focus { border-color: var(--verde); }
textarea.campo { resize: vertical; min-height: 60px; }
.linha2 { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.btn { padding: 6px 12px; border-radius: 16px; border: 1px solid var(--borda); background: var(--fundo); color: var(--texto); font-size: 12.5px; }
.btn:hover { border-color: var(--verde); color: var(--verde); }
.btn.pri { background: var(--verde); border-color: var(--verde); color: #fff; font-weight: 600; }
.btn.pri:hover { filter: brightness(1.08); color: #fff; }
.btn.perigo:hover { color: var(--perigo); border-color: var(--perigo); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.sel { border-color: var(--verde); color: var(--verde); font-weight: 600; }
/* Itens (notas, lembretes, modelos): cartões brancos de raio 8px */
.item { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 8px 10px; margin-bottom: 6px; background: var(--fundo); border: 1px solid var(--borda); border-radius: 8px; box-shadow: 0 1px 1px rgba(11,20,26,.06); }
.item:last-child { margin-bottom: 0; }
.item .txt { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.item small, .dica { color: var(--suave); font-size: 11.5px; }
.vencido { color: var(--perigo); font-weight: 600; }
.tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 9px; border-radius: 12px; color: #fff; font-size: 11.5px; line-height: 18px; }
.tag.fora { background: var(--fundo2) !important; color: var(--suave); border: 1px dashed var(--borda); }
.vazio { padding: 14px 4px; text-align: center; color: var(--suave); }
.cores { display: flex; gap: 5px; margin: 4px 0; }
.cor { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; }
.cor.sel { border-color: var(--texto); }
.msg { margin-top: 6px; font-size: 12px; color: var(--perigo); }
.ok { color: var(--verde); }
/* Faixa do lead: cartão branco sobre o fundo da conversa */
.faixa { display: flex; flex-direction: column; gap: 4px; margin: 8px 16px 4px; padding: 8px 12px; background: var(--fundo); border: 1px solid var(--borda); border-radius: 8px; box-shadow: 0 1px 2px rgba(11,20,26,.1); }
.faixa-linha { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.faixa-titulo { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.faixa-nota { color: var(--suave); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faixa .btn { padding: 3px 10px; font-size: 12px; }
.tag.neutra { background: var(--fundo); color: var(--texto); border: 1px solid var(--borda); }
.tag.ok { background: var(--verde); }
.tag.acomp { background: #c77800; font-weight: 600; }
.btn.acomp { border-color: #c77800; color: #c77800; }
.aviso-mini { padding: 1px 8px; border-radius: 10px; background: var(--aviso-fundo); color: var(--aviso); font-size: 11px; }
/* Barra superior de largura total (48 px) */
.topo { display: flex; align-items: center; gap: 6px; height: 48px; padding: 0 12px 0 10px; background: var(--fundo); border-bottom: 1px solid var(--borda); font-size: 14px; color: var(--texto-aba); }
:host(.flutuando) .topo { box-shadow: 0 4px 14px rgba(11,20,26,.28); }
.logo { flex: 0 0 auto; display: inline-flex; margin-right: 6px; }
.topo-abas { flex: 0 1 auto; min-width: 0; display: flex; align-items: stretch; height: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.topo-abas::-webkit-scrollbar { display: none; }
.taba { position: relative; display: flex; align-items: center; gap: 5px; padding: 3px 14px 0 16px; white-space: nowrap; color: var(--texto-aba); font-weight: 500; border-bottom: 3px solid transparent; }
.taba:hover { background: var(--hover); }
.taba .n { color: #8696a0; font-weight: 500; }
.taba.ativa { color: var(--verde); border-bottom-color: var(--verde); font-weight: 600; }
.taba.alerta .n { color: var(--perigo); font-weight: 700; }
.taba.alerta.ativa .n { color: var(--perigo); opacity: 1; }
.taba.ativa .n { color: var(--verde); opacity: .75; }
.taba .ponto { position: absolute; left: 6px; top: 15px; width: 6px; height: 6px; border-radius: 50%; background: var(--verde); }
.taba .fase { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
.topo-esp { flex: 1 1 auto; min-width: 8px; }
.topo-dir { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }
.tbtn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; color: #54656f; }
.topo.escuro .tbtn, :host([data-tema="escuro"]) .tbtn { color: #aebac1; }
.tbtn:hover { background: var(--hover); color: var(--texto); }
.tbtn .selo { top: 2px; right: 0; }
[data-tip]:hover::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); padding: 4px 8px; border-radius: 6px; background: #111b21; color: #e9edef; font-size: 12px; font-weight: 400; white-space: nowrap; pointer-events: none; z-index: 10; }
.topo-dir [data-tip]:last-child:hover::after, .topo-dir .conta[data-tip]:hover::after { left: auto; right: 0; transform: none; }
.cta { height: 32px; padding: 0 16px; margin-left: 6px; border-radius: 999px; background: var(--verde); color: #fff; font-weight: 600; font-size: 14px; }
.cta:hover { filter: brightness(1.08); }
.conta { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 36px; margin-left: 6px; padding: 0 10px 0 4px; border-radius: 999px; }
.conta:hover { background: var(--hover); }
.avatar { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: var(--chip-ativo-fundo); color: var(--chip-ativo-texto); font-size: 12px; font-weight: 700; }
.conta .ok-crm { color: var(--verde); font-weight: 600; font-size: 13px; }
.guia { margin: 0; padding-left: 18px; color: var(--texto); }
.guia li { margin: 4px 0; }
.grade { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.check { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
.check input { accent-color: var(--verde); }

/* Ícones na caixa de digitação (à esquerda do microfone) */
.caixa-icones { display: inline-flex; align-items: center; }
.cxbtn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: #54656f; }
:host([data-tema="escuro"]) .cxbtn { color: #aebac1; }
.cxbtn:hover { background: var(--hover); color: var(--verde); }
:host([style*="fixed"]) .cxbtn { background: var(--fundo); border: 1px solid var(--borda); box-shadow: var(--sombra); width: 34px; height: 34px; margin-left: 4px; }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: min(80vw, 520px); padding: 10px 16px; border-radius: 10px; background: #111b21; color: #e9edef;
  box-shadow: var(--sombra); pointer-events: auto; font-size: 13px; z-index: 5; }
.toast.erro { background: #8c1d18; color: #fff; }
`;
