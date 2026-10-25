import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "child_process";
import * as path from "path";
import { ServerManager } from "../src/core/server";
import { streamChat, ThinkSplitter, parseSseData } from "../src/core/chat";
import { pullModel, parseList, parsePercent, diskCheck } from "../src/core/geniex";
import { HfClient, inspectRepo, FetchLike } from "../src/core/hf";
import { buildProfile } from "../src/core/hardware";
import { buildGguf } from "./gguf-builder";
import { SAFE_SAMPLING } from "../src/core/sampling";

const FAKE = path.join(__dirname, "fake-geniex.js");
const fakeSpawn = ((_exe: string, args: string[], opts: any) => spawn(process.execPath, [FAKE, ...args], opts)) as any;
let port = 18300 + Math.floor(Math.random() * 500);
const mk = (extra: any = {}) => new ServerManager({ exe: "geniex", host: `127.0.0.1:${port++}`, spawnFn: fakeSpawn, pollMs: 50, readyTimeoutMs: 8000, ...extra });

const managers: ServerManager[] = [];
afterEach(async () => { await Promise.all(managers.splice(0).map((m) => m.stop())); });

describe("server manager", () => {
  it("starts, becomes ready, stops", async () => {
    const m = mk(); managers.push(m);
    await m.start(8192);
    expect(m.status().state).toBe("ready");
    expect(m.status().nctx).toBe(8192);
    await m.stop();
    expect(m.status().state).toBe("stopped");
  });

  it("starts the server with the compute target a model needs", async () => {
    const seen: string[][] = [];
    const spy = ((exe: string, args: string[], opts: any) => { seen.push(args); return fakeSpawn(exe, args, opts); }) as any;
    let compute: string | undefined;
    const m = mk({ spawnFn: spy, compute: "npu", computeFn: () => compute, extraEnv: () => ({ GGML_HEXAGON_MBUF: "128M,128M" }) }); managers.push(m);
    await m.start(4096);
    compute = "hybrid";
    await m.start(8192);
    expect(seen[0][seen[0].indexOf("--compute") + 1]).toBe("npu");
    expect(seen[1][seen[1].indexOf("--compute") + 1]).toBe("hybrid");
  });

  it("restarts with a new context when asked", async () => {
    const m = mk(); managers.push(m);
    await m.start(4096);
    const pid = m.status().pid;
    await m.start(16384);
    expect(m.status().nctx).toBe(16384);
    expect(m.status().pid).not.toBe(pid);
  });

  it("recovers from an NPU overflow by halving the context", async () => {
    const m = mk({ env: { FAKE_NCTX_LIMIT: "8192" }, maxRestarts: 4 }); managers.push(m);
    const restarts: any[] = [];
    m.on("restart", (r) => restarts.push(r));
    await m.start(32768).catch(() => undefined);
    // wait for the automatic restarts to land on a working context
    for (let i = 0; i < 80 && m.status().state !== "ready"; i++) await new Promise((r) => setTimeout(r, 100));
    expect(m.status().state).toBe("ready");
    expect(m.status().nctx).toBeLessThanOrEqual(8192);
    expect(restarts.length).toBeGreaterThan(0);
  }, 30000);

  it("does not relaunch after a refused mapping: the NPU is reset instead", async () => {
    let launches = 0;
    const spy = ((exe: string, args: string[], opts: any) => { launches++; return fakeSpawn(exe, args, opts); }) as any;
    const m = mk({ spawnFn: spy, env: { FAKE_MAP_FAIL: "1" }, maxRestarts: 3 }); managers.push(m);
    m.on("error", () => undefined);
    await m.start(4096).catch(() => undefined);
    for (let i = 0; i < 30 && m.status().state !== "failed"; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1500));
    expect(m.status().state).toBe("failed");
    expect(launches).toBe(1);
  }, 20000);

  it("gives up with a friendly error when it keeps crashing", async () => {
    const m = mk({ env: { FAKE_NCTX_LIMIT: "1024" }, maxRestarts: 1 }); managers.push(m);
    await m.start(2048).catch(() => undefined);
    for (let i = 0; i < 60 && m.status().state !== "failed"; i++) await new Promise((r) => setTimeout(r, 100));
    expect(m.status().state).toBe("failed");
    expect(m.status().lastError?.id).toBe("npu-overflow");
  }, 20000);
});

describe("chat streaming", () => {
  it("splits thinking from the answer and reports stats", async () => {
    const m = mk(); managers.push(m);
    await m.start(4096);
    let thinking = "", answer = "", stats: any;
    for await (const ev of streamChat({ endpoint: m.endpoint, model: "fake", messages: [{ role: "user", content: "hi" }], sampling: SAFE_SAMPLING }, "1")) {
      if (ev.type === "thinking") thinking += ev.text;
      if (ev.type === "answer") answer += ev.text;
      if (ev.type === "done") stats = ev.stats;
    }
    expect(thinking).toBe("Plan it. ");
    expect(answer).toBe("Hello there!");
    expect(stats.tokens).toBe(6);
    expect(stats.ttftSec).not.toBeNull();
    expect(stats.tokPerSec).toBeGreaterThan(0);
  });

  it("sends explicit sampling on the wire", async () => {
    let body: any;
    const fetchFn = (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response("data: [DONE]\n\n", { status: 200 }); }) as any;
    for await (const _ of streamChat({ endpoint: "http://x/v1", model: "m", messages: [], sampling: { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 }, fetchFn }, "1")) { /* drain */ }
    expect(body).toMatchObject({ temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192, stream: true });
  });

  it("reports a server error", async () => {
    const fetchFn = (async () => new Response("boom", { status: 500 })) as any;
    await expect((async () => { for await (const _ of streamChat({ endpoint: "http://x/v1", model: "m", messages: [], sampling: SAFE_SAMPLING, fetchFn }, "1")) { /* */ } })()).rejects.toThrow(/Server error 500/);
  });
});

describe("think splitter", () => {
  const run = (chunks: string[], assumeOpen = false) => {
    const s = new ThinkSplitter(assumeOpen); let t = "", a = "";
    for (const c of chunks) { const r = s.push(c); t += r.thinking; a += r.answer; }
    const r = s.flush(); return { t: t + r.thinking, a: a + r.answer };
  };
  it("handles tags split across chunks", () => {
    expect(run(["<th", "ink>abc</thi", "nk>done"])).toEqual({ t: "abc", a: "done" });
  });
  it("handles a template that opens the thought in the prompt", () => {
    expect(run(["reasoning ", "here</think>", "answer"], true)).toEqual({ t: "reasoning here", a: "answer" });
  });
  it("passes plain answers and a lone < through", () => {
    expect(run(["a < b and c"])).toEqual({ t: "", a: "a < b and c" });
    expect(run(["no thinking"])).toEqual({ t: "", a: "no thinking" });
  });
  it("parses SSE payloads", () => {
    expect(parseSseData('{"choices":[{"delta":{"reasoning_content":"r"}}]}')?.reasoning).toBe("r");
    expect(parseSseData("[DONE]")).toBeNull();
  });
});

describe("geniex wrapper", () => {
  it("pulls with progress and reports done", async () => {
    const events: any[] = [];
    await pullModel("geniex", "org/m:Q4_0", (p) => events.push(p), fakeSpawn).done;
    expect(events.some((e) => e.percent === 50)).toBe(true);
    expect(events[events.length - 1].phase).toBe("done");
  });
  it("reports a failed pull and can cancel", async () => {
    const events: any[] = [];
    const prev = process.env.FAKE_PULL_FAIL; process.env.FAKE_PULL_FAIL = "1";
    await pullModel("geniex", "org/m", (p) => events.push(p), fakeSpawn).done;
    process.env.FAKE_PULL_FAIL = prev ?? ""; if (!prev) delete process.env.FAKE_PULL_FAIL;
    expect(events[events.length - 1].phase).toBe("error");
    const ev2: any[] = [];
    const p = pullModel("geniex", "org/m", (e) => ev2.push(e), fakeSpawn);
    p.cancel(); await p.done;
    expect(ev2[ev2.length - 1].phase).toBe("cancelled");
  });
  it("strips terminal control sequences from the progress line", async () => {
    const { EventEmitter } = await import("node:events");
    const mk = () => { const e: any = new EventEmitter(); e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.kill = () => {}; return e; };
    const child = mk();
    const events: any[] = [];
    const p = pullModel("geniex", "org/m", (e) => events.push(e), (() => child) as any);
    child.stdout.emit("data", Buffer.from("\x1b[?2004l\x1b[?25h\x1b[?1002l\x1b[?1003l\x1b[?1006l 42%\n"));
    child.emit("close", 0);
    await p.done;
    expect(events[0].line).toBe("42%");
    expect(events[0].percent).toBe(42);
  });
  it("parses list output, percent, disk", () => {
    expect(parseList("NAME SIZE\nunsloth/Qwen3-4B-GGUF:Q4_0   2.3 GB\n")).toEqual([{ name: "unsloth/Qwen3-4B-GGUF:Q4_0", ref: "unsloth/Qwen3-4B-GGUF:Q4_0", sizeGB: 2.3 }]);
    expect(parsePercent("Downloading 42.5% of 2.3GB")).toBe(42.5);
    expect(parsePercent("no progress")).toBeNull();
    expect(diskCheck(1, 2.3)?.id).toBe("disk");
    expect(diskCheck(50, 2.3)).toBeNull();
  });
});

describe("Hugging Face inspection", () => {
  const hw = buildProfile({ cpuName: "Snapdragon X Plus", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "NPU", driverVersion: "30.0.220.3000" }], npuSharedBytes: 7.8 * 1024 ** 3, osArch: "ARM64" }, "arm64");
  const gguf = buildGguf({ arch: "qwen3", blocks: 36, heads: 32, kvHeads: 8, embed: 2560, keyLength: 128, ctx: 262144, name: "Qwen3 4B" });
  const fakeFetch: FetchLike = async (url, init) => {
    const ok = (body: any) => ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
    if (url.includes("/tree/main")) {
      if (url.includes("missing")) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
      return ok([
        { type: "file", path: "m-Q4_K_M.gguf", size: 2.5 * 1024 ** 3 },
        { type: "file", path: "m-Q4_0.gguf", lfs: { size: 2.3 * 1024 ** 3 } },
        { type: "file", path: "README.md", size: 10 }
      ]);
    }
    if (url.endsWith("generation_config.json")) return ok({ temperature: 0.7, top_p: 0.8 });
    if (url.includes("m-Q4_0.gguf")) {
      const [s, e] = /bytes=(\d+)-(\d+)/.exec(init!.headers!.Range)!.slice(1).map(Number);
      const slice = gguf.subarray(s, e + 1);
      return { ok: true, status: 206, json: async () => ({}), arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.length) as ArrayBuffer };
    }
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  it("picks Q4_0, reads the header, scores green and takes sampling from the repo", async () => {
    const r = await inspectRepo(new HfClient(fakeFetch), "https://huggingface.co/org/qwen3-4b-GGUF", hw);
    expect(r.chosen?.quant).toBe("Q4_0");
    expect(r.gguf?.attentionLayers).toBe(36);
    expect(r.verdict?.level).toBe("green");
    expect(r.entry?.sampling.temperature).toBe(0.7);
    expect(r.entry?.sampling.presence_penalty).toBe(1.5);
  });
  it("explains a missing repo", async () => {
    await expect(inspectRepo(new HfClient(fakeFetch), "org/missing", hw)).rejects.toThrow(/not found/);
  });
  it("rejects nonsense input", async () => {
    await expect(inspectRepo(new HfClient(fakeFetch), "???", hw)).rejects.toThrow(/Paste/);
  });
});
