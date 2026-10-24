import { useEffect, useState } from "react";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import { CapBadges } from "./Capabilities";
import { Explore } from "./Explore";
import type { CatalogEntry, HardwareProfile, HfInspection, InstallProgress } from "../shared/types";

function Badge({ level }: { level: "green" | "amber" | "red" }) {
  const label = level === "green" ? "Runs on NPU" : level === "amber" ? "Caution" : "Not recommended";
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
        <div className="track"><div className="fill" style={{ width: `${progress.percent ?? 5}%` }} /></div>
        <span className="small muted">{progress.percent !== null ? `${Math.round(progress.percent)}%` : progress.line ?? "Working…"}</span>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  if (item.installed) {
    return (
      <div className="row">
        <button className={selected ? "ghost" : "primary"} onClick={onUse}>{selected ? "In use" : "Use"}</button>
        <button className="ghost" onClick={onUninstall}>Uninstall</button>
      </div>
    );
  }
  const warn = item.verdict.level === "red";
  return <button className={warn ? "ghost" : "primary"} onClick={onInstall}>{warn ? "Install anyway" : "Install"}</button>;
}

function Card({ item, progress, selected, ...rest }: { item: CatalogItem; progress?: InstallProgress; selected: boolean; onInstall: () => void; onCancel: () => void; onUninstall: () => void; onUse: () => void }) {
  const { entry, verdict } = item;
  return (
    <div className={`card ${item.hidden ? "dim" : ""}`}>
      <div className="card-top">
        <div>
          <div className="card-title">{entry.name} {entry.default && <span className="tag">default</span>}</div>
          <div className="muted small">{entry.role} · {entry.sizeApprox ? "~" : ""}{entry.sizeGB} GB · {entry.engine === "qairt" ? "native NPU bundle" : entry.quant ?? "GGUF"}</div>
        </div>
        <Badge level={verdict.level} />
      </div>
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
        <InstallButton item={item} progress={progress} selected={selected} {...rest} />
      </div>
      {entry.testNote && <div className="muted small note">{entry.testNote}</div>}
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

  useEffect(() => api().onInstall((p) => {
    setProgress((s) => ({ ...s, [p.ref]: p }));
    if (p.phase === "done") onChanged();
  }), [onChanged]);

  const doInstall = (e: CatalogEntry) => { void api().install(e); };
  const actions = (item: CatalogItem) => ({
    onInstall: () => doInstall(item.entry),
    onCancel: () => void api().cancelInstall(item.ref),
    onUninstall: async () => { await api().uninstall(item.entry); onChanged(); },
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

  const shown = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);
  const inspected = inspect?.entry ? items.find((i) => i.entry.id === inspect.entry!.id) : undefined;

  return (
    <div className="page">
      <h1>Models</h1>
      <p className="muted">Green runs fully on the NPU. Amber works with a caveat. Red is not expected to work, but you can still install it.</p>

      <div className="searchbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Search every source, or paste any link, command or id (Hugging Face, Docker Hub, ModelScope, AI Hub…)" />
        <button className="primary" onClick={() => void search()} disabled={busy}>{busy ? "Checking…" : "Search"}</button>
      </div>
      {hw?.npuBudgetSource === "estimated" && <div className="warn small">The NPU memory limit ({hw.npuBudgetGB} GB) is an estimate, about half of RAM. Enter the real number from Task Manager in Settings so the badges are exact.</div>}
      {err && <div className="error-box">{err}</div>}
      {note && <div className="warn small">{note}</div>}
      {!showK && <div className="muted small">K-quants and IQ quants are hidden (they push work onto the CPU). Enable them in Settings.</div>}

      {inspect && (
        <section>
          <h2>{inspect.repo}</h2>
          {inspect.notes.map((n, i) => <div key={i} className="muted small">{n}</div>)}
          {inspect.chosen && inspect.verdict && inspected && (
            <>
              <div className="muted small">
                {inspect.files.length ? <>File: {inspect.chosen.path} ({inspect.chosen.sizeGB} GB){inspect.gguf ? ` · architecture ${inspect.gguf.architecture}` : ""}</>
                  : <>{inspect.chosen.quant === "native" ? "Native bundle" : `Version ${inspect.chosen.quant}`} · about {inspect.chosen.sizeGB} GB (estimated)</>}
              </div>
              <Card item={inspected} progress={progress[inspected.ref]} selected={selectedId === inspected.entry.id} {...actions(inspected)} />
            </>
          )}
        </section>
      )}

      <div className="seg" role="tablist">
        <button className={tab === "curated" ? "on" : ""} onClick={() => setTab("curated")}>Tested models</button>
        <button className={tab === "explore" ? "on" : ""} onClick={() => setTab("explore")}>Explore all</button>
      </div>

      {tab === "explore" && <Explore query={exploreQuery} busy={busy} onOpen={(input) => void open(input)} />}

      {tab === "curated" && <><section>
        <h2>Curated, tested on a Surface Laptop 7</h2>
        <div className="grid">
          {shown.filter((i) => !i.custom).map((i) => <Card key={i.entry.id} item={i} progress={progress[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}
        </div>
      </section>

      {shown.some((i) => i.custom) && (
        <section>
          <h2>Your models</h2>
          <div className="grid">
            {shown.filter((i) => i.custom).map((i) => <Card key={i.entry.id} item={i} progress={progress[i.ref]} selected={selectedId === i.entry.id} {...actions(i)} />)}
          </div>
        </section>
      )}

      {hidden.length > 0 && (
        <details className="section-fold">
          <summary>Known not to work ({hidden.length})</summary>
          <div className="grid">
            {hidden.map((i) => <Card key={i.entry.id} item={i} progress={progress[i.ref]} selected={false} {...actions(i)} />)}
          </div>
        </details>
      )}</>}
    </div>
  );
}
