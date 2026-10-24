import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactKind } from "../shared/types";
import { previewDocument } from "../core/artifacts";
import { Markdown } from "./Markdown";

export interface ArtifactLike { title: string; kind: ArtifactKind; language: string; content: string }

const KIND_LABEL: Record<ArtifactKind, string> = { html: "Web page", svg: "Image", markdown: "Document", code: "Code" };
export const kindLabel = (a: ArtifactLike) => (a.kind === "code" ? a.language : KIND_LABEL[a.kind]);

/** Preview / code viewer. HTML runs in a sandboxed frame without network access (see previewDocument). */
export function ArtifactViewer({ artifact, live, onClose, onExport }: { artifact: ArtifactLike; live?: boolean; onClose: () => void; onExport?: () => void }) {
  const canPreview = artifact.kind !== "code";
  const [tab, setTab] = useState<"preview" | "code">(canPreview ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);
  // the kind is only known once the opening tag is read, and the finished artifact is shown as a preview too
  useEffect(() => { if (canPreview) setTab("preview"); }, [live, canPreview]);
  const tabNow = canPreview ? tab : "code";
  const frame = useRef<HTMLIFrameElement>(null);
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
  const render = () => frame.current?.contentWindow?.postMessage({ html: shown }, "*");
  useEffect(() => { if (tabNow === "preview") render(); }, [shown, nonce, tabNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // follow the new code while it is written, unless the reader scrolled up
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = body.current; if (live && tabNow === "code" && follow.current && el) el.scrollTop = el.scrollHeight; }, [artifact.content, live, tabNow]);
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
        {(artifact.kind === "html" || artifact.kind === "svg") && !live && tabNow === "preview" && <button className="linkbtn" onClick={() => setNonce((n) => n + 1)}>Reload</button>}
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(artifact.content); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        {onExport && <button className="linkbtn" onClick={onExport} disabled={live}>Save as…</button>}
        <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="artifact-body" ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {tabNow === "code" ? (
          <pre className="artifact-code">{artifact.content}{live ? "▍" : ""}</pre>
        ) : artifact.kind === "markdown" ? (
          <div className="artifact-doc assistant"><Markdown text={artifact.content} /></div>
        ) : (
          <iframe ref={frame} title={artifact.title} className="artifact-frame" sandbox="allow-scripts" src="./artifact-frame.html" onLoad={render} />
        )}
      </div>
    </div>
  );
}
