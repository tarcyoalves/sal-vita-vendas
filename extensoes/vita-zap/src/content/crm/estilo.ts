// CSS da UI injetada (dentro do Shadow DOM). Verde do WhatsApp, abas com sublinhado, chips
// arredondados; tema claro e escuro conforme o WhatsApp (atributo data-tema no host).

export const ESTILO = `
:host { all: initial; display: block; font: 13px/1.35 system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111b21;
  --verde: #00a884; --texto: #111b21; --suave: #667781; --fundo: #ffffff; --fundo2: #f0f2f5; --borda: #e9edef; --hover: #f5f6f6;
  --perigo: #d93025; --aviso: #8a5a00; --aviso-fundo: #fff4d6; --sombra: 0 2px 10px rgba(11,20,26,.25); }
:host([data-tema="escuro"]) { color: #e9edef; --texto: #e9edef; --suave: #8696a0; --fundo: #111b21; --fundo2: #202c33; --borda: #222d34;
  --hover: #1a262d; --perigo: #ff8a80; --aviso: #ffd27a; --aviso-fundo: #3a3020; --sombra: 0 2px 12px rgba(0,0,0,.6); }
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
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 14px; background: var(--fundo2); color: var(--texto); font-size: 12px; border: 1px solid transparent; }
.chip:hover { border-color: var(--borda); }
.chip.ativo { background: var(--verde); color: #fff; }
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
.pop { position: fixed; pointer-events: auto; background: var(--fundo); color: var(--texto); border: 1px solid var(--borda); border-radius: 10px; box-shadow: var(--sombra);
  max-height: min(78vh, 640px); overflow: auto; padding: 12px; font-size: 13px; }
.pop h4 { margin: 0 0 6px; font-size: 14px; }
.pop h5 { margin: 12px 0 5px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); }
.cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.cab strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--suave); }
.x:hover { background: var(--hover); }
.campo { width: 100%; padding: 7px 9px; border: 1px solid var(--borda); border-radius: 8px; background: var(--fundo2); color: var(--texto); font: inherit; outline: none; }
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
.item { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--borda); }
.item:last-child { border-bottom: 0; }
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
.faixa { display: flex; flex-direction: column; gap: 4px; padding: 6px 12px; background: var(--fundo2); border-bottom: 1px solid var(--borda); }
.faixa-linha { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.faixa-titulo { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.faixa-nota { color: var(--suave); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faixa .btn { padding: 3px 10px; font-size: 12px; }
.tag.neutra { background: var(--fundo); color: var(--texto); border: 1px solid var(--borda); }
.tag.ok { background: var(--verde); }
.aviso-mini { padding: 1px 8px; border-radius: 10px; background: var(--aviso-fundo); color: var(--aviso); font-size: 11px; }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: min(80vw, 520px); padding: 10px 16px; border-radius: 10px; background: #111b21; color: #e9edef;
  box-shadow: var(--sombra); pointer-events: auto; font-size: 13px; z-index: 5; }
.toast.erro { background: #8c1d18; color: #fff; }
`;
