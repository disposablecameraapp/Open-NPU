import { useEffect, useRef, useState } from "react";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `target` shown at a steady pace instead of in the bursts it arrives in. The lag stays under half a second: the more is
 * waiting, the faster it is revealed, and once `live` ends the rest is drained quickly. While more may still come the
 * reveal stops at a word boundary, so a word appears whole.
 */
export function useSmoothText(target: string, live: boolean): string {
  const [shown, setShown] = useState(() => (live && !target && !reducedMotion() ? "" : target));
  const tgt = useRef(target); tgt.current = target;
  const liveRef = useRef(live); liveRef.current = live;
  const pos = useRef(shown.length);
  const out = useRef(shown.length);
  const raf = useRef(0);
  const last = useRef(0);
  const kick = useRef<() => void>(() => undefined);

  useEffect(() => {
    const snap = () => { pos.current = out.current = tgt.current.length; setShown(tgt.current); };
    const tick = (now: number) => {
      raf.current = 0;
      const t = tgt.current;
      if (reducedMotion()) { if (out.current !== t.length) snap(); return; }
      const dt = Math.min(0.1, (now - (last.current || now)) / 1000);
      last.current = now;
      if (out.current >= t.length) { last.current = 0; return; }
      const backlog = t.length - pos.current;
      const finishing = !liveRef.current;
      const cps = finishing ? Math.max(260, backlog / 0.2) : Math.min(1200, Math.max(40, backlog / 0.45));
      pos.current = Math.min(t.length, pos.current + cps * dt);
      let n = Math.floor(pos.current);
      if (!finishing || n < t.length) {
        // hold a partial word back (but never more than a long token's worth)
        let k = n;
        while (k > out.current && k > n - 40 && !/\s/.test(t[k - 1] ?? " ")) k--;
        if (k > out.current) n = k; else if (n < t.length && !finishing) n = out.current;
      }
      if (finishing && pos.current >= t.length) n = t.length;
      if (n !== out.current) { out.current = n; setShown(t.slice(0, n)); }
      if (pos.current < t.length) raf.current = requestAnimationFrame(tick);
      else last.current = 0;
    };
    kick.current = () => { if (!raf.current) raf.current = requestAnimationFrame(tick); };
    return () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };
  }, []);

  useEffect(() => {
    // text that was replaced or cut (not a continuation of what is on screen) is shown as it is
    if (!target.startsWith(shown) && out.current > 0) { pos.current = out.current = target.length; setShown(target); return; }
    if (target.length > out.current || !live) kick.current();
  }, [target, live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live && out.current >= target.length) return target;
  return target.startsWith(shown) ? shown : target;
}
