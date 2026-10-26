import { Fragment, memo, useEffect, useState } from "react";
import { Code, LiveCode } from "./Code";
import { ChartBlock } from "./ChartBlock";
import { MAX_IMAGES_SHOWN, type WikiPicture } from "../core/wikimedia";
import { api } from "./api";
import { texToText } from "../core/math";
import { parseMarkdown, type Block, type Inline } from "../core/markdown";

/** Words as separate nodes (keyed by position), so a word that has just arrived fades in and the ones before it stay still. */
function Words({ v }: { v: string }) {
  return <>{v.split(/(\s+)/).map((w, i) => (i % 2 || !w ? w : <span key={i} className="w">{w}</span>))}</>;
}

function Inlines({ nodes, fade }: { nodes: Inline[]; fade?: boolean }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return fade ? <Words key={i} v={n.v} /> : <Fragment key={i}>{n.v}</Fragment>;
          case "code": return <code key={i} className="inline-code">{n.v}</code>;
          case "math": return <span key={i} className="math">{texToText(n.v)}</span>;
          case "bold": return <strong key={i}><Inlines nodes={n.c} fade={fade} /></strong>;
          case "em": return <em key={i}><Inlines nodes={n.c} fade={fade} /></em>;
          case "link": return <a key={i} href={n.href} target="_blank" rel="noreferrer"><Inlines nodes={n.c} fade={fade} /></a>;
        }
      })}
    </>
  );
}

function CodeBlock({ lang, v, open }: { lang: string; v: string; open: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`codeblock ${open ? "writing" : ""}`}>
      <div className="codehead">
        <span>{lang || "code"}</span>
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{open ? <><LiveCode text={v} /><span className="caret-block" /></> : <Code text={v} lang={lang} />}</code></pre>
    </div>
  );
}

const pictures = new Map<string, Promise<WikiPicture | null>>();

/** A picture of Wikimedia Commons in an answer, with its author and licence under it, as Commons asks. */
function WikiImage({ file, alt }: { file: string; alt: string }) {
  const [pic, setPic] = useState<WikiPicture | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    let p = pictures.get(file);
    if (!p) { p = api().wikimediaImage(file).catch(() => null); pictures.set(file, p); }
    p.then((v) => { if (!off) setPic(v); });
    return () => { off = true; };
  }, [file]);
  if (pic === undefined) return <div className="wiki-fig loading muted small">Loading the picture…</div>;
  if (!pic) return <div className="wiki-fig missing muted small">Picture not available: {alt || file}</div>;
  return (
    <figure className="wiki-fig">
      <img src={pic.dataUrl} alt={alt || pic.description} />
      <figcaption>
        <span>{alt || pic.description}</span>
        <span className="muted small"> · <a href={pic.pageUrl} target="_blank" rel="noreferrer">Wikimedia Commons</a> · {pic.author} · {pic.license}</span>
      </figcaption>
    </figure>
  );
}

function BlockView({ b, fade, over }: { b: Block; sig: string; fade: boolean; over?: boolean }) {
  switch (b.t) {
    case "p": return <p><Inlines nodes={b.c} fade={fade} /></p>;
    case "h": { const H = (`h${Math.min(6, b.level + 1)}`) as "h2"; return <H className="md-h"><Inlines nodes={b.c} fade={fade} /></H>; }
    case "image": return over ? <p className="muted small">More pictures than shown: {b.alt || b.file} (Wikimedia Commons, {b.file})</p> : <WikiImage file={b.file} alt={b.alt} />;
    case "code": return b.lang.toLowerCase() === "chart" && !b.open ? <ChartBlock raw={b.v} /> : <CodeBlock lang={b.lang} v={b.v} open={b.open} />;
    case "ul": return <ul>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} fade={fade && i === b.items.length - 1} /></li>)}</ul>;
    case "ol": return <ol>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} fade={fade && i === b.items.length - 1} /></li>)}</ol>;
    case "quote": return <blockquote><Inlines nodes={b.c} fade={fade} /></blockquote>;
    case "math": return <div className="math-block">{texToText(b.v)}</div>;
    case "hr": return <hr />;
  }
}

/** Blocks that did not change are not rendered again: while an answer streams only its last block does any work. */
const Memo = memo(BlockView, (a, b) => a.sig === b.sig && a.fade === b.fade && a.over === b.over);

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseMarkdown(text);
  // a model that asks for pictures must not fill an answer with them: only the first few are shown
  let seen = 0;
  return (
    <div className={`md ${streaming ? "streaming" : ""}`}>
      {blocks.map((b, i) => <Memo key={i} b={b} sig={JSON.stringify(b)} fade={!!streaming && i === blocks.length - 1} over={b.t === "image" ? ++seen > MAX_IMAGES_SHOWN : undefined} />)}
    </div>
  );
}
