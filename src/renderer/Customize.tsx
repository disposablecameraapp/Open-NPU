import { useEffect, useState } from "react";
import type { Settings } from "../shared/types";
import { Skills } from "./Skills";
import { FILL_TO_UNFOLD, INSTRUCTION_CONTEXT, INSTRUCTION_LIMITS } from "../core/instructions";

type Keys = "customInstructions" | "customInstructions2" | "customInstructions3";
const KEYS: Keys[] = ["customInstructions", "customInstructions2", "customInstructions3"];
const TITLES = [
  "Essentials",
  "More details",
  "Everything else"
];
const HINTS = [
  "The only part small models get. Put what matters most here: your name, your language, how you want answers.",
  `Added for models with a context of ${INSTRUCTION_CONTEXT[1] / 1024}K tokens or more: preferences that help but are not vital.`,
  `Added for models with a context of ${INSTRUCTION_CONTEXT[2] / 1024}K tokens or more: background, long habits, examples of what you like.`
];
const PLACEHOLDERS = [
  "I'm Fabien, a developer on Windows. Reply in French unless I write in English. Be concise.",
  "I like code before explanations. Use metric units. When unsure, ask one short question.",
  "Background about my work, the tools I use, the tone I like, examples of answers I found good."
];

export function Customize({ settings, onSave, onOpenDocs }: { settings: Settings; onSave: (patch: Partial<Settings>) => Promise<void>; onOpenDocs: () => void }) {
  const [tab, setTab] = useState<"instructions" | "skills">("instructions");
  const [texts, setTexts] = useState<string[]>(() => KEYS.map((k) => settings[k] ?? ""));
  const [saved, setSaved] = useState(true);
  // a part opens by hand, or by itself when the one before it is nearly full
  const [opened, setOpened] = useState<boolean[]>(() => KEYS.map((k, i) => i === 0 || !!(settings[k] ?? "").trim()));
  const saved0 = KEYS.map((k) => settings[k] ?? "");
  const changed = texts.some((t, i) => t !== saved0[i]);
  useEffect(() => {
    if (!changed) return;
    setSaved(false);
    const t = setTimeout(() => { void onSave(Object.fromEntries(KEYS.map((k, i) => [k, texts[i]]))).then(() => setSaved(true)); }, 600);
    return () => clearTimeout(t);
  }, [texts]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, v: string) => {
    const next = texts.slice(); next[i] = v.slice(0, INSTRUCTION_LIMITS[i]); setTexts(next);
    if (i < 2 && next[i].length >= INSTRUCTION_LIMITS[i] * FILL_TO_UNFOLD && !opened[i + 1]) setOpened(opened.map((o, k) => o || k === i + 1));
  };
  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <h1>Customize</h1>
      <div className="seg" role="tablist" style={{ margin: "8px 0 14px" }}>
        <button role="tab" aria-selected={tab === "instructions"} className={tab === "instructions" ? "on" : ""} onClick={() => setTab("instructions")}>Instructions</button>
        <button role="tab" aria-selected={tab === "skills"} className={tab === "skills" ? "on" : ""} onClick={() => setTab("skills")}>Skills</button>
      </div>
      {tab === "skills" ? <Skills settings={settings} onSave={onSave} onOpenDocs={onOpenDocs} /> : <>
      <p className="muted">Personal instructions sent with every chat and every scheduled task, in all projects. They use up some of the model's context window, so they come in three parts: a small model reads only the first, a model with more room reads more.</p>
      {KEYS.map((_k, i) => (
        <section key={i}>
          <h2 style={{ cursor: i === 0 ? "default" : "pointer" }} onClick={() => { if (i > 0) setOpened(opened.map((o, k) => (k === i ? !o : o))); }}>
            {i > 0 && <span className="muted">{opened[i] ? "▾ " : "▸ "}</span>}{i + 1}. {TITLES[i]}
            {!opened[i] && <span className="muted small"> · {INSTRUCTION_LIMITS[i]} characters</span>}
          </h2>
          {opened[i] && (
            <>
              <p className="muted small">{HINTS[i]}</p>
              <textarea className="instr-box" rows={i === 0 ? 6 : 8} maxLength={INSTRUCTION_LIMITS[i]} value={texts[i]} onChange={(e) => set(i, e.target.value)} placeholder={PLACEHOLDERS[i]} />
              <div className="muted small" style={{ marginTop: 6 }}>{texts[i].length} / {INSTRUCTION_LIMITS[i]} characters · about {Math.ceil(texts[i].length / 3.5)} tokens</div>
            </>
          )}
        </section>
      ))}
      <div className="muted small">{saved ? "Saved" : "Saving…"}</div>
      </>}
    </div>
  );
}
