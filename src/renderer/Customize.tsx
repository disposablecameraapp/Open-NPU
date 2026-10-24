import { useEffect, useState } from "react";

export function Customize({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    if (text === value) return;
    setSaved(false);
    const t = setTimeout(() => { void onSave(text).then(() => setSaved(true)); }, 600);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page">
      <h1>Customize</h1>
      <p className="muted">Personal instructions sent with every chat and every scheduled task, in all projects. Keep them short: they use up some of the model's context window.</p>
      <section>
        <h2>About you and how you like answers</h2>
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"I'm a developer on Windows. Be concise, skip the introduction, and show code before explanations. Reply in French unless I write in English."} />
        <div className="muted small" style={{ marginTop: 6 }}>{saved ? "Saved" : "Saving…"} · about {Math.ceil(text.length / 3.5)} tokens</div>
      </section>
    </div>
  );
}
