import { memo, useMemo } from "react";
import { highlight } from "../core/highlight";

/** Code with syntax colours. Plain text while it is still being written (cheap), coloured once it is final. */
export function Code({ text, lang, plain }: { text: string; lang: string; plain?: boolean }) {
  const toks = useMemo(() => (plain ? null : highlight(text, lang)), [text, lang, plain]);
  if (!toks) return <>{text}</>;
  return <>{toks.map((t, i) => (t.c ? <span key={i} className={`tk-${t.c}`}>{t.v}</span> : t.v))}</>;
}

/** One line of code as it is written: each word that appears fades in where it is, the words already there stay still. */
const Line = memo(function Line({ v }: { v: string }) {
  const parts = v.split(/(\s+)/);
  return <span className="ln">{parts.map((w, i) => (i % 2 ? w : w ? <span key={i} className="cw">{w}</span> : null))}{"\u200b"}</span>;
});

/** Code as it is written, word by word at the pace of the smoothed text: no line slides in as a block. */
export function LiveCode({ text }: { text: string }) {
  return <>{text.split("\n").map((l, i) => <Line key={i} v={l} />)}</>;
}
