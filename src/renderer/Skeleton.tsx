/** Shimmering placeholders for lists that are still loading. */
export function SkeletonRows({ count = 6, card = false }: { count?: number; card?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skel ${card ? "skel-card" : "skel-row"}`} style={{ ["--i" as string]: i }} aria-hidden>
          <div className="skel-line w60" /><div className="skel-line w40" />{card && <div className="skel-line w80" />}
        </div>
      ))}
    </>
  );
}
