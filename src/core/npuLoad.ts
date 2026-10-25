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
}

const MBUF = { GGML_HEXAGON_MBUF: "128M,128M" };
const DEV2 = { GGML_HEXAGON_DEVICES: "2" };
const DEV3 = { GGML_HEXAGON_DEVICES: "3" };

export const LOAD_SETTINGS: LoadSetting[] = [
  { id: "default", label: "As the app starts it", why: "The window and settings the app uses in chat. This is the one that fails." },
  { id: "mbuf", label: "Small buffers", why: "The weights are mapped in pieces of at most 128 MB (GGML_HEXAGON_MBUF): a big piece needs a big free slot in the NPU's address space, small ones fit in gaps. Costs nothing.", env: MBUF },
  { id: "dev2", label: "2 NPU sessions", why: "One NPU session maps about 3.5 GB. With 2 sessions the layers can be split between them (GGML_HEXAGON_DEVICES=2).", env: DEV2 },
  { id: "dev3", label: "3 NPU sessions", why: "For a model that needs more than 2 sessions (GGML_HEXAGON_DEVICES=3).", env: DEV3 },
  { id: "mbufdev2", label: "Small buffers, 2 NPU sessions", why: "Both together.", env: { ...MBUF, ...DEV2 } },
  { id: "ctx8192", label: "Window 8192", why: "The memory of the conversation (KV) is mapped on the NPU too: half the window, half that memory.", maxCtx: 8192 },
  { id: "ctx8192mbuf", label: "Window 8192, small buffers", why: "A smaller window and small pieces.", maxCtx: 8192, env: MBUF },
  { id: "ctx8192dev2", label: "Window 8192, 2 NPU sessions", why: "A smaller window and two sessions.", maxCtx: 8192, env: DEV2 },
  { id: "ctx4096", label: "Window 4096", why: "A quarter of the memory of the 16K window. GenieX itself uses 4096 on NPU for images.", maxCtx: 4096 },
  { id: "ctx4096mbuf", label: "Window 4096, small buffers", why: "A small window and small pieces.", maxCtx: 4096, env: MBUF },
  { id: "ctx4096dev2", label: "Window 4096, 2 NPU sessions", why: "A small window and two sessions.", maxCtx: 4096, env: DEV2 },
  { id: "ctx4096mbufdev2", label: "Window 4096, small buffers, 2 NPU sessions", why: "All three.", maxCtx: 4096, env: { ...MBUF, ...DEV2 } },
  { id: "ctx4096dev3", label: "Window 4096, 3 NPU sessions", why: "A small window and three sessions.", maxCtx: 4096, env: DEV3 },
  { id: "ctx2048", label: "Window 2048", why: "The smallest window: tells whether the weights alone fit in one NPU session.", maxCtx: 2048 }
];

/** What is kept for a model that only loads under some setting, so the app starts it that way. */
export interface LoadProfile { id: string; label: string; maxCtx?: number; env?: Record<string, string>; at: string }

export const profileOf = (s: LoadSetting): LoadProfile => ({ id: s.id, label: s.label, maxCtx: s.maxCtx, env: s.env, at: new Date().toISOString() });

/** The settings to try after "default" failed, least limiting first. */
export const ladder = (): LoadSetting[] => LOAD_SETTINGS.slice(1);

/** The latest start of the server was refused memory by the NPU: the buffers of the model and its window could not be mapped. */
export function mappingFailed(log: string[]): boolean {
  const at = log.map((l, i) => (/Local hosting on/i.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  return log.slice(at).some((l) => /fastrpc_mmap|buffer mapping failed/i.test(l));
}

/** The lines of the server log that say why a load failed: from the last panic or fatal error on, else the lines of the latest start without the usual chatter. */
export function serverReason(log: string[]): string[] {
  const clean = log.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
  const crash = clean.map((l, i) => (/panic:|fatal error|SIGSEGV|unhandled exception|access violation/i.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  if (crash !== undefined) return clean.slice(crash, crash + 30);
  const start = clean.map((l, i) => (/Local hosting on/i.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  const chatter = /sox|winget|restart your terminal|Bound to loopback|Local hosting|\bGET\s+"\/v1\/models"/i;
  const shown = clean.slice(start).filter((l) => !chatter.test(l)).slice(-30);
  return shown.length ? shown : clean.slice(-25); // the server may have died before it said where it listens
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
