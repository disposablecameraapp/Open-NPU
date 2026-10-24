import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactKind } from "../shared/types";
import { previewDocument } from "../core/artifacts";
import { Markdown } from "./Markdown";
import { Code } from "./Code";
import { api } from "./api";
import { isRunnable } from "../core/runcode";

export interface ArtifactLike { title: string; kind: ArtifactKind; language: string; content: string }

const KIND_LABEL: Record<ArtifactKind, string> = { html: "Web page", svg: "Image", markdown: "Document", code: "Code" };
export const kindLabel = (a: ArtifactLike) => (a.kind === "code" ? a.language : KIND_LABEL[a.kind]);

/** Preview / code viewer. HTML runs in a sandboxed frame without network access (see previewDocument). */
export function ArtifactViewer({ artifact, live, onClose, onExport }: { artifact: ArtifactLike; live?: boolean; onClose: () => void; onExport?: () => void }) {
  const canPreview = artifact.kind !== "code";
  const [tab, setTab] = useState<"preview" | "code">(canPreview ? "preview" : "code");
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
  // the kind is only known once the opening tag is read, and the finished artifact is shown as a preview too
  useEffect(() => { if (canPreview) setTab("preview"); }, [live, canPreview]);
  const tabNow = canPreview ? tab : "code";
  const frame = useRef<HTMLIFrameElement>(null);
  // the code on screen: while it is being written it is refreshed ~3 times a second, not on every word
  const [codeShown, setCodeShown] = useState(artifact.content);
  const contentRef = useRef(artifact.content);
  contentRef.current = artifact.content;
  useEffect(() => { if (!live) setCodeShown(artifact.content); }, [artifact.content, live]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setCodeShown(contentRef.current), 300);
    return () => clearInterval(t);
  }, [live]);
  const doc = useMemo(() => (artifact.kind === "html" || artifact.kind === "svg" ? previewDocument(artifact.kind, artifact.content) : ""), [artifact.kind, artifact.content]);
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
  // A frame renders one page: document.open() inside it also drops its message listener, and the old page's timers would keep
  // running. So every new page gets a fresh frame (new key), which posts the page to itself when it has loaded.
  const [frameKey, setFrameKey] = useState(0);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const posted = useRef<string | null>(null);
  // each frame gets its page once: writing the page ends in a load event of the same frame, which must not post it again
  const sent = useRef(false);
  const frameRef = useCallback((el: HTMLIFrameElement | null) => { frame.current = el; sent.current = false; }, []);
  const render = () => {
    if (sent.current) return;
    sent.current = true;
    posted.current = shownRef.current;
    frame.current?.contentWindow?.postMessage({ html: shownRef.current }, "*");
  };
  useEffect(() => { if (tabNow === "preview" && posted.current !== null && posted.current !== shown) setFrameKey((k) => k + 1); }, [shown, tabNow]);
  useEffect(() => { if (nonce) setFrameKey((k) => k + 1); }, [nonce]);
  // follow the new code while it is written, unless the reader scrolled up
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = body.current; if (live && tabNow === "code" && follow.current && el) el.scrollTop = el.scrollHeight; }, [codeShown, live, tabNow]);
  return (
    <div className="artifact-panel">
      <div className="artifact-head">
        <div className="artifact-title"><strong>{artifact.title || "Untitled"}</strong><span className="muted small">{kindLabel(artifact)}{live ? " · writing…" : ""}</span></div>
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
        {(artifact.kind === "html" || artifact.kind === "svg") && !live && tabNow === "preview" && <button className="linkbtn" onClick={() => setNonce((n) => n + 1)}>Reload</button>}
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(artifact.content); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        {onExport && <button className="linkbtn" onClick={onExport} disabled={live}>Save as…</button>}
        <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="artifact-body" ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {tabNow === "code" ? (
          <pre className="artifact-code"><Code text={codeShown} lang={artifact.language} plain={live} />{live ? "▍" : ""}</pre>
        ) : artifact.kind === "markdown" ? (
          <div className="artifact-doc assistant"><Markdown text={artifact.content} /></div>
        ) : (
          <iframe key={frameKey} ref={frameRef} title={artifact.title} className="artifact-frame" sandbox="allow-scripts" src="./artifact-frame.html" onLoad={render} />
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
