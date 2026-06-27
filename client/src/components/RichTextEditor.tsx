import { useRef, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link2, Eraser, Code2,
} from "lucide-react";

/**
 * Dependency-free rich text editor for composing e-mails.
 *
 * Produces inline-styled HTML (font, size, bold, italic, underline, color,
 * alignment, lists, links) that survives e-mail clients. The generated HTML
 * is dropped straight into the marketing layout on the server — and because
 * it contains block-level tags, the server's plain-text fallback leaves it
 * untouched.
 */

const FONTS = [
  { label: "Padrão", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Courier", value: "'Courier New', monospace" },
];

const SIZES = [
  { label: "Pequeno", value: "13px" },
  { label: "Normal", value: "15px" },
  { label: "Médio", value: "18px" },
  { label: "Grande", value: "22px" },
  { label: "Título", value: "28px" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 220 }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [htmlMode, setHtmlMode] = useState(false);

  // Push the external value into the DOM only when it diverges (template load,
  // dialog open, reset) — never while typing, which would reset the caret.
  useEffect(() => {
    if (htmlMode) return;
    const el = ref.current;
    if (el && value !== el.innerHTML) {
      el.innerHTML = DOMPurify.sanitize(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, htmlMode]);

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  // Toolbar buttons keep focus (onMouseDown preventDefault), so the live
  // selection is still active here.
  const exec = (command: string, arg?: string) => {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, arg);
    emit();
  };

  // Selects / color inputs steal focus, so restore the saved range first.
  const applyOnSelection = (fn: () => void) => {
    ref.current?.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    fn();
    emit();
  };

  const setFontSize = (px: string) => {
    ref.current?.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    ref.current?.querySelectorAll('font[size="7"]').forEach(node => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      while (node.firstChild) span.appendChild(node.firstChild);
      node.parentNode?.replaceChild(span, node);
    });
    document.execCommand("styleWithCSS", false, "true");
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Endereço do link (ex.: https://salvitarn.com.br)");
    if (url) {
      ref.current?.focus();
      restoreSelection();
      document.execCommand("createLink", false, url.trim());
      emit();
    }
  };

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-900 transition active:scale-95";
  const selectCls =
    "h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-200">
      <style>{`
        .sv-rte:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .sv-rte ul { list-style: disc; padding-left: 1.4em; margin: 0 0 12px; }
        .sv-rte ol { list-style: decimal; padding-left: 1.4em; margin: 0 0 12px; }
        .sv-rte a { color: #0C3680; text-decoration: underline; }
        .sv-rte p { margin: 0 0 12px; }
      `}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <select
          className={selectCls}
          defaultValue=""
          title="Fonte"
          onMouseDown={saveSelection}
          onChange={e => applyOnSelection(() => document.execCommand("fontName", false, e.target.value))}
        >
          {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>

        <select
          className={selectCls}
          defaultValue=""
          title="Tamanho"
          onMouseDown={saveSelection}
          onChange={e => { if (e.target.value) setFontSize(e.target.value); }}
        >
          <option value="">Tamanho</option>
          {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" className={btn} title="Negrito" onMouseDown={e => e.preventDefault()} onClick={() => exec("bold")}><Bold size={15} /></button>
        <button type="button" className={btn} title="Itálico" onMouseDown={e => e.preventDefault()} onClick={() => exec("italic")}><Italic size={15} /></button>
        <button type="button" className={btn} title="Sublinhado" onMouseDown={e => e.preventDefault()} onClick={() => exec("underline")}><Underline size={15} /></button>

        <label className={`${btn} relative cursor-pointer`} title="Cor do texto" onMouseDown={saveSelection}>
          <span className="text-sm font-bold leading-none">A</span>
          <span className="absolute bottom-1 h-1 w-4 rounded bg-blue-900" />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={e => applyOnSelection(() => document.execCommand("foreColor", false, e.target.value))}
          />
        </label>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" className={btn} title="Alinhar à esquerda" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyLeft")}><AlignLeft size={15} /></button>
        <button type="button" className={btn} title="Centralizar" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyCenter")}><AlignCenter size={15} /></button>
        <button type="button" className={btn} title="Alinhar à direita" onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyRight")}><AlignRight size={15} /></button>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" className={btn} title="Lista com marcadores" onMouseDown={e => e.preventDefault()} onClick={() => exec("insertUnorderedList")}><List size={15} /></button>
        <button type="button" className={btn} title="Lista numerada" onMouseDown={e => e.preventDefault()} onClick={() => exec("insertOrderedList")}><ListOrdered size={15} /></button>
        <button type="button" className={btn} title="Inserir link" onMouseDown={e => e.preventDefault()} onClick={addLink}><Link2 size={15} /></button>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" className={btn} title="Limpar formatação" onMouseDown={e => e.preventDefault()} onClick={() => exec("removeFormat")}><Eraser size={15} /></button>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button
          type="button"
          className={`${btn} ${htmlMode ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-300' : ''}`}
          title="Editar HTML"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            if (htmlMode) {
              setHtmlMode(false);
            } else {
              saveSelection();
              setHtmlMode(true);
            }
          }}
        >
          <Code2 size={15} />
        </button>
      </div>

      {htmlMode ? (
        <textarea
          className="w-full px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 bg-slate-50 focus:outline-none resize-y"
          style={{ minHeight }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Cole ou edite o HTML aqui..."
          spellCheck={false}
        />
      ) : (
        <div
          ref={ref}
          className="sv-rte px-4 py-3 text-sm leading-relaxed text-slate-800 focus:outline-none"
          style={{ minHeight }}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder || "Escreva o conteúdo do e-mail..."}
          onInput={emit}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onPaste={e => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
            emit();
          }}
          onBlur={() => { saveSelection(); emit(); }}
        />
      )}
    </div>
  );
}
