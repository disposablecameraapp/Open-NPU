import { useEffect, useMemo, useRef, useState } from "react";
import { chartFlaw, chartModel, chartOutputs, fmt, formulaLines, healChartText, linePath, parseChartSpec, partialChartSpec, type ChartModel } from "../core/chart";
import { api } from "./api";
import { Tex } from "./Tex";
import { Code } from "./Code";
import { exportJson, exportPng, exportSvg } from "./chartExport";

const W = 620, H = 340;
const M = { l: 58, r: 18, t: 46, b: 46 };

/** A chart a model wrote as JSON, drawn in the chat: sliders for its numbers, a read-out when the pointer is over it. */
const healedCharts = new Map<string, { text: string; how: "repaired" | "model" }>();

export function ChartBlock({ raw: written, live }: { raw: string; live?: boolean }) {
  const [mended, setMended] = useState<{ from: string; text: string; how: "repaired" | "model" } | null>(() => { const k = healedCharts.get(written); return k ? { from: written, ...k } : null; });
  const [fixing, setFixing] = useState(false);
  const [failed, setFailed] = useState<{ from: string; why: string } | null>(null);
  // the text the reader sees: the corrected one once the window has mended it
  const raw = mended && mended.from === written ? mended.text : written;
  // while the reply is still being written, the chart is drawn from what has arrived so far, and grows line by line
  const parsed = useMemo(() => (live ? partialChartSpec(raw) ?? "" : parseChartSpec(raw)), [raw, live]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [exporting, setExporting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const model = useMemo(() => (typeof parsed === "string" ? null : chartModel(parsed, values)), [parsed, values]);
  // a chart that cannot be drawn is mended here: the usual slips of JSON first, then the model, as a diagram is
  useEffect(() => {
    if (live || mended?.from === written || chartFlaw(written) === null) return;
    let off = false;
    setFixing(true); setFailed(null);
    void healChartText(written, async (_system, _user, text, why) => (await api().fixBlock("chart", text, why)) ?? "").then((r) => {
      if (off) return;
      setFixing(false);
      if ("error" in r) { setFailed({ from: written, why: r.error }); return; }
      if (r.how !== "none") { healedCharts.set(written, { text: r.text, how: r.how }); setMended({ from: written, text: r.text, how: r.how }); }
    });
    return () => { off = true; };
  }, [written, live]);

  if (live && (typeof parsed === "string" || !model)) {
    return <div className="chart-block"><div className="chart-note">Drawing the chart…</div></div>;
  }
  if (fixing) return <div className="chart-block"><div className="chart-note">Correcting the chart…</div></div>;
  if (typeof parsed === "string" || !model) {
    return (
      <div className="chart-block bad">
        <div className="chart-note">This chart could not be drawn, even after being corrected: {failed?.why ?? (typeof parsed === "string" ? parsed : "unknown problem")}.</div>
        <div className="codeblock"><pre><code><Code text={raw} lang="json" /></code></pre></div>
      </div>
    );
  }
  const spec = model.spec;
  const formulas = formulaLines(spec, model.values), outputs = chartOutputs(spec, model.values);
  // a chart with results or formulas is a calculator: its inputs come first, the curve last
  const calculator = outputs.length > 0 || formulas.length > 0;
  const params = spec.params.length > 0 && (
    <div className="chart-params">
      {spec.params.map((p) => (
        <label key={p.id}>
          <span className="chart-param-name">{p.label}</span>
          <input type="range" min={p.min} max={p.max} step={p.step} value={Math.min(p.max, Math.max(p.min, model.values[p.id]))} onChange={(e) => setValues((v) => ({ ...v, [p.id]: Number(e.target.value) }))} aria-label={p.label} />
          <span className="chart-param-field">
            <input type="number" inputMode="decimal" step="any" value={Number.isFinite(model.values[p.id]) ? +model.values[p.id].toPrecision(12) : ""} onChange={(e) => { const n = e.target.value === "" ? NaN : Number(e.target.value.replace(",", ".")); if (Number.isFinite(n)) setValues((v) => ({ ...v, [p.id]: n })); }} aria-label={`${p.label}, exact value`} />
            {p.unit && <span className="chart-param-unit">{p.unit}</span>}
          </span>
        </label>
      ))}
    </div>
  );
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
      {mended?.from === written && <div className="chart-note">{mended.how === "model" ? "Corrected automatically by the assistant." : "Corrected automatically."}</div>}
      {calculator && params}
      {formulas.length > 0 && (
        <div className="chart-formulas">
          {formulas.map((f, i) => <div key={i} className="chart-formula">{f.label && <span className="chart-formula-label">{f.label}</span>}<Tex v={f.tex} display /></div>)}
        </div>
      )}
      {outputs.length > 0 && (
        <div className="chart-outputs">
          {outputs.map((o, i) => <div key={i} className="chart-output"><span>{o.label}</span><strong>{o.text}</strong></div>)}
        </div>
      )}
      <div ref={body}>{showJson ? <div className="codeblock"><pre><code><Code text={raw} lang="json" /></code></pre></div> : model.problem ? <div className="chart-note">{model.problem}</div> : spec.type === "pie" || spec.type === "donut" ? <Pie model={model} hover={hover} setHover={setHover} /> : spec.type === "radar" ? <Radar model={model} hover={hover} setHover={setHover} /> : <Plot model={model} hover={hover} setHover={setHover} />}</div>
      {!calculator && params}
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
  const stacked = !!spec.stack && bars;
  const bw = bars ? Math.min(46, stacked ? band * 0.6 : (band * 0.8) / Math.max(1, model.series.length)) : 0;
  const scatter = spec.type === "scatter";
  // piled bars: each series starts where the ones before it end
  const below = (k: number, i: number) => model.series.slice(0, k).reduce((n, s) => n + (isFinite(s.pts[i]?.y) && s.pts[i].y > 0 ? s.pts[i].y : 0), 0);
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
        ? model.series.map((s, k) => s.pts.map((p, i) => isFinite(p.y) ? (stacked
          ? <rect key={`${k}-${i}`} className={hover === i ? "chart-bar on" : "chart-bar"} x={sx(p.x) - bw / 2} y={sy(below(k, i) + Math.max(0, p.y))} width={bw} height={Math.abs(sy(below(k, i)) - sy(below(k, i) + Math.max(0, p.y)))} rx="2" fill={s.color} />
          : <rect key={`${k}-${i}`} className={hover === i ? "chart-bar on" : "chart-bar"} x={sx(p.x) - (bw * model.series.length) / 2 + k * bw} y={Math.min(sy(p.y), base)} width={bw - 2} height={Math.abs(base - sy(p.y))} rx="3" fill={s.color} />) : null))
        : scatter
          ? model.series.map((s, k) => <g key={k}>{s.pts.map((p, i) => isFinite(p.y) ? <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="5" fill={s.color} fillOpacity="0.78" stroke="var(--bg, #fff)" strokeWidth="1.5"><title>{`${s.name}: ${fmt(p.x)}, ${fmt(p.y)}`}</title></circle> : null)}</g>)
          : model.series.map((s, k) => (
          <g key={k}>
            {spec.type === "area" && <path d={`${linePath(s.pts, sx, sy)}L${sx(s.pts[s.pts.length - 1].x).toFixed(1)} ${base}L${sx(s.pts[0].x).toFixed(1)} ${base}Z`} fill={s.color} opacity="0.14" />}
            <path d={linePath(s.pts, sx, sy)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {s.pts.length <= 24 && s.pts.map((p, i) => isFinite(p.y) ? <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3.2" fill={s.color} /> : null)}
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
      {!scatter && <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onPointerMove={at} onPointerLeave={() => setHover(null)} />}
    </svg>
  );
}

const polar = (cx: number, cy: number, r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;

/** Spokes and rings, one polygon per series: how things compare on several axes at once. */
function Radar({ model, hover, setHover }: { model: ChartModel; hover: number | null; setHover: (i: number | null) => void }) {
  const labels = model.spec.labels ?? [];
  const n = labels.length, cx = 210, cy = 180, R = 118;
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const at = (i: number, v: number) => polar(cx, cy, (Math.max(0, v) / (model.yMax || 1)) * R, ang(i));
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.spec.title || "Chart"}>
      {model.yTicks.filter((t) => t.v > 0).map((t, i) => <polygon key={i} className="chart-grid" fill="none" points={labels.map((_l, k) => polar(cx, cy, (t.v / model.yMax) * R, ang(k))).join(" ")} />)}
      {labels.map((l, i) => <g key={i}><line className="chart-grid" x1={cx} y1={cy} x2={polar(cx, cy, R, ang(i)).split(" ")[0]} y2={polar(cx, cy, R, ang(i)).split(" ")[1]} /><text className="chart-tick" x={polar(cx, cy, R + 16, ang(i)).split(" ")[0]} y={Number(polar(cx, cy, R + 16, ang(i)).split(" ")[1]) + 4} textAnchor={Math.abs(Math.cos(ang(i))) < 0.2 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end"}>{l.slice(0, 18)}</text></g>)}
      {model.yTicks.filter((t) => t.v > 0).map((t, i) => <text key={i} className="chart-tick" x={cx + 4} y={cy - (t.v / model.yMax) * R + 11}>{t.label}</text>)}
      {model.series.map((s, k) => <g key={k} opacity={hover === null || hover === k ? 1 : 0.3} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)}><polygon points={s.pts.map((p) => at(p.x, p.y)).join(" ")} fill={s.color} fillOpacity="0.2" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />{s.pts.map((p, i) => <circle key={i} cx={at(i, p.y).split(" ")[0]} cy={at(i, p.y).split(" ")[1]} r="3.4" fill={s.color}><title>{`${s.name} · ${labels[i]}: ${fmt(p.y)}`}</title></circle>)}</g>)}
      <g transform="translate(400, 60)">{model.series.map((s, k) => <g key={k} transform={`translate(0, ${k * 24})`}><rect width="12" height="12" rx="3" fill={s.color} /><text x="18" y="10">{s.name.slice(0, 22)}</text></g>)}</g>
    </svg>
  );
}

function Pie({ model, hover, setHover }: { model: ChartModel; hover: number | null; setHover: (i: number | null) => void }) {
  const slices = model.slices ?? [];
  const donut = model.spec.type === "donut";
  const total = slices.reduce((n, s) => n + (isFinite(s.value) ? s.value : 0), 0);
  const cx = 150, cy = 170, r = 110;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a1 = a0 + s.share * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const mid = (a0 + a1) / 2;
    const grow = hover === i ? 8 : 0;
    const ox = Math.cos(mid) * grow, oy = Math.sin(mid) * grow;
    const p = (a: number) => `${(cx + ox + Math.cos(a) * r).toFixed(1)} ${(cy + oy + Math.sin(a) * r).toFixed(1)}`;
    const ri = r * 0.58;
    const q = (a: number) => `${(cx + ox + Math.cos(a) * ri).toFixed(1)} ${(cy + oy + Math.sin(a) * ri).toFixed(1)}`;
    const full = s.share >= 0.9999;
    const d = donut
      ? full ? `M${cx + ox - r} ${cy + oy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0ZM${cx + ox - ri} ${cy + oy}a${ri} ${ri} 0 1 1 ${2 * ri} 0a${ri} ${ri} 0 1 1 ${-2 * ri} 0Z` : `M${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}L${q(a1)}A${ri} ${ri} 0 ${large} 0 ${q(a0)}Z`
      : full ? `M${cx + ox - r} ${cy + oy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` : `M${cx + ox} ${cy + oy}L${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}Z`;
    a0 = a1;
    return { d, s, i };
  });
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.spec.title || "Chart"}>
      {arcs.map(({ d, s, i }) => <path key={i} d={d} fillRule="evenodd" fill={s.color} stroke="var(--bg, #fff)" strokeWidth="2" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />)}
      {donut && <text x={cx} y={cy + 6} textAnchor="middle" className="chart-donut-total">{fmt(total)}</text>}
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
