import { useMemo, useRef, useState } from "react";
import { chartModel, fmt, linePath, parseChartSpec, partialChartSpec, type ChartModel } from "../core/chart";
import { Code } from "./Code";
import { exportJson, exportPng, exportSvg } from "./chartExport";

const W = 620, H = 340;
const M = { l: 58, r: 18, t: 46, b: 46 };

/** A chart a model wrote as JSON, drawn in the chat: sliders for its numbers, a read-out when the pointer is over it. */
export function ChartBlock({ raw, live }: { raw: string; live?: boolean }) {
  // while the reply is still being written, the chart is drawn from what has arrived so far, and grows line by line
  const parsed = useMemo(() => (live ? partialChartSpec(raw) ?? "" : parseChartSpec(raw)), [raw, live]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [exporting, setExporting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const model = useMemo(() => (typeof parsed === "string" ? null : chartModel(parsed, values)), [parsed, values]);

  if (live && (typeof parsed === "string" || !model)) {
    return <div className="chart-block"><div className="chart-note">Drawing the chart…</div></div>;
  }
  if (typeof parsed === "string" || !model) {
    return (
      <div className="chart-block bad">
        <div className="chart-note">This chart could not be drawn: {typeof parsed === "string" ? parsed : "unknown problem"}. Ask the model to correct it.</div>
        <div className="codeblock"><pre><code><Code text={raw} lang="json" /></code></pre></div>
      </div>
    );
  }
  const spec = model.spec;
  return (
    <div className="chart-block">
      <div className="chart-head">
        <strong>{spec.title || "Chart"}</strong>
        <span className="chart-actions">
          {exporting ? (
            showJson
              ? <button className="linkbtn" onClick={() => { exportJson(raw, spec.title); setExporting(false); }}>JSON file</button>
              : !model.problem && <>
                <button className="linkbtn" onClick={() => { const s = body.current?.querySelector("svg"); if (s) exportSvg(s, spec.title); setExporting(false); }}>SVG</button>
                <button className="linkbtn" onClick={async () => { const s = body.current?.querySelector("svg"); setExporting(false); if (s) { try { await exportPng(s, spec.title); } catch { /* blocked */ } } }}>PNG</button>
              </>
          ) : <button className="linkbtn" onClick={() => setExporting(true)}>Export</button>}
          <button className="linkbtn" onClick={() => setShowJson((v) => !v)}>{showJson ? "View chart" : "View JSON"}</button>
          <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        </span>
      </div>
      <div ref={body}>{showJson ? <div className="codeblock"><pre><code><Code text={raw} lang="json" /></code></pre></div> : model.problem ? <div className="chart-note">{model.problem}</div> : spec.type === "pie" ? <Pie model={model} hover={hover} setHover={setHover} /> : <Plot model={model} hover={hover} setHover={setHover} />}</div>
      {spec.params.length > 0 && (
        <div className="chart-params">
          {spec.params.map((p) => (
            <label key={p.id}>
              <span className="chart-param-name">{p.label}</span>
              <input type="range" min={p.min} max={p.max} step={p.step} value={model.values[p.id]} onChange={(e) => setValues((v) => ({ ...v, [p.id]: Number(e.target.value) }))} aria-label={p.label} />
              <span className="chart-param-value">{fmt(model.values[p.id])}{p.unit ? ` ${p.unit}` : ""}</span>
            </label>
          ))}
        </div>
      )}
      {spec.note && <div className="chart-note">{spec.note}</div>}
    </div>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return <g className="chart-legend">{items.map((s, i) => <g key={i} transform={`translate(${M.l + i * 150}, 24)`}><rect width="12" height="12" rx="3" fill={s.color} /><text x="18" y="10">{s.name.slice(0, 20)}</text></g>)}</g>;
}

function Plot({ model, hover, setHover }: { model: ChartModel; hover: number | null; setHover: (i: number | null) => void }) {
  const { spec } = model;
  const bars = spec.type === "bar";
  const sx = (x: number) => M.l + ((x - model.xMin) / (model.xMax - model.xMin || 1)) * (W - M.l - M.r);
  const sy = (y: number) => H - M.b - ((y - model.yMin) / (model.yMax - model.yMin || 1)) * (H - M.t - M.b);
  const base = sy(Math.max(model.yMin, Math.min(0, model.yMax)));
  const n = model.series[0]?.pts.length ?? 0;
  const at = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (W - M.l - M.r) + M.l;
    const x = model.xMin + ((px - M.l) / (W - M.l - M.r)) * (model.xMax - model.xMin);
    const pts = model.series[0].pts;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(pts[best].x - x)) best = i; });
    setHover(best);
  };
  const band = bars ? (W - M.l - M.r) / Math.max(1, n) : 0;
  const bw = bars ? Math.min(46, (band * 0.8) / Math.max(1, model.series.length)) : 0;
  const hp = hover !== null ? model.series.map((s) => ({ s, p: s.pts[hover] })).filter((x) => x.p && isFinite(x.p.y)) : [];
  const tipX = hover !== null ? sx(model.series[0].pts[hover].x) : 0;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "Chart"}>
      <Legend items={model.series} />
      {model.yTicks.map((t, i) => <g key={i}><line className="chart-grid" x1={M.l} x2={W - M.r} y1={sy(t.v)} y2={sy(t.v)} /><text className="chart-tick" x={M.l - 8} y={sy(t.v) + 4} textAnchor="end">{t.label}</text></g>)}
      {model.xTicks.map((t, i) => <text key={i} className="chart-tick" x={sx(t.v)} y={H - M.b + 18} textAnchor="middle">{t.label}</text>)}
      <text className="chart-axis" x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle">{spec.x.label}</text>
      {spec.yLabel && <text className="chart-axis" transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">{spec.yLabel}</text>}
      <line className="chart-axisline" x1={M.l} x2={W - M.r} y1={base} y2={base} />
      {bars
        ? model.series.map((s, k) => s.pts.map((p, i) => isFinite(p.y) ? <rect key={`${k}-${i}`} className={hover === i ? "chart-bar on" : "chart-bar"} x={sx(p.x) - (bw * model.series.length) / 2 + k * bw} y={Math.min(sy(p.y), base)} width={bw - 2} height={Math.abs(base - sy(p.y))} rx="3" fill={s.color} /> : null))
        : model.series.map((s, k) => (
          <g key={k}>
            {spec.type === "area" && <path d={`${linePath(s.pts, sx, sy)}L${sx(s.pts[s.pts.length - 1].x).toFixed(1)} ${base}L${sx(s.pts[0].x).toFixed(1)} ${base}Z`} fill={s.color} opacity="0.14" />}
            <path d={linePath(s.pts, sx, sy)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
      {hover !== null && hp.length > 0 && (
        <g className="chart-hover" pointerEvents="none">
          {!bars && <line className="chart-guide" x1={tipX} x2={tipX} y1={M.t} y2={H - M.b} />}
          {!bars && hp.map(({ s, p }, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill={s.color} stroke="var(--bg, #fff)" strokeWidth="2" />)}
          <g transform={`translate(${Math.min(tipX + 12, W - 190)}, ${M.t + 4})`}>
            <rect className="chart-tip" width="178" height={22 + hp.length * 17} rx="8" />
            <text className="chart-tiphead" x="10" y="16">{spec.labels?.[hp[0].p.x] ?? `${spec.x.label} ${fmt(hp[0].p.x)}`}</text>
            {hp.map(({ s, p }, i) => <g key={i}><circle cx="14" cy={31 + i * 17} r="4" fill={s.color} /><text x="24" y={35 + i * 17}>{s.name.slice(0, 14)}: <tspan fontWeight="600">{fmt(p.y)}</tspan></text></g>)}
          </g>
        </g>
      )}
      <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onPointerMove={at} onPointerLeave={() => setHover(null)} />
    </svg>
  );
}

function Pie({ model, hover, setHover }: { model: ChartModel; hover: number | null; setHover: (i: number | null) => void }) {
  const slices = model.slices ?? [];
  const cx = 150, cy = 170, r = 110;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a1 = a0 + s.share * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const mid = (a0 + a1) / 2;
    const grow = hover === i ? 8 : 0;
    const ox = Math.cos(mid) * grow, oy = Math.sin(mid) * grow;
    const p = (a: number) => `${(cx + ox + Math.cos(a) * r).toFixed(1)} ${(cy + oy + Math.sin(a) * r).toFixed(1)}`;
    const d = s.share >= 0.9999 ? `M${cx + ox - r} ${cy + oy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` : `M${cx + ox} ${cy + oy}L${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}Z`;
    a0 = a1;
    return { d, s, i };
  });
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.spec.title || "Chart"}>
      {arcs.map(({ d, s, i }) => <path key={i} d={d} fill={s.color} stroke="var(--bg, #fff)" strokeWidth="2" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />)}
      <g transform="translate(330, 60)">
        {slices.map((s, i) => (
          <g key={i} transform={`translate(0, ${i * 26})`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={hover === i ? "chart-slice on" : "chart-slice"}>
            <rect width="14" height="14" rx="3" fill={s.color} />
            <text x="22" y="12">{s.name.slice(0, 22)}</text>
            <text x="270" y="12" textAnchor="end" className="chart-tick">{fmt(s.value)} · {Math.round(s.share * 100)} %</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
