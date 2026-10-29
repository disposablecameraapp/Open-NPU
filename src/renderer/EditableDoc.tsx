import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { blockStart, isFenced, splitBlocks } from "../core/docBlocks";

/**
 * The text of a document shown as it reads. A click anywhere in it opens the WHOLE text for writing, in place and looking like the page, with the caret where the click was (by paragraph): select across paragraphs,
 * type, delete, paste, as in any text document. Leaving it (a click outside, Esc, Ctrl+Enter) keeps what was written, and the document is drawn again. A block that holds a chart, a quiz or a diagram is opened by its own
 * pencil, so that a click on it still reaches it. The change is written into the text of the file, so the model reads the new version.
 */
export function EditableDoc({ text, onSave }: { text: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const caret = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const blocks = useMemo(() => splitBlocks(text), [text]);
  const fit = () => { const t = box.current; if (t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 4}px`; } };
  const start = (index: number) => { caret.current = blockStart(text, index); setDraft(text); setEditing(true); };
  useEffect(() => {
    if (!editing) return;
    const t = box.current;
    if (t) { t.focus(); t.setSelectionRange(caret.current, caret.current); fit(); }
  }, [editing]);
  const done = () => {
    if (!editing) return;
    setEditing(false);
    if (draft !== text) onSave(draft);
  };
  if (editing) {
    return (
      <div className="editable-doc writing">
        <textarea ref={box} className="doc-edit" value={draft} aria-label="Edit the text of this document" spellCheck
          onChange={(e) => { setDraft(e.target.value); fit(); }} onBlur={done}
          onKeyDown={(e) => { if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); done(); } }} />
        <div className="doc-hint">Writing the whole text · click outside or press Esc to finish</div>
      </div>
    );
  }
  return (
    <div className="editable-doc">
      {blocks.map((b, i) => (
        <div key={i} className={`doc-block ${isFenced(b) ? "fenced" : ""}`}
          onClick={(e) => { if (isFenced(b) || (e.target as HTMLElement).closest("a,button,input,select,textarea,summary,canvas,svg")) return; start(i); }}>
          <Markdown text={b} />
          {isFenced(b) && <button type="button" className="doc-pencil" title="Edit this part" aria-label="Edit this part" onClick={(e) => { e.stopPropagation(); start(i); }}>✎</button>}
        </div>
      ))}
      {!blocks.length && <button type="button" className="doc-add" onClick={() => start(0)}>Click to write</button>}
      {blocks.length > 0 && <div className="doc-tail" onClick={() => start(blocks.length - 1)} aria-hidden="true" />}
    </div>
  );
}
