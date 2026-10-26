import { isDynamicId } from "../core/dynamic";
import { DynamicSection } from "./DynamicCard";
import { useEffect, useState } from "react";
import { api } from "./api";
import { ICONS, IconButton } from "./Icon";
import type { CatalogItem } from "../shared/api";
import { CapBadges } from "./Capabilities";
import { RunsBadge } from "./RunsBadge";
import { ScoreChip } from "./ScoreChip";
import { scoreOf } from "../core/scores";
import { altNote, arrangeModels, isNativeNpu, placementOf, recommendedModels, type EngineFilter, type SortBy } from "../core/modelList";
import { Seg } from "./Seg";
import { SkeletonRows } from "./Skeleton";
import { Explore } from "./Explore";
import type { CatalogEntry, HardwareProfile, HfInspection, InstallProgress } from "../shared/types";

const isFoundry = (e: CatalogEntry) => e.id.startsWith("foundry:");

/** Which engine runs the model: the one thing the two kinds of cards must not be mistaken for. */
function EngineBadge({ foundry }: { foundry: boolean }) {
  return foundry
    ? <span className="badge engine foundry" title="Run by Microsoft Foundry Local, installed on this PC">Foundry Local</span>
    : <span className="badge engine geniex" title="Run by GenieX, Qualcomm's engine for the NPU">GenieX</span>;
}

function Badge({ level, foundry }: { level: "green" | "amber" | "red"; foundry?: boolean }) {
  // a Foundry Local model is not judged by the NPU fit rules: where it runs is the badge next to this one
  const label = foundry ? (level === "green" ? "Fits" : "Large") : level === "green" ? "Runs on NPU" : level === "amber" ? "Caution" : "Not recommended";
  return <span className={`badge ${level}`}>{label}</span>;
}

function InstallButton({ item, progress, onInstall, onCancel, onUninstall, onUse, selected }: {
  item: CatalogItem; progress?: InstallProgress; selected: boolean;
  onInstall: () => void; onCancel: () => void; onUninstall: () => void; onUse: () => void;
}) {
  const busy = progress && (progress.phase === "downloading" || progress.phase === "checking");
  if (busy) {
    return (
      <div className="install-progress">
        <div className="track smooth active"><div className={`fill ${progress.percent === null ? "indet" : ""}`} style={{ ["--p" as string]: (progress.percent ?? 5) / 100 }} /></div>
        <span className="small muted">{progress.percent !== null ? `${Math.round(progress.percent)}%` : progress.line ?? "Working…"}</span>
        <IconButton d={ICONS.close} label="Cancel" onClick={onCancel} />
      </div>
    );
  }
  if (item.installed) {
    return (
      <div className="row">
        <button className={selected ? "ghost" : "primary"} onClick={onUse}>{selected ? "In use" : "Use"}</button>
        <IconButton d={ICONS.trash} label="Uninstall" onClick={onUninstall} />
      </div>
    );
  }
  const warn = item.verdict.level === "red";
  return <button className={warn ? "ghost" : "primary"} onClick={onInstall}>{warn ? "Install anyway" : "Install"}</button>;
}

type Check = { phase: "testing" | "done" | "failed"; step?: string };

function Card({ item, progress, selected, check, ...rest }: { item: CatalogItem; progress?: InstallProgress; selected: boolean; check?: Check; onInstall: () => void; onCancel: () => void; onUninstall: () => void; onUse: () => void }) {
  const { entry, verdict } = item;
  return (
    <div className={`card ${item.hidden ? "dim" : ""}`}>
      <div className="card-top">
        <div>
          <div className="card-title">{entry.name} {entry.default && <span className="tag">default</span>}</div>
          <div className="muted small">{entry.role} · {entry.sizeApprox ? "~" : ""}{entry.sizeGB} GB · {isFoundry(entry) ? "Foundry Local (ONNX)" : entry.engine === "qairt" ? "native NPU bundle" : entry.quant ?? "GGUF"}</div>
        </div>
        <div className="row"><EngineBadge foundry={isFoundry(entry)} /><ScoreChip score={scoreOf(entry)} /><RunsBadge on={placementOf(item)} native={isNativeNpu(item)} /><Badge level={verdict.level} foundry={isFoundry(entry)} /></div>
      </div>
      {check?.phase === "testing" && <div className="muted small" role="status">Testing this model on your NPU to configure it for the best performance{check.step ? `: ${check.step}` : ""}…</div>}
      {check?.phase === "failed" && <div className="warn small">This model did not load on this PC under any setting. The log is in Settings, Developer, NPU load test.</div>}
      <CapBadges entry={entry} />
      <ul className="reasons">{verdict.reasons.filter((r) => !r.startsWith("NPU memory limit is an estimate")).slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul>
      <div className="card-foot">
        <div className="muted small">
          {verdict.estTokPerSec !== null && <span>~{verdict.estTokPerSec} tok/s · </span>}
          {entry.measured && <span>measured {entry.measured.tokPerSec} tok/s · </span>}
          {verdict.contextTokens > 0 && <span>{Math.round(verdict.contextTokens / 1024)}K context · </span>}
          <span>~{verdict.estNpuGB} GB NPU</span>
        </div>
        {progress?.error && <div className="error-box"><strong>{progress.error.title}</strong><div>{progress.error.fix}</div></div>}
        <InstallButton item={item} progress={progress} selected={selected} onInstall={rest.onInstall} onCancel={rest.onCancel} onUninstall={rest.onUninstall} onUse={rest.onUse} />
      </div>
      {entry.testNote && <div className="muted small note">{entry.testNote}</div>}
    </div>
  );
}

/** One model on one line: name, engine, where it runs, score, speed, size, and the button. Small enough to scan a long list. */
function ModelRow({ item, progress, selected, check, quiet, alt, ...rest }: { item: CatalogItem; progress?: InstallProgress; selected: boolean; check?: Check; quiet?: boolean; alt?: CatalogItem; onInstall: () => void; onCancel: () => void; onUninstall: () => void; onUse: () => void }) {
  const { entry } = item;
  const sc = scoreOf(entry);
  return (
    <div className={`mrow ${selected ? "selected" : ""}`}>
      <div className="mrow-name">
        <strong>{entry.name.replace(/\s*\(Foundry Local\)/i, "")}</strong>
        <div className="muted small">{entry.role}</div>
        {alt && <div className="small mrow-alt">{altNote(item, alt)}</div>}
      </div>
      <div className="mrow-badges">
        <EngineBadge foundry={isFoundry(entry)} />
        {!(quiet && !placementOf(item)) && <RunsBadge on={placementOf(item)} native={isNativeNpu(item)} />}
        <ScoreChip score={sc} />
      </div>
      <span className="mrow-speed muted small">{sc?.tokPerSec ? `${sc.tokPerSec} tok/s` : ""}</span>
      <span className="mrow-size muted small">{entry.sizeApprox ? "~" : ""}{entry.sizeGB} GB</span>
      <div className="mrow-act"><InstallButton item={item} progress={progress} selected={selected} onInstall={rest.onInstall} onCancel={rest.onCancel} onUninstall={rest.onUninstall} onUse={rest.onUse} /></div>
      {check?.phase === "testing" && <div className="mrow-note muted small" role="status">Testing this model on your NPU{check.step ? `: ${check.step}` : ""}…</div>}
      {check?.phase === "failed" && <div className="mrow-note warn small">This model did not load on this PC under any setting.</div>}
      {progress?.error && <div className="mrow-note error-box"><strong>{progress.error.title}</strong><div>{progress.error.fix}</div></div>}
    </div>
  );
}

export function Models({ items, hw, onChanged, onUse, selectedId, showK }: { items: CatalogItem[]; hw: HardwareProfile | null; onChanged: () => void; onUse: (id: string) => void; selectedId: string | null; showK: boolean }) {
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({});
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"curated" | "explore">("curated");
  const [exploreQuery, setExploreQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [inspect, setInspect] = useState<HfInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [engine, setEngine] = useState<EngineFilter>("all");
  const [installedOnly, setInstalledOnly] = useState(false);

  const [checks, setChecks] = useState<Record<string, Check>>({});
  useEffect(() => api().onModelCheck((p) => {
    setChecks((s) => ({ ...s, [p.ref]: { phase: p.phase, step: p.step } }));
    if (p.phase !== "testing") onChanged();
  }), [onChanged]);
  useEffect(() => api().onInstall((p) => {
    setProgress((s) => ({ ...s, [p.ref]: p }));
    if (p.phase === "done") onChanged();
  }), [onChanged]);

  const doInstall = (e: CatalogEntry) => { void api().install(e); };
  const actions = (item: CatalogItem) => ({
    onInstall: () => doInstall(item.entry),
    onCancel: () => void api().cancelInstall(item.ref),
    onUninstall: async () => {
      setErr(null);
      try {
        const r = await api().uninstall(item.entry);
        if (!r.ok) setErr(`Could not remove ${item.entry.name}: ${r.message || "unknown error"}`);
      } catch (e) { setErr(`Could not remove ${item.entry.name}: ${(e as Error).message}`); }
      onChanged();
    },
    onUse: () => onUse(item.entry.id)
  });

  /** Whatever was typed or pasted: a model (link, command, id) is opened and judged, a name searches every source. */
  const open = async (text: string) => {
    const q = text.trim();
    setErr(null); setNote(null); setInspect(null);
    if (!q) { setExploreQuery(""); setTab("explore"); return; }
    setBusy(true);
    try {
      const r = await api().resolveModel(q);
      if (r.type === "model") { setInspect(r.inspection); onChanged(); window.scrollTo?.({ top: 0, behavior: "smooth" }); }
      else { setExploreQuery(r.query); setNote(r.note); setTab("explore"); }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const search = () => open(query);

  // Plain words typed while exploring search as you type; links, commands and ids still wait for Enter.
  useEffect(() => {
    const q = query.trim();
    if (tab !== "explore" || /[/:\\]/.test(q)) return;
    const t = setTimeout(() => setExploreQuery(q), 350);
    return () => clearTimeout(t);
  }, [query, tab]);

  const shown = items.filter((i) => !i.hidden && !isDynamicId(i.entry.id));
  const mine = shown.filter((i) => !i.custom);
  const top = recommendedModels(mine);
  const everywhere = arrangeModels(mine, { sortBy: "score", engine: "all", installedOnly: false }).alt;
  const arranged = arrangeModels(mine, { sortBy, engine, installedOnly });
  const rest = arranged.tested.filter((i) => !top.some((t) => t.entry.id === i.entry.id));
  const hidden = items.filter((i) => i.hidden);
  const inspected = inspect?.entry ? items.find((i) => i.entry.id === inspect.entry!.id) : undefined;

  return (
    <div className="page">
      <h1>Models</h1>
      <p className="muted">Green runs fully on the NPU, amber works with a caveat, red is not expected to work.</p>

      <div className="searchbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Search every source, or paste any link, command or id" />
        <button className="primary" onClick={() => void search()} disabled={busy}>{busy ? "Checking…" : "Search"}</button>
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="notes">
        {hw?.npuBudgetSource === "estimated" && <div>NPU memory limit: {hw.npuBudgetGB} GB (estimated). Set the exact value in Settings.</div>}
        {note && <div>{note}</div>}
      </div>

      {inspect && (
        <section>
          <h2>{inspect.repo}</h2>
          {inspect.chosen && inspect.verdict && inspected && (
            <>
              <div className="notes">
                {inspect.files.length ? <>File: {inspect.chosen.path} ({inspect.chosen.sizeGB} GB){inspect.gguf ? ` · architecture ${inspect.gguf.architecture}` : ""}</>
                  : <>{inspect.chosen.quant === "native" ? "Native bundle" : `Version ${inspect.chosen.quant}`} · about {inspect.chosen.sizeGB} GB (estimated)</>}
              </div>
              {inspect.notes.length > 0 && <details className="notes"><summary>Details</summary>{inspect.notes.map((n, i) => <div key={i}>{n}</div>)}</details>}
              <Card item={inspected} progress={progress[inspected.ref]} check={checks[inspected.ref]} selected={selectedId === inspected.entry.id} {...actions(inspected)} />
            </>
          )}
        </section>
      )}

      <Seg role="tablist">
        <button className={tab === "curated" ? "on" : ""} onClick={() => setTab("curated")}>Tested models</button>
        <button className={tab === "explore" ? "on" : ""} onClick={() => setTab("explore")}>Explore all</button>
      </Seg>

      {tab === "explore" && <Explore query={exploreQuery} busy={busy} onOpen={(input) => void open(input)} />}

      {tab === "curated" && <><DynamicSection hw={hw} selectedId={selectedId} onUse={onUse} onChanged={onChanged} />

      {top.length > 0 && (
        <section>
          <h2>Recommended</h2>
          <p className="muted small">The tested models that are worth the download on this kind of PC: good answers, and fast enough. A model tested on both engines is shown once, on the faster one, and the line says so. Measured by Open NPU on a Snapdragon X Plus; a gap of a few points is not a ranking.</p>
          <div className="mlist">
            {top.map((i) => <ModelRow alt={everywhere[i.entry.id]} key={i.entry.id} item={i} progress={progress[i.ref]} check={checks[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}
          </div>
        </section>
      )}

      <section>
        <h2>All models</h2>
        <p className="muted small">"Not tested" means nobody measured where a model runs yet.</p>
        <div className="row small mlist-bar">
          <label>Sort by{" "}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="score">Best score</option>
              <option value="speed">Fastest</option>
              <option value="size">Smallest</option>
              <option value="name">Name</option>
            </select>
          </label>
          <div className="seg" role="group" aria-label="Engine">
            {([["all", "All"], ["geniex", "GenieX"], ["foundry", "Foundry Local"]] as const).map(([id, label]) => <button key={id} className={engine === id ? "on" : ""} onClick={() => setEngine(id)}>{label}</button>)}
          </div>
          <label className="check"><input type="checkbox" checked={installedOnly} onChange={(e) => setInstalledOnly(e.target.checked)} /> Installed only</label>
        </div>
        {items.length === 0 && <SkeletonRows count={6} card />}
        <div className="mlist">
          {rest.map((i) => <ModelRow alt={arranged.alt[i.entry.id]} key={i.entry.id} item={i} progress={progress[i.ref]} check={checks[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}
          {items.length > 0 && rest.length === 0 && <div className="muted small">{arranged.tested.length ? "The other tested models are the ones recommended above." : "No tested model matches this filter."}</div>}
        </div>
        {arranged.unscored.length > 0 && (
          <details className="section-fold">
            <summary>Not tested ({arranged.unscored.length}): no score yet</summary>
            <p className="muted small">They may work very well, but nobody measured them yet, and nothing here is recommended. Microsoft Foundry Local offers many models: only the ones in the lists above were tried.</p>
            <div className="mlist">{arranged.unscored.map((i) => <ModelRow quiet key={i.entry.id} item={i} progress={progress[i.ref]} check={checks[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}</div>
          </details>
        )}
      </section>

      {shown.some((i) => i.custom) && (
        <section>
          <h2>Your models</h2>
          <div className="mlist">
            {shown.filter((i) => i.custom).map((i) => <ModelRow key={i.entry.id} item={i} progress={progress[i.ref]} check={checks[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}
          </div>
        </section>
      )}

      {hidden.length > 0 && (
        <details className="section-fold">
          <summary>Known not to work ({hidden.length})</summary>
          <div className="grid">
            {hidden.map((i) => <Card key={i.entry.id} item={i} progress={progress[i.ref]} check={checks[i.ref]} selected={false} {...actions(i)} />)}
          </div>
        </details>
      )}</>}
    </div>
  );
}
