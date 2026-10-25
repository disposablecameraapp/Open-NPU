import type { CatalogEntry } from "../shared/types";
import { LOAD_SETTINGS, buffersIn, mappingFailed, serverReason, sessionsIn, type LoadSetting } from "./npuLoad";
export { LOAD_SETTINGS } from "./npuLoad";
export type { LoadSetting } from "./npuLoad";

/**
 * The NPU load test (Developer settings): loads a model that is known to fail under a series of settings (window, number of
 * NPU sessions, buffer size) and says which of them make it load, with the server's own words for each failure. It is what the
 * benchmark does when a model will not load, without having to run a benchmark.
 */

export interface LoadAttempt {
  model: string;
  setting: string;
  label: string;
  ok: boolean;
  seconds: number;
  /** The window the server was started with. */
  window: number | null;
  /** NPU memory taken by the model once loaded (GB), when it could be read. */
  npuGrewGB: number | null;
  /** Which NPU sessions the server log mentions (HTP0, HTP1…). */
  sessions: string[];
  error?: string;
  cause?: string;
}

export interface LoadTestDeps {
  /** Starts the server for this model with this setting and asks it for one word. Rejects with the server's error. */
  attempt(e: CatalogEntry, s: LoadSetting): Promise<{ nctx: number }>;
  stopServer(): Promise<void>;
  probe(): Promise<{ util: number | null; memGB: number | null }>;
  serverLog(): string[];
  /** One line on what the app expects of this model here. */
  describe?(e: CatalogEntry): Promise<string>;
  /** The first setting that made a model load, when it is not the app's own: kept, so the app starts the model that way. */
  remember?(e: CatalogEntry, s: LoadSetting): void;
  log(line: string): void;
  /** Milliseconds the NPU is given to let go between two attempts (3000). */
  settleMs?: number;
  now?: () => number;
}

export async function runLoadTest(deps: LoadTestDeps, entries: CatalogEntry[], opts: { settings?: LoadSetting[]; all?: boolean; signal: AbortSignal }): Promise<LoadAttempt[]> {
  const now = deps.now ?? (() => Date.now());
  const settings = opts.settings ?? LOAD_SETTINGS;
  const out: LoadAttempt[] = [];
  const settle = () => new Promise<void>((res) => { const t = setTimeout(res, deps.settleMs ?? 3000); opts.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true }); });
  for (const e of entries) {
    if (opts.signal.aborted) break;
    deps.log("");
    deps.log(`=== ${e.name} (${e.sizeGB.toFixed(1)} GB, ${e.quant ?? "native"}, ${e.architecture}) ===`);
    const plan = await deps.describe?.(e).catch(() => "");
    if (plan) deps.log(`The app expects: ${plan}`);
    let worked = false;
    for (const s of settings) {
      if (opts.signal.aborted) break;
      if (worked && !opts.all) { deps.log(`- ${s.label}: not tried (a setting already worked; tick "try every setting" to test them all).`); continue; }
      deps.log(`- ${s.label}: ${s.why}${s.env ? ` [${Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join(" ")}]` : ""}`);
      await deps.stopServer().catch(() => undefined);
      await settle();
      const before = await deps.probe().catch(() => ({ util: null, memGB: null }));
      const t0 = now();
      const a: LoadAttempt = { model: e.name, setting: s.id, label: s.label, ok: false, seconds: 0, window: null, npuGrewGB: null, sessions: [], };
      try {
        const r = await deps.attempt(e, s);
        a.ok = true;
        a.window = r.nctx;
        const after = await deps.probe().catch(() => ({ util: null, memGB: null }));
        if (after.memGB !== null && before.memGB !== null) a.npuGrewGB = Math.round((after.memGB - before.memGB) * 100) / 100;
        if (!worked && s.id !== "default") deps.remember?.(e, s);
        worked = true;
      } catch (err) {
        a.error = (err as Error).message;
        const log = deps.serverLog();
        const key = serverReason(log).filter((l) => /\b(ERR|WRN)\b|panic|fatal|error|failed/i.test(l) && !/\[GIN\]/.test(l)).slice(-3);
        a.cause = key.map((l) => l.replace(/^.*?\[ML\]\s*(\[[^\]]*\]\s*)*/, "").slice(0, 200)).join(" | ") || undefined;
        if (mappingFailed(log)) a.cause = `the NPU could not map memory (fastrpc_mmap). ${a.cause ?? ""}`.trim();
      }
      a.seconds = Math.round((now() - t0) / 100) / 10;
      const log = deps.serverLog();
      a.sessions = sessionsIn(log);
      const bufs = buffersIn(log);
      deps.log(`  ${a.ok ? "LOADED" : "FAILED"} in ${a.seconds} s${a.window ? `, window ${a.window}` : ""}${a.npuGrewGB !== null ? `, NPU memory +${a.npuGrewGB} GB` : ""}; sessions seen in the server log: ${a.sessions.join(", ") || "none"}.`);
      if (bufs.length) deps.log(`  buffers on the NPU: ${bufs.join("; ")}`);
      if (!a.ok) {
        deps.log(`  error: ${a.error}`);
        if (a.cause) deps.log(`  cause: ${a.cause}`);
        for (const l of serverReason(log).slice(-8)) deps.log(`  server: ${l.slice(0, 260)}`);
      }
      out.push(a);
    }
  }
  await deps.stopServer().catch(() => undefined);
  deps.log("");
  deps.log("=== Summary ===");
  for (const e of entries) {
    const mine = out.filter((a) => a.model === e.name);
    const good = mine.filter((a) => a.ok);
    deps.log(`${e.name}: ${good.length ? `loads with: ${good.map((a) => a.label).join("; ")}` : mine.length ? "did not load with any setting tried" : "not tried"}`);
  }
  if (opts.signal.aborted) deps.log("(stopped before the end)");
  return out;
}
