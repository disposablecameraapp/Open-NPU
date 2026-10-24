import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { ArtifactKind } from "../shared/types";
import { previewDocument } from "../core/artifacts";
import { Markdown } from "./Markdown";
import { Code, LiveCode } from "./Code";
import { Spark } from "./Activity";
import { useSmoothText } from "./useSmoothText";
import { api } from "./api";
import { isRunnable } from "../core/runcode";
import { FileLike, bundleHtml, pageLinking } from "../core/bundle";

export interface ArtifactLike { title: string; kind: ArtifactKind; language: string; content: string }

const KIND_LABEL: Record<ArtifactKind, string> = { html: "Web page", svg: "Image", markdown: "Document", code: "Code" };
export const kindLabel = (a: ArtifactLike) => (a.kind === "code" ? a.language : KIND_LABEL[a.kind]);

/** Preview / code viewer. HTML runs in a sandboxed frame without network access (see previewDocument). `files` are the chat's files: a page gets the stylesheet and script it links, and those files preview their page. */
export function ArtifactViewer({ artifact, files, live, onClose, onExport }: { artifact: ArtifactLike; files?: FileLike[]; live?: boolean; onClose: () => void; onExport?: () => void }) {
  const page: FileLike | undefined = artifact.kind === "html" ? artifact : artifact.kind === "code" && files ? pageLinking(artifact, files) : undefined;
  const canPreview = artifact.kind !== "code" || !!page;
  const [tab, setTab] = useState<"preview" | "code">(canPreview && !live ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);
  // running the code on this computer (Python, JavaScript)
  const [run, setRun] = useState<{ id: string; out: string; state: "running" | "done" | "failed"; note?: string } | null>(null);
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
  const consoleEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "end" }); }, [run?.out]);
  // while it is written the code streams in word by word; the finished page then shows as a preview
  useEffect(() => { setTab(live || !canPreview ? "code" : "preview"); }, [live, canPreview]);
  const tabNow = canPreview ? tab : "code";
  const frame = useRef<HTMLIFrameElement>(null);
  // the code on screen: revealed at an even pace while it is being written
  const smooth = useSmoothText(artifact.content, !!live);
  const typing = !!live || smooth.length < artifact.content.length;
  const isPage = artifact.kind === "html" || artifact.kind === "svg" || !!page;
  const doc = useMemo(() => (page ? previewDocument("html", bundleHtml(page.content, files ?? []).html) : isPage ? previewDocument("svg", artifact.content) : ""), [artifact.kind, artifact.content, page, files, isPage]);
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
    setTimeout(() => setSlots((v) => v.map((x) => (x.key === slot.key ? { ...x, ready: true } : x))), 180);
    setTimeout(() => setSlots((v) => { const i = v.findIndex((x) => x.key === slot.key); return i > 0 ? v.slice(i) : v; }), 700);
  };
  // follow the new code while it is written, unless the reader scrolled up
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = body.current; if (live && tabNow === "code" && follow.current && el) el.scrollTop = el.scrollHeight; }, [smooth, live, tabNow]);
  return (
    <div className={`artifact-panel ${live ? "writing" : ""}`}>
      <div className="artifact-head">
        <div className="artifact-title"><strong>{artifact.title || "Untitled"}</strong><span className="muted small">{kindLabel(artifact)}{live ? <> · <span className="panel-status"><Spark size={12} /> writing</span></> : ""}</span></div>
        {canPreview && (
          <div className="seg">
            <button className={tabNow === "preview" ? "on" : ""} onClick={() => setTab("preview")}>Preview</button>
            <button className={tabNow === "code" ? "on" : ""} onClick={() => setTab("code")}>Code</button>
          </div>
        )}
        <div className="spacer" />
        {runnable && (run?.state === "running"
          ? <button className="linkbtn danger-link" onClick={() => void api().stopRun(run.id)}>■ Stop</button>
          : <button className="linkbtn run-btn" onClick={startRun} title="Runs this file on your computer">▶ Run</button>)}
        {isPage && !live && tabNow === "preview" && <button className="linkbtn" onClick={() => setNonce((n) => n + 1)}>Reload</button>}
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(artifact.content); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        {onExport && <button className="linkbtn" onClick={onExport} disabled={live}>Save as…</button>}
        <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="artifact-body" ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {tabNow === "code" ? (
          <pre className="artifact-code">{typing ? <><LiveCode text={smooth} />{live && <span className="caret-block" />}</> : <Code text={artifact.content} lang={artifact.language} />}</pre>
        ) : artifact.kind === "markdown" ? (
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
            <span>{run.state === "running" ? <><span className="spin" /> Running…</> : run.state === "failed" ? "⚠ Run failed" : "✓ Run finished"}</span>
            {run.note && <span className="muted small">{run.note}</span>}
            <span className="spacer" />
            <button className="linkbtn" onClick={() => { if (run.state === "running") void api().stopRun(run.id); setRun(null); }}>Close</button>
          </div>
          <pre className="run-out">{run.out || (run.state === "running" ? "No output yet. A program with a window shows it on your screen." : "(no output)")}<div ref={consoleEnd} /></pre>
        </div>
      )}
    </div>
  );
}
