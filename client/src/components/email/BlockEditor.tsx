import { useState, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import {
  Type, Image, MousePointerClick, Minus, ArrowUpDown, Columns2,
  Heading1, GripVertical, Trash2, ChevronUp, ChevronDown, Plus,
  Code2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  Link2, Palette,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";

type BlockType = "header" | "text" | "image" | "button" | "divider" | "spacer" | "columns";

interface BlockBase {
  id: string;
  type: BlockType;
}

interface HeaderBlock extends BlockBase {
  type: "header";
  text: string;
  level: "h1" | "h2" | "h3";
  align: "left" | "center" | "right";
  color: string;
}

interface TextBlock extends BlockBase {
  type: "text";
  html: string;
}

interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  width: string;
  align: "left" | "center" | "right";
}

interface ButtonBlock extends BlockBase {
  type: "button";
  text: string;
  url: string;
  bgColor: string;
  textColor: string;
  align: "left" | "center" | "right";
  borderRadius: string;
}

interface DividerBlock extends BlockBase {
  type: "divider";
  color: string;
  thickness: string;
}

interface SpacerBlock extends BlockBase {
  type: "spacer";
  height: string;
}

interface ColumnsBlock extends BlockBase {
  type: "columns";
  leftHtml: string;
  rightHtml: string;
}

type Block = HeaderBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | ColumnsBlock;

const BLOCK_TYPES: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "header", label: "Título", icon: Heading1 },
  { type: "text", label: "Texto", icon: Type },
  { type: "image", label: "Imagem", icon: Image },
  { type: "button", label: "Botão CTA", icon: MousePointerClick },
  { type: "divider", label: "Divisor", icon: Minus },
  { type: "spacer", label: "Espaço", icon: ArrowUpDown },
  { type: "columns", label: "2 Colunas", icon: Columns2 },
];

let blockCounter = 0;
function newId() {
  return `blk_${++blockCounter}_${Date.now()}`;
}

function createBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "header":
      return { id, type, text: "Seu título aqui", level: "h1", align: "center", color: "#0C3680" };
    case "text":
      return { id, type, html: "<p>Escreva seu conteúdo aqui...</p>" };
    case "image":
      return { id, type, src: "", alt: "", width: "100%", align: "center" };
    case "button":
      return { id, type, text: "Saiba mais", url: "https://", bgColor: "#0C3680", textColor: "#ffffff", align: "center", borderRadius: "6px" };
    case "divider":
      return { id, type, color: "#e0e0e0", thickness: "1px" };
    case "spacer":
      return { id, type, height: "24px" };
    case "columns":
      return { id, type, leftHtml: "<p>Coluna esquerda</p>", rightHtml: "<p>Coluna direita</p>" };
  }
}

function blockToHtml(block: Block): string {
  switch (block.type) {
    case "header": {
      const tag = block.level;
      const sizes: Record<string, string> = { h1: "28px", h2: "22px", h3: "18px" };
      return `<${tag} style="margin:0 0 16px;font-size:${sizes[tag]};font-weight:bold;color:${block.color};text-align:${block.align};">${DOMPurify.sanitize(block.text)}</${tag}>`;
    }
    case "text":
      return `<div style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">${DOMPurify.sanitize(block.html)}</div>`;
    case "image":
      if (!block.src) return "";
      return `<div style="text-align:${block.align};margin:0 0 16px;"><img src="${DOMPurify.sanitize(block.src)}" alt="${DOMPurify.sanitize(block.alt)}" style="max-width:${block.width};height:auto;border:0;" /></div>`;
    case "button":
      return `<div style="text-align:${block.align};margin:24px 0;"><a href="${DOMPurify.sanitize(block.url)}" style="display:inline-block;padding:14px 32px;background:${block.bgColor};color:${block.textColor};text-decoration:none;font-size:15px;font-weight:bold;border-radius:${block.borderRadius};">${DOMPurify.sanitize(block.text)}</a></div>`;
    case "divider":
      return `<hr style="border:none;border-top:${block.thickness} solid ${block.color};margin:16px 0;" />`;
    case "spacer":
      return `<div style="height:${block.height};"></div>`;
    case "columns":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td width="50%" valign="top" style="padding-right:8px;font-size:15px;line-height:1.6;color:#444;">${DOMPurify.sanitize(block.leftHtml)}</td><td width="50%" valign="top" style="padding-left:8px;font-size:15px;line-height:1.6;color:#444;">${DOMPurify.sanitize(block.rightHtml)}</td></tr></table>`;
  }
}

function blocksToHtml(blocks: Block[]): string {
  return blocks.map(blockToHtml).filter(Boolean).join("\n");
}

function InlineTextEditor({ value, onChange, minHeight = 80 }: { value: string; onChange: (html: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const exec = (command: string, arg?: string) => {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const btn = "inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-900 transition";

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-1.5 py-1">
        <button type="button" className={btn} title="Negrito" onMouseDown={e => e.preventDefault()} onClick={() => exec("bold")}><Bold size={13} /></button>
        <button type="button" className={btn} title="Itálico" onMouseDown={e => e.preventDefault()} onClick={() => exec("italic")}><Italic size={13} /></button>
        <button type="button" className={btn} title="Sublinhado" onMouseDown={e => e.preventDefault()} onClick={() => exec("underline")}><Underline size={13} /></button>
        <button type="button" className={btn} title="Link" onMouseDown={e => e.preventDefault()} onClick={() => {
          const url = window.prompt("URL do link:");
          if (url) exec("createLink", url.trim());
        }}><Link2 size={13} /></button>
        <button type="button" className={btn} title="Esquerda" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyLeft")}><AlignLeft size={13} /></button>
        <button type="button" className={btn} title="Centro" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyCenter")}><AlignCenter size={13} /></button>
        <button type="button" className={btn} title="Direita" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyRight")}><AlignRight size={13} /></button>
        <label className={`${btn} relative cursor-pointer`} title="Cor" onMouseDown={saveSelection}>
          <Palette size={13} />
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => {
            ref.current?.focus();
            if (savedRange.current) {
              const sel = window.getSelection();
              if (sel) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
            }
            exec("foreColor", e.target.value);
          }} />
        </label>
      </div>
      <div
        ref={ref}
        className="px-3 py-2 text-sm leading-relaxed text-slate-800 focus:outline-none"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
      />
    </div>
  );
}

function BlockSettings({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.type) {
    case "header":
      return (
        <div className="space-y-2">
          <Input value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} placeholder="Texto do título" />
          <div className="flex gap-2">
            <Select value={block.level} onValueChange={(v: "h1" | "h2" | "h3") => onChange({ ...block, level: v })}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">H1</SelectItem>
                <SelectItem value="h2">H2</SelectItem>
                <SelectItem value="h3">H3</SelectItem>
              </SelectContent>
            </Select>
            <Select value={block.align} onValueChange={(v: "left" | "center" | "right") => onChange({ ...block, align: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs !mb-0">Cor</Label>
              <input type="color" value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} className="h-8 w-8 rounded cursor-pointer" />
            </div>
          </div>
        </div>
      );
    case "text":
      return <InlineTextEditor value={block.html} onChange={html => onChange({ ...block, html })} />;
    case "image":
      return (
        <div className="space-y-2">
          <Input value={block.src} onChange={e => onChange({ ...block, src: e.target.value })} placeholder="URL da imagem (https://...)" />
          <div className="flex gap-2">
            <Input value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Texto alternativo" className="flex-1" />
            <Input value={block.width} onChange={e => onChange({ ...block, width: e.target.value })} placeholder="Largura (ex: 100%)" className="w-24" />
            <Select value={block.align} onValueChange={(v: "left" | "center" | "right") => onChange({ ...block, align: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {block.src && (
            <div className="rounded-lg border border-slate-200 p-2 bg-slate-50 text-center">
              <img src={block.src} alt={block.alt} className="max-h-32 mx-auto" style={{ maxWidth: block.width }} />
            </div>
          )}
        </div>
      );
    case "button":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} placeholder="Texto do botão" className="flex-1" />
            <Input value={block.url} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="URL do link" className="flex-1" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs !mb-0">Fundo</Label>
              <input type="color" value={block.bgColor} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-7 w-7 rounded cursor-pointer" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs !mb-0">Texto</Label>
              <input type="color" value={block.textColor} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-7 w-7 rounded cursor-pointer" />
            </div>
            <Select value={block.align} onValueChange={(v: "left" | "center" | "right") => onChange({ ...block, align: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
            <Input value={block.borderRadius} onChange={e => onChange({ ...block, borderRadius: e.target.value })} placeholder="Raio (ex: 6px)" className="w-24" />
          </div>
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 text-center">
            <a href="#" onClick={e => e.preventDefault()} style={{ display: "inline-block", padding: "12px 28px", background: block.bgColor, color: block.textColor, textDecoration: "none", fontSize: "15px", fontWeight: "bold", borderRadius: block.borderRadius }}>
              {block.text}
            </a>
          </div>
        </div>
      );
    case "divider":
      return (
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs !mb-0">Cor</Label>
            <input type="color" value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} className="h-7 w-7 rounded cursor-pointer" />
          </div>
          <Input value={block.thickness} onChange={e => onChange({ ...block, thickness: e.target.value })} placeholder="1px" className="w-20" />
          <div className="flex-1 border-t" style={{ borderColor: block.color, borderWidth: block.thickness }} />
        </div>
      );
    case "spacer":
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs !mb-0">Altura</Label>
          <Input value={block.height} onChange={e => onChange({ ...block, height: e.target.value })} placeholder="24px" className="w-24" />
          <div className="flex-1 rounded bg-slate-100 border border-dashed border-slate-300 text-center text-[10px] text-slate-400 py-1" style={{ height: block.height, minHeight: 16 }}>
            {block.height}
          </div>
        </div>
      );
    case "columns":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Coluna esquerda</Label>
            <InlineTextEditor value={block.leftHtml} onChange={leftHtml => onChange({ ...block, leftHtml })} minHeight={60} />
          </div>
          <div>
            <Label className="text-xs">Coluna direita</Label>
            <InlineTextEditor value={block.rightHtml} onChange={rightHtml => onChange({ ...block, rightHtml })} minHeight={60} />
          </div>
        </div>
      );
  }
}

interface BlockEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
}

export function BlockEditor({ value, onChange, minHeight = 350 }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    if (!value.trim()) return [createBlock("text")];
    return [{ id: newId(), type: "text" as const, html: value }];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [htmlMode, setHtmlMode] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const emitHtml = useCallback((nextBlocks: Block[]) => {
    onChange(blocksToHtml(nextBlocks));
  }, [onChange]);

  const updateBlocks = (next: Block[]) => {
    setBlocks(next);
    emitHtml(next);
  };

  const addBlock = (type: BlockType, insertAfterIdx?: number) => {
    const block = createBlock(type);
    const next = [...blocks];
    const idx = insertAfterIdx !== undefined ? insertAfterIdx + 1 : next.length;
    next.splice(idx, 0, block);
    setSelectedId(block.id);
    setShowPalette(false);
    updateBlocks(next);
  };

  const removeBlock = (id: string) => {
    const next = blocks.filter(b => b.id !== id);
    if (selectedId === id) setSelectedId(null);
    updateBlocks(next.length > 0 ? next : [createBlock("text")]);
  };

  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateBlocks(next);
  };

  const updateBlock = (id: string, updated: Block) => {
    const next = blocks.map(b => b.id === id ? updated : b);
    updateBlocks(next);
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOver.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
      moveBlock(dragItem.current, dragOver.current);
    }
    dragItem.current = null;
    dragOver.current = null;
  };

  const blockLabel = (type: BlockType) => BLOCK_TYPES.find(b => b.type === type)?.label ?? type;
  const BlockIcon = (type: BlockType) => BLOCK_TYPES.find(b => b.type === type)?.icon ?? Type;

  if (htmlMode) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between bg-slate-50 border-b border-slate-100 px-3 py-1.5">
          <span className="text-xs font-medium text-slate-500">Modo HTML</span>
          <Button size="sm" variant="outline" onClick={() => setHtmlMode(false)} className="h-7 text-xs gap-1">
            <Code2 size={12} /> Voltar ao editor
          </Button>
        </div>
        <textarea
          className="w-full px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 bg-slate-50 focus:outline-none resize-y"
          style={{ minHeight }}
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" style={{ minHeight }}>
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-100 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Editor de blocos</span>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{blocks.length} bloco{blocks.length !== 1 ? "s" : ""}</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setShowPalette(!showPalette)} className="h-7 text-xs gap-1">
            <Plus size={12} /> Bloco
          </Button>
          <Button size="sm" variant="outline" onClick={() => setHtmlMode(true)} className="h-7 text-xs gap-1">
            <Code2 size={12} /> HTML
          </Button>
        </div>
      </div>

      {showPalette && (
        <div className="border-b border-slate-100 bg-blue-50/50 px-3 py-2">
          <p className="text-[11px] text-slate-500 mb-1.5">Adicionar bloco:</p>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 transition shadow-sm"
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 space-y-2">
        {blocks.map((block, idx) => {
          const Icon = BlockIcon(block.type);
          const isSelected = selectedId === block.id;
          return (
            <div
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              className={`rounded-lg border transition-all ${isSelected ? "border-blue-300 bg-blue-50/30 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none"
                onClick={() => setSelectedId(isSelected ? null : block.id)}
              >
                <GripVertical size={14} className="text-slate-300 cursor-grab flex-shrink-0" />
                <Icon size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-600 flex-1">{blockLabel(block.type)}</span>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button type="button" onClick={e => { e.stopPropagation(); moveBlock(idx, idx - 1); }} disabled={idx === 0} className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={12} /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); moveBlock(idx, idx + 1); }} disabled={idx === blocks.length - 1} className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={12} /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); addBlock("text", idx); }} className="p-1 rounded text-slate-300 hover:text-blue-600"><Plus size={12} /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); removeBlock(block.id); }} className="p-1 rounded text-slate-300 hover:text-red-600"><Trash2 size={12} /></button>
                </div>
              </div>
              {isSelected && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                  <BlockSettings block={block} onChange={b => updateBlock(block.id, b)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
