import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { isFenced, replaceBlock, splitBlocks } from "../core/docBlocks";

/**
 * The text of a document shown as it reads, and written in place: a click on a paragraph, a heading, a list or a table opens its text, Ctrl+Enter or leaving it keeps the change,
 * Escape drops it. A block that holds a chart, a quiz or a diagram is opened with its own pencil. The change is written into the text of the file, so the model reads the new version.
 */
export function EditableDoc({ text, onSave }: { text: string; onSave: (t: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const blocks = useMemo(() => splitBlocks(text), [text]);
  const fit = () => { const t = box.current; if (t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`; } };
  useEffect(() => { if (open !== null) { box.current?.focus(); fit(); } }, [open]);
  const start = (i: number, raw: string) => { setDraft(raw); setOpen(i); };
  const commit = () => {
    if (open === null) return;
    const i = open;
    setOpen(null);
    const next = replaceBlock(text, i, draft);
    if (next !== text) onSave(next);
  };
  const editor = (i: number) => (
    <textarea key={`e${i}`} ref={box} className="doc-edit" value={draft} aria-label="Edit this part of the text" spellCheck
      onChange={(e) => { setDraft(e.target.value); fit(); }} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(null); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }} />
  );
  return (
    <div className="editable-doc">
      {blocks.map((b, i) => open === i ? editor(i) : (
        <div key={i} className={`doc-block ${isFenced(b) ? "fenced" : ""}`}
          onClick={(e) => { if (isFenced(b) || (e.target as HTMLElement).closest("a,button,input,select,textarea,summary,canvas,svg")) return; start(i, b); }}>
          <Markdown text={b} />
          <button type="button" className="doc-pencil" title="Edit this part" aria-label="Edit this part" onClick={(e) => { e.stopPropagation(); start(i, b); }}>✎</button>
        </div>
      ))}
      {open === blocks.length ? editor(blocks.length) : (
        <button type="button" className="doc-add" onClick={() => start(blocks.length, "")}>{blocks.length ? "+ Add text" : "Click to write"}</button>
      )}
    </div>
  );
}
