import { useMemo } from "react";
import { highlight } from "../core/highlight";

/** Code with syntax colours. Plain text while it is still being written (cheap), coloured once it is final. */
export function Code({ text, lang, plain }: { text: string; lang: string; plain?: boolean }) {
  const toks = useMemo(() => (plain ? null : highlight(text, lang)), [text, lang, plain]);
  if (!toks) return <>{text}</>;
  return <>{toks.map((t, i) => (t.c ? <span key={i} className={`tk-${t.c}`}>{t.v}</span> : t.v))}</>;
}
