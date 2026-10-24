import { memo, useMemo, useRef } from "react";
import { highlight } from "../core/highlight";

/** Code with syntax colours. Plain text while it is still being written (cheap), coloured once it is final. */
export function Code({ text, lang, plain }: { text: string; lang: string; plain?: boolean }) {
  const toks = useMemo(() => (plain ? null : highlight(text, lang)), [text, lang, plain]);
  if (!toks) return <>{text}</>;
  return <>{toks.map((t, i) => (t.c ? <span key={i} className={`tk-${t.c}`}>{t.v}</span> : t.v))}</>;
}

const Line = memo(function Line({ v, delay }: { v: string; delay: number }) {
  return <span className="ln" style={delay ? { animationDelay: `${delay}ms` } : undefined}>{v || "​"}</span>;
});

/** Code as it is written: every new line slides in (a batch of lines one after another); lines already there stay still. */
export function LiveCode({ text }: { text: string }) {
  const lines = text.split("\n");
  const before = useRef(0);
  const first = before.current;
  before.current = Math.max(before.current, lines.length);
  return <>{lines.map((l, i) => <Line key={i} v={l} delay={i >= first ? Math.min(i - first, 10) * 30 : 0} />)}</>;
}
