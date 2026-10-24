import { useLayoutEffect, useRef, type HTMLAttributes } from "react";

/** Segmented control: the `.on` button gets a highlight pill that slides to it. Children are plain <button className="on">. */
export function Seg({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>(":scope > button.on");
      if (!on) { el.style.setProperty("--pill-o", "0"); return; }
      el.style.setProperty("--pill-x", `${on.offsetLeft}px`);
      el.style.setProperty("--pill-w", `${on.offsetWidth}px`);
      el.style.setProperty("--pill-o", "1");
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(el);
    el.querySelectorAll("button").forEach((b) => ro?.observe(b));
    return () => ro?.disconnect();
  });
  return <div ref={ref} className={`seg pilled ${className}`} {...rest}><span className="seg-pill" aria-hidden />{children}</div>;
}
