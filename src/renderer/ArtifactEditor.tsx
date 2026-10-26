import { useRef, useState } from "react";
import type { ArtifactKind } from "../shared/types";

const MARKDOWNISH: ArtifactKind[] = ["markdown", "docx", "pptx"];

/** Plain editing of an artifact's text, like a notepad: type, bold, italic, heading, list, and for slides a new slide. Nothing smart. */
export function ArtifactEditor({ kind, value, onSave, onCancel }: { kind: ArtifactKind; value: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== value;
  const change = (next: string, from: number, to: number) => {
    setText(next);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(from, to); } });
  };
  const wrap = (mark: string) => {
    const el = box.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd, sel = text.slice(a, b) || "text";
    change(`${text.slice(0, a)}${mark}${sel}${mark}${text.slice(b)}`, a + mark.length, a + mark.length + sel.length);
  };
  /** Puts a prefix at the start of every selected line (or takes it off when they all have it). */
  const prefix = (pre: string) => {
    const el = box.current; if (!el) return;
    const a = text.lastIndexOf("\n", el.selectionStart - 1) + 1;
    let b = text.indexOf("\n", el.selectionEnd); if (b < 0) b = text.length;
    const lines = text.slice(a, b).split("\n");
    const all = lines.every((l) => l.startsWith(pre));
    const out = lines.map((l) => (all ? l.slice(pre.length) : `${pre}${l}`)).join("\n");
    change(text.slice(0, a) + out + text.slice(b), a, a + out.length);
  };
  const insert = (snippet: string) => {
    const el = box.current; if (!el) return;
    const at = el.selectionEnd;
    change(text.slice(0, at) + snippet + text.slice(at), at + snippet.length, at + snippet.length);
  };
  const md = MARKDOWNISH.includes(kind);
  return (
    <div className="artifact-editor">
      <div className="editor-bar" role="toolbar" aria-label="Text tools">
        {md && <button type="button" onClick={() => wrap("**")} title="Bold" aria-label="Bold"><b>B</b></button>}
        {md && <button type="button" onClick={() => wrap("*")} title="Italic" aria-label="Italic"><i>I</i></button>}
        {md && <button type="button" onClick={() => prefix("# ")} title="Heading" aria-label="Heading">H</button>}
        {md && <button type="button" onClick={() => prefix("- ")} title="Bullet list" aria-label="Bullet list">•</button>}
        {kind === "pptx" && <button type="button" onClick={() => insert("\n\n---\n\n# New slide\n- \n")} title="Add a slide after the cursor">+ Slide</button>}
        {kind === "xlsx" && <span className="muted small">One | table | per sheet: the first line is row 1, the first column is A. A cell starting with = is a formula.</span>}
        <span className="spacer" />
        <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
        <button type="button" className="linkbtn run-btn" disabled={!dirty} onClick={() => onSave(text)}>Save</button>
      </div>
      <textarea ref={box} className="editor-text" value={text} spellCheck={kind === "markdown" || kind === "docx"} autoFocus
        aria-label="Edit the text of this file" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty) onSave(text); } else if (e.key === "Escape") onCancel(); }} />
    </div>
  );
}
