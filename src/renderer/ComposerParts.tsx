import { useEffect, useRef, useState } from "react";
import { STARTERS, draftKey, growTo } from "../core/composer";

export function loadDraft(convId: string): string {
  try { return localStorage.getItem(draftKey(convId)) ?? ""; } catch { return ""; }
}
export function saveDraft(convId: string, text: string) {
  try { if (text) localStorage.setItem(draftKey(convId), text); else localStorage.removeItem(draftKey(convId)); } catch { /* blocked: the draft just lives in memory */ }
}

/** Floating pill above the composer: shown when the chat is scrolled away from the latest message. */
export function JumpToLatest({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`jump ${show ? "show" : ""}`} onClick={onClick} tabIndex={show ? 0 : -1} aria-hidden={!show} aria-label="Jump to latest message">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
      Jump to latest
    </button>
  );
}

/** Starter prompts under the welcome composer: they fill the box, never send. */
export function StarterChips({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="starters" role="group" aria-label="Starter prompts">
      {STARTERS.map((s, i) => <button key={s.label} type="button" className="starter" style={{ ["--i" as any]: i }} onClick={() => onPick(s.prompt)}>{s.label}</button>)}
    </div>
  );
}

/** Inline editor that replaces a sent message's bubble. Enter saves, Esc cancels. */
export function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const g = growTo(el.scrollHeight, window.innerHeight);
    el.style.height = `${g.height}px`;
    el.style.overflowY = g.scroll ? "auto" : "hidden";
  }, [text]);
  const save = () => { if (text.trim()) onSave(text); };
  return (
    <div className="edit-box">
      <textarea
        ref={ref} value={text} rows={2} aria-label="Edit message" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
        }}
      />
      <div className="edit-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" disabled={!text.trim()} onClick={save} title="Save and resend (Enter)">Save &amp; send</button>
      </div>
    </div>
  );
}
