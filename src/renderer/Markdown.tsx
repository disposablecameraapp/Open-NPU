import { Fragment, useState } from "react";
import { Code } from "./Code";
import { parseMarkdown, type Block, type Inline } from "../core/markdown";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return <Fragment key={i}>{n.v}</Fragment>;
          case "code": return <code key={i} className="inline-code">{n.v}</code>;
          case "bold": return <strong key={i}><Inlines nodes={n.c} /></strong>;
          case "em": return <em key={i}><Inlines nodes={n.c} /></em>;
          case "link": return <a key={i} href={n.href} target="_blank" rel="noreferrer"><Inlines nodes={n.c} /></a>;
        }
      })}
    </>
  );
}

function CodeBlock({ lang, v, open }: { lang: string; v: string; open: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock">
      <div className="codehead">
        <span>{lang || "code"}</span>
        <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code><Code text={v} lang={lang} plain={open} />{open ? "▍" : ""}</code></pre>
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "p": return <p><Inlines nodes={b.c} /></p>;
    case "h": { const H = (`h${Math.min(6, b.level + 1)}`) as "h2"; return <H className="md-h"><Inlines nodes={b.c} /></H>; }
    case "code": return <CodeBlock lang={b.lang} v={b.v} open={b.open} />;
    case "ul": return <ul>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ul>;
    case "ol": return <ol>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ol>;
    case "quote": return <blockquote><Inlines nodes={b.c} /></blockquote>;
    case "hr": return <hr />;
  }
}

export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((b, i) => <BlockView key={i} b={b} />)}</div>;
}
