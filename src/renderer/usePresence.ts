import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const EXIT_MS = 120;

export function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/**
 * Keeps something mounted while its exit animation plays. Pass the live value (null = closed);
 * `value` is what to render (the last one while closing) and `closing` drives the exit CSS.
 */
export function usePresence<T>(value: T | null, ms = EXIT_MS): { value: T | null; closing: boolean } {
  const [held, setHeld] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) { setHeld(value); return; }
    const t = setTimeout(() => setHeld(null), reducedMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return { value: value ?? held, closing: value === null && held !== null };
}

/**
 * For a component its parent unmounts on close: `close()` plays the exit first, then calls onClose.
 * `leaving` goes on the root element as data-state="closed".
 */
export function useExit(onClose: () => void, ms = EXIT_MS): { leaving: boolean; close: () => void } {
  const [leaving, setLeaving] = useState(false);
  const cb = useRef(onClose);
  cb.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => cb.current(), reducedMotion() ? 0 : ms);
  }, [ms]);
  return { leaving, close };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Modal sanity: Escape closes, Tab stays inside, focus moves in on open and goes back to where it was on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) {
  const esc = useRef(onEscape);
  esc.current = onEscape;
  useLayoutEffect(() => {
    if (!active) return;
    const root = ref.current;
    const before = document.activeElement as HTMLElement | null;
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); esc.current(); return; }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); root.focus(); return; }
      const first = items[0], last = items[items.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      else if (!root.contains(cur)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
