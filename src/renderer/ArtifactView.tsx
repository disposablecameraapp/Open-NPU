import { useEffect, useMemo, useRef, useState, type SyntheticEvent, lazy, Suspense } from "react";
import { pageSpecOf } from "../core/page/html";
import type { ArtifactKind } from "../shared/types";
import { previewDocument, withNavShim } from "../core/artifacts";
import { Markdown } from "./Markdown";
import { Code, LiveCode } from "./Code";
import { Spark } from "./Activity";
import { useSmoothText } from "./useSmoothText";
import { api } from "./api";
import { isRunnable, missingModule } from "../core/runcode";
import { FileLike, bundleHtml, localName, mergeFiles, pageLinking } from "../core/bundle";
import { ArtifactEditor } from "./ArtifactEditor";
import { officePreview } from "../core/office";
import { figuresOfDeck, picFromData, wikiCredit, wikiFilesIn, type Pics } from "../core/slides";
import { figureKey } from "../core/figures";
import { figureImage } from "./figureImages";

const WIDTH_KEY = "open-npu.panelWidth";
const MIN_PANEL = 320;
const readWidth = (): number | null => { try { const n = Number(localStorage.getItem(WIDTH_KEY)); return n >= MIN_PANEL ? n : null; } catch { return null; } };

export interface ArtifactLike { title: string; kind: ArtifactKind; language: string; content: string }

const KIND_LABEL: Record<ArtifactKind, string> = { html: "Web page", svg: "Image", markdown: "Document", code: "Code", docx: "Word document", xlsx: "Excel workbook", pptx: "PowerPoint" };
export const kindLabel = (a: ArtifactLike) => (a.kind === "code" ? a.language : KIND_LABEL[a.kind]);

/** Preview / code viewer. HTML runs in a sandboxed frame without network access (see previewDocument). `files` are the chat's files: a page gets the stylesheet and script it links, and those files preview their page. */
const PageEditor = lazy(() => import("./PageEditor"));

export function ArtifactViewer({ artifact, files, live, onClose, onExport, onEdit }: { artifact: ArtifactLike; files?: FileLike[]; live?: boolean; onClose: () => void; onExport?: () => void; onEdit?: (content: string) => void }) {
  const home: FileLike | undefined = artifact.kind === "html" ? artifact : artifact.kind === "code" && files ? pageLinking(artifact, files) : undefined;
  // the pages of a site: a link or a location change inside the preview opens that page of the project in the same frame
  const [nav, setNav] = useState<FileLike | null>(null);
  const [trail, setTrail] = useState<FileLike[]>([]);
  const everything = useMemo(() => mergeFiles(files ?? [], [artifact]), [files, artifact]);
  const goTo = (href: string) => {
    const name = localName(href);
    const target = name ? everything.find((f) => f.kind === "html" && f.title.trim().split("/").pop()!.toLowerCase() === name) : undefined;
    if (!target) { setNotice(name ? `There is no page called ${name} in this project yet.` : null); return; }
    setNotice(null);
    setTrail((t) => [...t, nav ?? home ?? artifact]);
    setNav(target);
  };
  const goRef = useRef(goTo);
  goRef.current = goTo;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.data && typeof e.data.npuNav === "string") goRef.current(e.data.npuNav); };
    window.addEventListener("message", onMsg);
    const off = api().onSiteNav((to) => goRef.current(to));
    return () => { window.removeEventListener("message", onMsg); off(); };
  }, []);
  const page: FileLike | undefined = nav ?? home;
  const [launch, setLaunch] = useState<string | null>(null);
  const openInBrowser = async () => {
    setLaunch("Opening…");
    const r = await api().launchSite(everything, nav ?? home ?? artifact);
    setLaunch(r.error ? r.error : "Opened in your browser.");
    setTimeout(() => setLaunch(null), 4000);
  };
  const canPreview = artifact.kind !== "code" || !!page;
  // a page made from blocks can be edited block by block, in a visual editor loaded when it is first needed
  const blocksSpec = useMemo(() => (artifact.kind === "html" && !live && onEdit ? pageSpecOf(artifact.content) : null), [artifact.kind, artifact.content, live, onEdit]);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [tab, setTab] = useState<"preview" | "code" | "edit">(canPreview && !live ? "preview" : "code");
  // pictures of a presentation come from Wikimedia through the app (the window has no network of its own)
  const isOffice = artifact.kind === "xlsx" || artifact.kind === "pptx";
  const [pics, setPics] = useState<Pics>({});
  const wanted = artifact.kind === "pptx" && !live ? wikiFilesIn(artifact.content).join("\n") : "";
  useEffect(() => {
    let off = false;
    for (const f of wanted ? wanted.split("\n") : []) void api().wikimediaImage(f).then((w) => { const p = w && picFromData(w.dataUrl, wikiCredit(w)); if (p && !off) setPics((v) => ({ ...v, [f]: p })); }).catch(() => undefined);
    return () => { off = true; };
  }, [wanted]);
  // a diagram or chart block on a slide is drawn by the window and shown as a picture
  const figs = artifact.kind === "pptx" && !live ? figuresOfDeck(artifact.content).map((f) => ({ key: figureKey(f.lang, f.raw), lang: f.lang, raw: f.raw })) : [];
  const figSig = figs.map((f) => f.key).join("\n");
  useEffect(() => {
    let off = false;
    void (async () => {
      for (const f of figs) {
        const v = await figureImage(f);
        const p = v ? picFromData(v, "") : null;
        if (p && !off) setPics((all) => ({ ...all, [f.key]: p }));
      }
    })();
    return () => { off = true; };
  }, [figSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);
  // the panel's width: dragged by its left edge, kept for next time, double-click to go back to the default
  const [width, setWidth] = useState<number | null>(readWidth);
  const panel = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const room = () => Math.max(MIN_PANEL, (panel.current?.parentElement?.clientWidth ?? 1200) - 340);
  const clampW = (w: number) => Math.round(Math.min(room(), Math.max(MIN_PANEL, w)));
  const grip = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !panel.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const dragTo = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !panel.current) return;
    setWidth(clampW(panel.current.getBoundingClientRect().right - e.clientX));
  };
  const drop = () => { setDragging(false); if (width) try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* not kept */ } };
  const gripKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const now = width ?? panel.current?.getBoundingClientRect().width ?? 600;
    const next = clampW(now + (e.key === "ArrowLeft" ? 40 : -40));
    setWidth(next);
    try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* not kept */ }
  };
  const [nonce, setNonce] = useState(0);
  // running the code on this computer (Python, JavaScript)
  const [run, setRun] = useState<{ id: string; out: string; state: "idle" | "running" | "done" | "failed"; note?: string } | null>(null);
  const [typed, setTyped] = useState("");
  const runnable = artifact.kind === "code" && isRunnable(artifact.language) && !live;
  useEffect(() => api().onRun((e) => setRun((r) => {
    if (!r || e.runId !== r.id) return r;
    if (e.type === "out") return { ...r, out: (r.out + e.text).slice(-40_000) };
    return { ...r, state: e.error || (e.code && !e.stopped) ? "failed" : "done", note: e.error ?? (e.stopped ? "Stopped." : e.code ? `Exited with code ${e.code}.` : "Finished.") };
  })), []);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => () => { if (runRef.current?.state === "running") void api().stopRun(runRef.current.id); }, []);
  const startRun = () => {
    const id = crypto.randomUUID();
    setRun({ id, out: "", state: "running" });
    void api().runCode(id, artifact.language, artifact.content);
  };
  /** A terminal command: its output follows what the console already shows. */
  const startCommand = (command: string): string => {
    const id = crypto.randomUUID();
    setRun((r) => ({ id, out: r?.out ? `${r.out}${r.out.endsWith("\n") ? "" : "\n"}` : "", state: "running" }));
    void api().runCommand(id, command);
    return id;
  };
  // a missing package installed from the console: once pip is done the program runs again
  const rerunAfter = useRef<string | null>(null);
  useEffect(() => {
    if (!run || run.state === "running" || run.state === "idle" || run.id !== rerunAfter.current) return;
    rerunAfter.current = null;
    if (run.state === "done") startRun();
  }, [run?.state, run?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = run && run.state === "failed" ? missingModule(run.out) : null;
  const installAndRun = () => {
    if (!missing) return;
    rerunAfter.current = startCommand(`pip install ${missing.pip}`);
  };
  const submitTyped = () => {
    const line = typed.trim();
    if (!run) return;
    setTyped("");
    if (run.state === "running") { void api().writeRun(run.id, typed); return; }
    if (line) startCommand(line);
  };
  const consoleEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "end" }); }, [run?.out]);
  // while it is written the code streams in word by word; the finished page then shows as a preview
  useEffect(() => { setTab(live || !canPreview ? "code" : "preview"); }, [live, canPreview]);
  const tabNow = tab === "edit" && onEdit ? "edit" : canPreview ? (tab === "edit" ? "preview" : tab) : "code";
  const frame = useRef<HTMLIFrameElement>(null);
  // the code on screen: revealed at an even pace while it is being written
  const smooth = useSmoothText(artifact.content, !!live);
  const typing = !!live || smooth.length < artifact.content.length;
  const isPage = artifact.kind === "html" || artifact.kind === "svg" || isOffice || !!page;
  const doc = useMemo(() => (page ? withNavShim(previewDocument("html", bundleHtml(page.content, files ?? []).html)) : isOffice ? previewDocument("html", officePreview(artifact.kind as "xlsx" | "pptx", artifact.content, pics)) : isPage ? previewDocument("svg", artifact.content) : ""), [artifact.kind, artifact.content, page, files, isPage, isOffice, pics]);
  // The frame page (public/artifact-frame.html) has its own network-blocking CSP and renders whatever it is sent.
  // While the file is being written the page is redrawn at most every ~0.9 s, so the preview builds up in front of the reader.
  const [shown, setShown] = useState(doc);
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => { if (!live) setShown(doc); }, [doc, live]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setShown(docRef.current), 900);
    return () => clearInterval(t);
  }, [live]);
  // A frame renders one page (writing a page into it also drops its message listener), so every new page gets a fresh frame.
  // The new frame is laid over the old one, invisible, and fades in once it has had the page: no white flash between versions.
  const [slots, setSlots] = useState<{ key: number; html: string; ready: boolean }[]>([]);
  const slotKey = useRef(0);
  const posted = useRef(new Set<number>());
  const push = (html: string) => setSlots((v) => [...v.filter((x) => x.ready).slice(-1), { key: ++slotKey.current, html, ready: false }]);
  const lastShown = useRef<string | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (!isPage || tabNow !== "preview") { setSlots([]); posted.current.clear(); lastShown.current = null; return; }
    if (lastShown.current === shown) return;
    lastShown.current = shown;
    push(shown);
  }, [shown, tabNow, isPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (nonce) push(shownRef.current); }, [nonce]);
  // each frame gets its page once: writing the page ends in a load event of the same frame, which must not post it again
  const onFrame = (slot: { key: number; html: string }) => (e: SyntheticEvent<HTMLIFrameElement>) => {
    if (posted.current.has(slot.key)) return;
    posted.current.add(slot.key);
    e.currentTarget.contentWindow?.postMessage({ html: slot.html }, "*");
    // a finished page gets the keyboard at once (arrow keys of a game), a page still being written must not take it from the chat
    if (!live) { const fr = e.currentTarget; setTimeout(() => { try { fr.focus(); fr.contentWindow?.focus(); } catch { /* not allowed */ } }, 200); }
    setTimeout(() => setSlots((v) => v.map((x) => (x.key === slot.key ? { ...x, ready: true } : x))), 180);
    setTimeout(() => setSlots((v) => { const i = v.findIndex((x) => x.key === slot.key); return i > 0 ? v.slice(i) : v; }), 700);
  };
  // follow the new code while it is written, unless the reader scrolled up
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = body.current; if (live && tabNow === "code" && follow.current && el) el.scrollTop = el.scrollHeight; }, [smooth, live, tabNow]);
  return (
    <div ref={panel} className={`artifact-panel ${live ? "writing" : ""} ${dragging ? "resizing" : ""}`} style={width ? { width: Math.min(width, room()) } : undefined}>
      <div className="panel-grip" role="separator" aria-orientation="vertical" aria-label="Resize the panel" tabIndex={0}
        onPointerDown={grip} onPointerMove={dragTo} onPointerUp={drop} onPointerCancel={drop} onKeyDown={gripKey}
        onDoubleClick={() => { setWidth(null); try { localStorage.removeItem(WIDTH_KEY); } catch { /* not kept */ } }} />
      <div className="artifact-head">
        <div className="artifact-title"><strong>{nav ? nav.title : artifact.title || "Untitled"}</strong><span className="muted small">{kindLabel(artifact)}{live ? <> · <span className="panel-status"><Spark size={12} /> writing</span></> : ""}</span></div>
        {canPreview && (
          <div className="seg">
            <button className={tabNow === "preview" ? "on" : ""} onClick={() => setTab("preview")}>Preview</button>
            <button className={tabNow === "code" ? "on" : ""} onClick={() => setTab("code")}>{artifact.kind === "code" || artifact.kind === "html" || artifact.kind === "svg" ? "Code" : "Text"}</button>
          </div>
        )}
        <div className="spacer" />
        {artifact.kind === "code" && !live && !run && <button className="linkbtn" onClick={() => setRun({ id: "", out: "", state: "idle" })} title="Open a terminal to install packages (pip install ...) or run commands">⌨ Terminal</button>}
        {runnable && (run?.state === "running"
          ? <button className="linkbtn danger-link" onClick={() => void api().stopRun(run.id)}>■ Stop</button>
          : <button className="linkbtn run-btn" onClick={startRun} title="Runs this file on your computer">▶ Run</button>)}
        {nav && tabNow === "preview" && <button className="linkbtn" onClick={() => { const back = trail[trail.length - 1]; setTrail((t) => t.slice(0, -1)); setNav(back && back !== (home ?? artifact) ? back : null); }} title="Back to the previous page">← Back</button>}
        {isPage && !live && <button className="linkbtn" onClick={openInBrowser} title="Opens the whole site, with its files, in your browser">Open in browser</button>}
        {isPage && !live && tabNow === "preview" && <button className="linkbtn" onClick={() => setNonce((n) => n + 1)}>Reload</button>}
        {blocksSpec && <button className="linkbtn" onClick={() => setBlocksOpen(true)} title="Move, add and change the blocks of the page in a visual editor">Edit blocks</button>}
        {onEdit && !live && tabNow !== "edit" && <button className="linkbtn" onClick={() => setTab("edit")} title="Change the text yourself">Edit</button>}
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(artifact.content); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        {onExport && <button className="linkbtn" onClick={onExport} disabled={live}>Save as…</button>}
        <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {blocksOpen && blocksSpec && onEdit && <Suspense fallback={<div className="page-editor muted" style={{ display: "grid", placeItems: "center" }}>Loading the editor…</div>}><PageEditor spec={blocksSpec} onSave={onEdit} onClose={() => setBlocksOpen(false)} /></Suspense>}
      {(launch || notice) && <div className="panel-note muted small" role="status">{launch ?? notice}</div>}
      <div className="artifact-body" ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {tabNow === "edit" && onEdit ? (
          <ArtifactEditor kind={artifact.kind} value={artifact.content} onCancel={() => setTab(canPreview ? "preview" : "code")} onSave={(t) => { onEdit(t); setTab(canPreview ? "preview" : "code"); }} />
        ) : tabNow === "code" ? (
          <pre className="artifact-code">{typing ? <><LiveCode text={smooth} />{live && <span className="caret-block" />}</> : <Code text={artifact.content} lang={artifact.language} />}</pre>
        ) : artifact.kind === "markdown" || artifact.kind === "docx" ? (
          <div className="artifact-doc assistant"><Markdown text={smooth} streaming={typing} /></div>
        ) : (
          <div className="frame-stack">
            {slots.map((x) => <iframe key={x.key} title={artifact.title} className={`artifact-frame ${x.ready ? "ready" : ""}`} sandbox="allow-scripts" src="./artifact-frame.html" onLoad={onFrame(x)} />)}
          </div>
        )}
      </div>
      {run && (
        <div className="run-console">
          <div className="run-head">
            <span>{run.state === "running" ? <><span className="spin" /> Running…</> : run.state === "failed" ? "⚠ Failed" : run.state === "idle" ? "⌨ Terminal" : "✓ Finished"}</span>
            {run.note && <span className="muted small">{run.note}</span>}
            <span className="spacer" />
            <button className="linkbtn" onClick={() => { if (run.state === "running") void api().stopRun(run.id); setRun(null); }}>Close</button>
          </div>
          <pre className="run-out">{run.out || (run.state === "running" ? "No output yet. A program with a window shows it on your screen." : run.state === "idle" ? "Commands run here with the same Python as your programs, e.g. pip install requests" : "(no output)")}<div ref={consoleEnd} /></pre>
          {missing && <div className="run-missing"><span>The package <code>{missing.pip}</code> is missing.</span> <button className="linkbtn run-btn" onClick={installAndRun}>Install it and run again</button></div>}
          <form className="run-input" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
            <span className="muted">{run.state === "running" ? "↵" : ">"}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoComplete="off"
              placeholder={run.state === "running" ? "Answer the program (input())… Enter to send" : "Type a command (pip install …) and press Enter"} aria-label="Terminal input" />
          </form>
        </div>
      )}
    </div>
  );
}
