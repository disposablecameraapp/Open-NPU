import { useRef, useState, type ReactNode } from "react";
import type { Settings } from "../shared/types";
import { MAX_STEPS, MAX_TAGS, SKILL_CATEGORIES, categoryOf, cleanTags, skillFromMarkdown, skillProblems, skillSize, skillToMarkdown, slug, type Skill } from "../core/skills";
import { allSkills, defaultSkills } from "../core/skillsDefault";
import { MAX_LIBS, libSlug, libraryFromFile, libraryFromZipFile, readLibraryZip, type SkillLibrary, type ZipLibrary } from "../core/skillLibs";
import { api } from "./api";
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
  const [fetching, setFetching] = useState<string | null>(null);
  const [zip, setZip] = useState<{ lib: ZipLibrary; pick: string } | null>(null);
  const libFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = settings.skills ?? [];
  const removed = settings.removedSkills ?? [];
  const everything = allSkills(mine, removed);
  const uninstalled = defaultSkills().filter((s) => removed.includes(s.id));
  const list = everything.filter((s) => (!category || categoryOf(s) === category) && (!filter.trim() || `${s.name} ${s.description} ${s.tags.join(" ")}`.toLowerCase().includes(filter.trim().toLowerCase().replace(/^#/, ""))));

  const open = (s: Skill, fresh: boolean) => { setEditing(s); setIsNew(fresh); setTagText(s.tags.join(", ")); setModelText(s.models.join(", ")); setError(null); setPickIcon(false); setIconQuery(""); };
  const uniqueId = (name: string) => { const taken = new Set(everything.map((x) => x.id)); let id = slug(name), n = 2; while (taken.has(id)) id = `${slug(name)}-${n++}`; return id; };
  /** Public libraries are downloaded once, here, when the skill is saved or imported; the code is then kept with the skill. */
  const download = async (l: SkillLibrary): Promise<SkillLibrary | string> => {
    if (!l.url) return l;
    setFetching(l.name);
    const r = await api().fetchLibrary(l.url);
    setFetching(null);
    return r.ok ? { ...l, source: r.source, kind: r.kind } : `${l.name}: ${r.error}`;
  };
  const withLibraries = async (s: Skill): Promise<Skill | string> => {
    const libs: SkillLibrary[] = [];
    for (const l of s.libraries ?? []) {
      if (l.source.trim() || !l.url) { libs.push(l); continue; }
      const got = await download(l);
      if (typeof got === "string") return got;
      libs.push(got);
    }
    return { ...s, libraries: libs.length ? libs : undefined };
  };
  const addLibrary = (l: SkillLibrary) => setEditing((e) => (e ? { ...e, libraries: [...(e.libraries ?? []).filter((x) => x.name !== l.name), l] } : e));
  /** A library built or downloaded on this PC: a .js or .css file, or a zip that holds one. Nothing goes online. */
  const libraryFile = async (f: File) => {
    setError(null);
    if (/\.zip$/i.test(f.name)) {
      try {
        const z = await readLibraryZip(new Uint8Array(await f.arrayBuffer()));
        if (!z.best) { setError(`${f.name}: no .js or .css file (under 600 KB) in this zip.`); return; }
        setZip({ lib: z, pick: z.best });
      } catch { setError(`${f.name}: this zip cannot be read.`); }
      return;
    }
    const r = libraryFromFile(f.name, await f.text());
    if (typeof r === "string") setError(`${f.name}: ${r}`); else addLibrary(r);
  };
  const useZipFile = () => {
    if (!zip) return;
    const r = libraryFromZipFile(zip.lib, zip.pick);
    if (typeof r === "string") { setError(r); return; }
    addLibrary(r); setZip(null); setError(null);
  };
  const setLib = (i: number, patch: Partial<SkillLibrary>) => setEditing((e) => (e ? { ...e, libraries: (e.libraries ?? []).map((x, k) => (k === i ? { ...x, ...patch } : x)) } : e));
  const save = async () => {
    if (!editing) return;
    const first: Skill = { ...editing, builtin: undefined, tags: cleanTags(tagText.split(/[,\s]+/)), models: modelText.split(",").map((x) => x.trim()).filter(Boolean) };
    const got = await withLibraries(first);
    if (typeof got === "string") { setError(`This skill cannot be saved: ${got}`); return; }
    const s = got;
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
    const got = await withLibraries(r);
    if (typeof got === "string") { setError(`${f.name}: ${got}`); return; }
    open({ ...got, id: uniqueId(r.name) }, true);
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
        <label className="small muted">Load by itself when the request contains… (a regular expression, optional, e.g. \b(invoice|facture)\b). Leave empty to use the skill only with /.</label>
        <input value={editing.when ?? ""} onChange={(e) => setEditing({ ...editing, when: e.target.value || undefined })} placeholder="\b(word one|word two)\b" />
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
        <label className="small muted" style={{ display: "block", marginTop: 10 }}>Libraries ({(editing.libraries ?? []).length} / {MAX_LIBS}): public ones are downloaded once when you save, custom ones are pasted here. Pages that use them get the code inside the file.</label>
        {(editing.libraries ?? []).map((l, i) => (
          <div key={i} className="skill-step">
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ flex: 1 }} value={l.name} placeholder="name (letters, digits, dashes)" onChange={(e) => setLib(i, { name: libSlug(e.target.value) })} />
              <select value={l.kind} onChange={(e) => setLib(i, { kind: e.target.value as SkillLibrary["kind"] })} aria-label="Kind"><option value="js">JavaScript</option><option value="css">CSS</option></select>
              <button type="button" onClick={() => setEditing({ ...editing, libraries: (editing.libraries ?? []).filter((_, k) => k !== i) })} aria-label="Remove the library"><Glyph id="x" size={14} /></button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ flex: 1 }} value={l.url ?? ""} placeholder="https://… (public library, optional)" onChange={(e) => setLib(i, { url: e.target.value.trim() || undefined })} />
              <button type="button" disabled={!l.url || fetching === l.name} onClick={() => void download(l).then((g) => { if (typeof g === "string") setError(g); else { setError(null); setLib(i, g); } })}>{fetching === l.name ? "Downloading…" : "Download"}</button>
            </div>
            <input value={l.license ?? ""} placeholder="License (MIT, ISC…)" onChange={(e) => setLib(i, { license: e.target.value || undefined })} />
            <input value={l.use ?? ""} placeholder="How the model should use it, in one line" onChange={(e) => setLib(i, { use: e.target.value || undefined })} />
            <textarea rows={3} value={l.source} placeholder="The code (filled by Download, or paste your own)" onChange={(e) => setLib(i, { source: e.target.value })} />
            <span className="muted small">{l.source ? `${Math.round(l.source.length / 1000)} KB kept with the skill` : "No code yet"}</span>
          </div>
        ))}
        {zip && (
          <div className="skill-step">
            <span className="small">Which file of the zip does the page load? ({zip.lib.candidates.length} found, the best one is chosen)</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select style={{ flex: 1 }} value={zip.pick} onChange={(e) => setZip({ ...zip, pick: e.target.value })} aria-label="File of the zip">
                {zip.lib.candidates.map((c) => <option key={c.path} value={c.path}>{c.path} ({Math.round(c.size / 1000)} KB)</option>)}
              </select>
              <button type="button" className="primary" onClick={useZipFile}>Use this file</button>
              <button type="button" onClick={() => setZip(null)}>Cancel</button>
            </div>
          </div>
        )}
        <input ref={libFileRef} type="file" accept=".js,.css,.zip,application/zip,text/javascript,text/css" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void libraryFile(f); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={(editing.libraries ?? []).length >= MAX_LIBS} onClick={() => setEditing({ ...editing, libraries: [...(editing.libraries ?? []), { name: "", kind: "js", source: "" }] })}>+ Add a library</button>
          <button type="button" disabled={(editing.libraries ?? []).length >= MAX_LIBS} onClick={() => libFileRef.current?.click()}><Glyph id="upload" size={14} /> From a file or a zip on this PC</button>
        </div>
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
              <div className="skill-meta muted small">{s.steps.length} {s.steps.length === 1 ? "step" : "steps"} · {skillSize(s).short}{(s.libraries?.length ?? 0) > 0 && ` · ${s.libraries!.length} ${s.libraries!.length === 1 ? "library" : "libraries"}`}{s.tags.length > 0 && ` · ${s.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}`}</div>
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
          <p className="muted small">Installed with the app. Uninstall the ones you do not use; you can install them again here.</p>
          <div className="skill-list">{list.filter((s) => s.core).map(row)}</div>
          {uninstalled.length > 0 && (
            <div className="skills-core-off">
              <p className="muted small">Not installed</p>
              {uninstalled.map((s) => (
                <div key={s.id} className="skills-core-off-row">
                  <span>{s.name}</span>
                  <button type="button" className="linklike" onClick={() => void onSave({ removedSkills: removed.filter((x) => x !== s.id) })}>Install</button>
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
