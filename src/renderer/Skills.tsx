import { useRef, useState, type ReactNode } from "react";
import type { Settings } from "../shared/types";
import { MAX_STEPS, MAX_TAGS, SKILL_CATEGORIES, categoryOf, cleanTags, skillFromMarkdown, skillProblems, skillSize, skillToMarkdown, slug, type Skill } from "../core/skills";
import { allSkills, defaultSkills } from "../core/skillsDefault";
import { CATEGORY_ICON, Glyph, iconById, searchIcons } from "./skillIcons";

const blank = (): Skill => ({ id: "", name: "", description: "", tags: [], instructions: "", steps: [{ title: "", prompt: "" }], models: [] });
/** What a skill shows as its icon: the one it chose, else the one of its category. */
const iconOf = (s: Pick<Skill, "icon" | "tags">) => (iconById(s.icon) ? s.icon! : CATEGORY_ICON[categoryOf(s)]);

export function Skills({ settings, onSave, onOpenDocs, tabs }: { tabs?: ReactNode; settings: Settings; onSave: (patch: Partial<Settings>) => Promise<void>; onOpenDocs: () => void }) {
  const [editing, setEditing] = useState<Skill | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tagText, setTagText] = useState("");
  const [modelText, setModelText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [pickIcon, setPickIcon] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = settings.skills ?? [];
  const removed = settings.removedSkills ?? [];
  const everything = allSkills(mine, removed);
  const uninstalled = defaultSkills().filter((s) => removed.includes(s.id));
  const list = everything.filter((s) => (!category || categoryOf(s) === category) && (!filter.trim() || `${s.name} ${s.description} ${s.tags.join(" ")}`.toLowerCase().includes(filter.trim().toLowerCase().replace(/^#/, ""))));

  const open = (s: Skill, fresh: boolean) => { setEditing(s); setIsNew(fresh); setTagText(s.tags.join(", ")); setModelText(s.models.join(", ")); setError(null); setPickIcon(false); setIconQuery(""); };
  const uniqueId = (name: string) => { const taken = new Set(everything.map((x) => x.id)); let id = slug(name), n = 2; while (taken.has(id)) id = `${slug(name)}-${n++}`; return id; };
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
    const shown = iconOf({ icon: editing.icon, tags: cleanTags(tagText.split(/[,\s]+/)) });
    const found = searchIcons(iconQuery);
    return (
      <div className="skills-wrap edit">
        <h2>{isNew ? "New skill" : `Edit ${editing.name}`}</h2>
        <div className="skill-head">
          <button type="button" className="skill-icon big" onClick={() => setPickIcon(!pickIcon)} aria-expanded={pickIcon} title="Choose an icon"><Glyph id={shown} size={28} /></button>
          <div style={{ flex: 1 }}>
            <input value={editing.name} maxLength={60} placeholder="Name" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <input value={editing.description} maxLength={160} placeholder="What it does, in one sentence" onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
        </div>
        {pickIcon && (
          <div className="icon-picker">
            <input autoFocus value={iconQuery} onChange={(e) => setIconQuery(e.target.value)} placeholder={`Search ${iconQuery ? "" : "the library: code, study, food, money…"}`} />
            <div className="icon-grid">
              {found.map((i) => (
                <button key={i.id} type="button" className={`skill-icon ${editing.icon === i.id ? "on" : ""}`} title={i.label} aria-label={i.label} onClick={() => { setEditing({ ...editing, icon: i.id }); setPickIcon(false); }}><Glyph id={i.id} /></button>
              ))}
              {!found.length && <span className="muted small">No icon matches.</span>}
            </div>
            {editing.icon && <button type="button" className="link small" onClick={() => setEditing({ ...editing, icon: undefined })}>Use the icon of its category</button>}
          </div>
        )}
        <label className="small muted">Tags (up to {MAX_TAGS}, separated by commas). They also decide its category.</label>
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
              <button type="button" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, k) => k !== i) })} disabled={editing.steps.length === 1} aria-label="Remove the step"><Glyph id="x" size={14} /></button>
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
          <button type="button" style={{ marginLeft: "auto" }} onClick={() => {
            const s: Skill = { ...editing, builtin: undefined, tags: cleanTags(tagText.split(/[,\s]+/)), models: modelText.split(",").map((x) => x.trim()).filter(Boolean) };
            const bad = skillProblems(s);
            if (bad.length) setError(`This skill cannot be exported yet: ${bad.join(", ")}.`); else { setError(null); exportSkill({ ...s, id: s.id || slug(s.name) }); }
          }}><Glyph id="download" size={14} /> Export as .md</button>
        </div>
      </div>
    );
  }

  const row = (s: Skill) => (
  <div key={s.id} className={`skill-row${s.core ? " core" : ""}`}>
            <span className="skill-icon" title={SKILL_CATEGORIES.find((c) => c.id === categoryOf(s))?.label}><Glyph id={iconOf(s)} /></span>
            <div className="skill-main">
              <div className="skill-title">{s.name}{s.builtin && <span className="muted small"> · built in</span>}</div>
              <div className="skill-desc">{s.description}</div>
              <div className="skill-meta muted small">{s.steps.length} {s.steps.length === 1 ? "step" : "steps"} · {skillSize(s).short}{s.tags.length > 0 && ` · ${s.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}`}</div>
            </div>
            <div className="skill-actions">
              {s.core && <button type="button" className="icon-btn" title="Uninstall" aria-label="Uninstall" onClick={() => void onSave({ removedSkills: [...removed, s.id] })}><Glyph id="trash" size={16} /></button>}
              {s.builtin
                ? <button type="button" className="icon-btn" title="Duplicate to edit" aria-label="Duplicate to edit" onClick={() => open({ ...s, builtin: undefined, id: "" }, true)}><Glyph id="copy" size={16} /></button>
                : <>
                  <button type="button" className="icon-btn" title="Edit" aria-label="Edit" onClick={() => open(s, false)}><Glyph id="pen" size={16} /></button>
                  <button type="button" className="icon-btn" title="Delete" aria-label="Delete" onClick={() => void remove(s.id)}><Glyph id="trash" size={16} /></button>
                </>}
              <button type="button" className="icon-btn" title="Export as .md" aria-label="Export as .md" onClick={() => exportSkill(s)}><Glyph id="download" size={16} /></button>
            </div>
          </div>
  );

  return (
    <div className="skills-wrap">
      <div className="skills-bar">
        {tabs}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search skills or #tags" />
        <div className="menu-anchor">
          <button type="button" className="icon-btn primary" onClick={() => setAddMenu(!addMenu)} aria-haspopup="menu" aria-expanded={addMenu} title="Add a skill" aria-label="Add a skill"><Glyph id="plus" size={18} /></button>
          {addMenu && (
            <div className="add-menu" role="menu" onMouseLeave={() => setAddMenu(false)}>
              <button role="menuitem" onClick={() => { setAddMenu(false); open(blank(), true); }}><Glyph id="pen" size={16} /> Create a skill</button>
              <button role="menuitem" onClick={() => { setAddMenu(false); fileRef.current?.click(); }}><Glyph id="upload" size={16} /> Import a .md or .txt file</button>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".md,.txt,text/markdown,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void imported(f); e.target.value = ""; }} />
      </div>
      <div className="skill-cats">
        {SKILL_CATEGORIES.map((c) => {
          const n = everything.filter((s) => categoryOf(s) === c.id).length;
          return n === 0 ? null : (
            <button key={c.id} type="button" className={`skill-cat ${category === c.id ? "on" : ""}`} aria-pressed={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
              <Glyph id={CATEGORY_ICON[c.id]} size={18} />
              <span className="skill-cat-name">{c.label}</span>
              <span className="muted small">{n}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="skill-list">
        {list.filter((s) => !s.core).map(row)}
        {!list.length && <p className="muted">No skill matches.</p>}
      </div>
      {(list.some((s) => s.core) || (!filter.trim() && !category && uninstalled.length > 0)) && (
        <section className="skills-core" aria-label="Default skills">
          <h3>Default skills</h3>
          <p className="muted small">Installed with the app. Uninstall the ones you do not use; you can put them back here.</p>
          <div className="skill-list">{list.filter((s) => s.core).map(row)}</div>
          {uninstalled.length > 0 && (
            <div className="skills-core-off">
              <p className="muted small">Uninstalled</p>
              {uninstalled.map((s) => (
                <div key={s.id} className="skills-core-off-row">
                  <span>{s.name}</span>
                  <button type="button" className="linklike" onClick={() => void onSave({ removedSkills: removed.filter((x) => x !== s.id) })}>Reinstall</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <label className="check small"><input type="checkbox" checked={settings.skillAutoModel !== false} onChange={(e) => void onSave({ skillAutoModel: e.target.checked })} /> Switch to the model a skill recommends when it is installed</label>
      <p style={{ marginTop: 14 }}><button className="linklike" onClick={onOpenDocs}>Read the full documentation to write your own skills →</button></p>
    </div>
  );
}
