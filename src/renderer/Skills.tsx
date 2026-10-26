import { useRef, useState } from "react";
import type { Settings } from "../shared/types";
import { MAX_STEPS, MAX_TAGS, SKILL_CATEGORIES, categoryOf, cleanTags, skillFromMarkdown, skillProblems, skillSize, skillToMarkdown, slug, type Skill } from "../core/skills";
import { allSkills } from "../core/skillsDefault";

/** One line drawing per category (no pictures: a skill is text only). */
const CATEGORY_ICONS: Record<string, string> = {
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12",
  data: "M5 20V10M12 20V4M19 20v-7",
  language: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  writing: "M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3",
  study: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h10",
  everyday: "M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6",
  planning: "M5 6l2 2 3-3M13 7h6M5 13l2 2 3-3M13 14h6M5 20h14",
  ideas: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  other: "M12 4v16M4 12h16"
};
const CategoryIcon = ({ id }: { id: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={CATEGORY_ICONS[id] ?? CATEGORY_ICONS.other} /></svg>;

const blank = (): Skill => ({ id: "", name: "", description: "", tags: [], instructions: "", steps: [{ title: "", prompt: "" }], models: [] });

export function Skills({ settings, onSave, onOpenDocs }: { settings: Settings; onSave: (patch: Partial<Settings>) => Promise<void>; onOpenDocs: () => void }) {
  const [editing, setEditing] = useState<Skill | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tagText, setTagText] = useState("");
  const [modelText, setModelText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = settings.skills ?? [];
  const everything = allSkills(mine);
  const list = everything.filter((s) => (!category || categoryOf(s) === category) && (!filter.trim() || `${s.name} ${s.description} ${s.tags.join(" ")}`.toLowerCase().includes(filter.trim().toLowerCase())));

  const open = (s: Skill, fresh: boolean) => { setEditing(s); setIsNew(fresh); setTagText(s.tags.join(", ")); setModelText(s.models.join(", ")); setError(null); };
  const uniqueId = (name: string) => { const taken = new Set(allSkills(mine).map((x) => x.id)); let id = slug(name), n = 2; while (taken.has(id)) id = `${slug(name)}-${n++}`; return id; };
  const save = async () => {
    if (!editing) return;
    const s: Skill = { ...editing, builtin: undefined, tags: cleanTags(tagText.split(/[,\s]+/)), models: modelText.split(",").map((x) => x.trim()).filter(Boolean) };
    const bad = skillProblems(s);
    if (bad.length) { setError(`This skill cannot be saved: ${bad.join(", ")}.`); return; }
    const id = isNew || !s.id ? uniqueId(s.name) : s.id;
    await onSave({ skills: [...mine.filter((x) => x.id !== id), { ...s, id }] });
    setEditing(null);
  };
  const remove = async (id: string) => { await onSave({ skills: mine.filter((x) => x.id !== id) }); };
  const imported = async (f: File) => {
    const r = skillFromMarkdown(await f.text());
    if (typeof r === "string") { setError(`${f.name}: ${r}.`); return; }
    open({ ...r, id: uniqueId(r.name) }, true);
  };
  const exportSkill = (s: Skill) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([skillToMarkdown(s)], { type: "text/markdown" }));
    a.download = `${s.id}.md`; a.click(); URL.revokeObjectURL(a.href);
  };
  const setStep = (i: number, patch: Partial<Skill["steps"][number]>) => setEditing((e) => (e ? { ...e, steps: e.steps.map((x, k) => (k === i ? { ...x, ...patch } : x)) } : e));
  const move = (i: number, d: number) => setEditing((e) => { if (!e || i + d < 0 || i + d >= e.steps.length) return e; const steps = e.steps.slice(); [steps[i], steps[i + d]] = [steps[i + d], steps[i]]; return { ...e, steps }; });

  if (editing) {
    const size = skillSize(editing);
    return (
      <div>
        <h2>{isNew ? "New skill" : `Edit ${editing.name}`}</h2>
        <label className="small muted">Name</label>
        <input value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        <label className="small muted">Description</label>
        <input value={editing.description} maxLength={160} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
        <label className="small muted">Tags (up to {MAX_TAGS}, separated by commas)</label>
        <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="writing, study, code" />
        <label className="small muted">Shared rules, kept for every step</label>
        <textarea rows={3} value={editing.instructions} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
        <label className="small muted">Steps ({editing.steps.length} / {MAX_STEPS})</label>
        {editing.steps.map((st, i) => (
          <div key={i} className="skill-step">
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ flex: 1 }} value={st.title} placeholder={`Step ${i + 1} title`} onChange={(e) => setStep(i, { title: e.target.value })} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === editing.steps.length - 1} aria-label="Move down">↓</button>
              <button type="button" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, k) => k !== i) })} disabled={editing.steps.length === 1} aria-label="Remove the step">×</button>
            </div>
            <textarea rows={3} value={st.prompt} placeholder="What the model does in this step" onChange={(e) => setStep(i, { prompt: e.target.value })} />
          </div>
        ))}
        <button type="button" disabled={editing.steps.length >= MAX_STEPS} onClick={() => setEditing({ ...editing, steps: [...editing.steps, { title: "", prompt: "" }] })}>+ Add a step</button>
        <label className="small muted" style={{ display: "block", marginTop: 10 }}>Recommended models (ids, best first, optional)</label>
        <input value={modelText} onChange={(e) => setModelText(e.target.value)} placeholder="qwen3-4b-thinking-2507" />
        <p className="muted small">{size.label}</p>
        {error && <p className="error small">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary" onClick={() => void save()}>Save</button>
          <button onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="muted">A skill splits a task into small steps that run one after the other, so even a small model can do it. Type <code>/</code> in a chat to use one.</p>
      <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
        <input style={{ flex: 1 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search skills or #tags" />
        <button onClick={() => open(blank(), true)}>Create a skill</button>
        <button onClick={() => fileRef.current?.click()}>Import .md / .txt</button>
        <input ref={fileRef} type="file" accept=".md,.txt,text/markdown,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void imported(f); e.target.value = ""; }} />
      </div>
      <label className="check small"><input type="checkbox" checked={settings.skillAutoModel !== false} onChange={(e) => void onSave({ skillAutoModel: e.target.checked })} /> Switch to the model a skill recommends when it is installed</label>
      <div className="skill-cats">
        {SKILL_CATEGORIES.map((c) => {
          const n = everything.filter((s) => categoryOf(s) === c.id).length;
          return n === 0 ? null : (
            <button key={c.id} type="button" className={`skill-cat ${category === c.id ? "on" : ""}`} aria-pressed={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
              <span className="skill-cat-icon"><CategoryIcon id={c.id} /></span>
              <span className="skill-cat-name">{c.label}</span>
              <span className="muted">{n}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error small">{error}</p>}
      {list.map((s) => (
        <div key={s.id} className="skill-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{s.name}</strong>
            <span style={{ display: "flex", gap: 6 }}>
              {s.builtin
                ? <button onClick={() => open({ ...s, builtin: undefined, id: "" }, true)}>Duplicate</button>
                : <><button onClick={() => open(s, false)}>Edit</button><button onClick={() => void remove(s.id)}>Delete</button></>}
              <button onClick={() => exportSkill(s)}>Export</button>
            </span>
          </div>
          <div className="muted small">{s.description}</div>
          <div className="muted small">{s.steps.length} {s.steps.length === 1 ? "step" : "steps"} · {skillSize(s).label}</div>
          {s.tags.length > 0 && <div className="small">{s.tags.map((t) => `#${t}`).join(" ")}</div>}
        </div>
      ))}
      {!list.length && <p className="muted">No skill matches.</p>}
      <p style={{ marginTop: 18 }}><button className="link" onClick={onOpenDocs}>Read the full documentation to write your own skills →</button></p>
    </div>
  );
}
