/**
 * What can be changed when a model will not load on the NPU, ordered from the setting that costs the model the least to the one that
 * costs it the most. The NPU load test and the benchmark try them in this order and keep the first that works.
 */

export interface LoadSetting {
  id: string;
  label: string;
  /** What this setting is for, in a sentence. */
  why: string;
  /** Largest window (tokens) the server may be started with. */
  maxCtx?: number;
  /** Environment of the GenieX server (GGML_HEXAGON_* of the llama.cpp backend). */
  env?: Record<string, string>;
  /** What `geniex serve --compute` is given instead of "npu": "hybrid", or a list of NPU sessions such as "HTP0,HTP1". */
  compute?: string;
}

const MBUF = { GGML_HEXAGON_MBUF: "128M,128M" };

/**
 * GenieX's own notes: `npu` pins the whole model to ONE NPU session (HTP0), which maps about 3.5 GB; `hybrid` lets llama.cpp place each
 * tensor on the NPU or the CPU (the fast path on Snapdragon); a list such as `HTP0,HTP1` splits the layers between sessions.
 */
export const LOAD_SETTINGS: LoadSetting[] = [
  { id: "default", label: "As the app starts it", why: "The window and settings the app uses in chat (the whole model pinned to one NPU session). This is the one that fails." },
  { id: "sessions2", label: "2 NPU sessions", why: "The layers are split between two NPU sessions (HTP0, HTP1), each with its own ~3.5 GB of addresses. Still all on the NPU.", compute: "HTP0,HTP1" },
  { id: "sessions3", label: "3 NPU sessions", why: "The layers are split between three NPU sessions.", compute: "HTP0,HTP1,HTP2" },
  { id: "sessions4", label: "4 NPU sessions", why: "The layers are split between four NPU sessions (what llama.cpp's own example uses for a 20B model).", compute: "HTP0,HTP1,HTP2,HTP3" },
  { id: "mbuf", label: "Small buffers", why: "The weights are mapped in pieces of at most 128 MB (GGML_HEXAGON_MBUF).", env: MBUF },
  { id: "sessions2ctx4096", label: "2 NPU sessions, window 4096", why: "Two sessions and a small window.", compute: "HTP0,HTP1", maxCtx: 4096 },
  { id: "ctx8192", label: "Window 8192", why: "One NPU session, half the window: the memory of the conversation (KV) is mapped on the NPU too.", maxCtx: 8192 },
  { id: "ctx4096", label: "Window 4096", why: "One NPU session, a quarter of the window. GenieX itself uses 4096 on NPU for images.", maxCtx: 4096 },
  { id: "ctx4096mbuf", label: "Window 4096, small buffers", why: "A small window and small pieces.", maxCtx: 4096, env: MBUF },
  { id: "ctx2048", label: "Window 2048", why: "The smallest window: tells whether the weights alone fit in one NPU session.", maxCtx: 2048 },
  // from here on part of the model runs on the CPU: only when the user allows it
  { id: "hybrid", label: "Hybrid NPU + CPU", why: "Not NPU only: llama.cpp places each tensor on the NPU or the CPU, so the buffers that cannot be mapped stay on the CPU. GenieX's notes call it the fast path on Snapdragon, but part of the model no longer runs on the NPU.", compute: "hybrid" },
  { id: "hybridmbuf", label: "Hybrid, small buffers", why: "Hybrid and small pieces.", compute: "hybrid", env: MBUF },
  { id: "hybrid8192", label: "Hybrid, window 8192", why: "Hybrid and half the window.", compute: "hybrid", maxCtx: 8192 },
  { id: "hybrid4096", label: "Hybrid, window 4096", why: "Hybrid and a quarter of the window.", compute: "hybrid", maxCtx: 4096 }
];

/** What is kept for a model that only loads under some setting, so the app starts it that way. */
export interface LoadProfile { id: string; label: string; maxCtx?: number; env?: Record<string, string>; compute?: string; at: string }

export const profileOf = (s: LoadSetting): LoadProfile => ({ id: s.id, label: s.label, maxCtx: s.maxCtx, env: s.env, compute: s.compute, at: new Date().toISOString() });

/** Part of the model runs on the CPU: kept only when the user allows it. */
export const isHybrid = (s: Pick<LoadSetting, "compute">) => s.compute === "hybrid";

/** The settings to try after "default" failed, least limiting first. Hybrid ones (not NPU only) come last, and only when allowed. */
export const ladder = (hybrid = false): LoadSetting[] => LOAD_SETTINGS.slice(1).filter((s) => hybrid || !isHybrid(s));

/** The latest start of the server was refused memory by the NPU: the buffers of the model and its window could not be mapped. */
export function mappingFailed(log: string[]): boolean {
  const at = log.map((l, i) => (/Local hosting on/i.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  return log.slice(at).some((l) => /fastrpc_mmap|buffer mapping failed/i.test(l));
}

/** The lines of the server log that say why a load failed: from the last crash (a Go panic, a fatal error, an exit) on, else the lines of the latest start without the usual chatter. */
export function serverReason(log: string[]): string[] {
  const clean = log.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
  const last = (re: RegExp) => clean.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  const crash = last(/\bpanic\b|fatal error|SIGSEGV|unhandled exception|access violation/i) ?? last(/server exited/i);
  const trace = last(/goroutine \d+ \[running\]/);
  const from = crash ?? (trace !== undefined ? Math.max(0, trace - 2) : undefined);
  if (from !== undefined) return clean.slice(from, from + 30);
  const start = clean.map((l, i) => (/Local hosting on/i.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  const chatter = /sox|winget|restart your terminal|Bound to loopback|Local hosting|\bGET\s+"\/v1\/models"/i;
  const shown = clean.slice(start).filter((l) => !chatter.test(l)).slice(-30);
  return shown.length ? shown : clean.slice(-25); // the server may have died before it said where it listens
}

/** The size of the buffer the NPU refused to map in the latest start of the server, in MiB. */
export function mappingSizeMiB(log: string[]): number | null {
  const hits = sinceStart(log).map((l) => l.match(/buffer mapping failed\s*:.*?\bsize\s+(\d+)/i)).filter((m): m is RegExpMatchArray => !!m);
  return hits.length ? Math.round(Number(hits[hits.length - 1][1]) / 1048576) : null;
}

/** One short sentence on why an attempt failed, for the log: the buffer that could not be mapped, a crash of the server, or the error. */
export function failureSummary(error: string, log: string[]): string {
  const mib = mappingSizeMiB(log);
  if (mib !== null) return `the NPU could not map a ${mib} MiB buffer`;
  const exit = [...log].reverse().find((l) => /server exited/i.test(l));
  if (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up/i.test(error)) return `the server stopped answering (it crashed)${exit ? `: ${exit.replace(/^.*?server exited/i, "server exited")}` : ""}`;
  return error.slice(0, 120);
}

/** The log of the latest start of the server, without what came before it. */
export function sinceStart(log: string[]): string[] {
  const at = log.map((l, i) => (/Local hosting on/i.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  return log.slice(at);
}

/** Which NPU sessions the server log mentions (HTP0, HTP1…). */
export const sessionsIn = (log: string[]): string[] => [...new Set(sinceStart(log).join("\n").match(/\bHTP\d+\b/g) ?? [])].sort();

/** The buffers the server says it put on the NPU: "HTP0 KV buffer size = 2304.00 MiB". */
export function buffersIn(log: string[]): string[] {
  return sinceStart(log).flatMap((l) => {
    const m = l.match(/(HTP\d+)\s+(KV|compute|model|output)?\s*buffer size\s*=\s*([\d.]+)\s*MiB/i);
    return m ? [`${m[1]} ${m[2] ?? "weights"} ${Math.round(parseFloat(m[3]))} MiB`] : [];
  });
}
