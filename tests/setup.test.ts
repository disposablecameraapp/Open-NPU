import { describe, expect, it } from "vitest";
import { geniexCandidates, locateGeniex, initialSteps } from "../src/core/setup";
import { SetupService, installGeniex } from "../src/main/setup";

const env = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local", USERPROFILE: "C:\\Users\\me", Path: "C:\\Windows;C:\\Tools" } as any;

describe("locating geniex after the installer", () => {
  it("prefers a path the installer printed", () => {
    const out = "Installed to C:\\Users\\me\\AppData\\Local\\GenieX CLI\nAdd to PATH: C:\\Users\\me\\bin\\geniex.exe\n";
    expect(geniexCandidates(out, env)).toContain("C:\\Users\\me\\bin\\geniex.exe");
    expect(geniexCandidates(out, env)).toContain("C:\\Users\\me\\AppData\\Local\\GenieX CLI\\geniex.exe");
  });
  it("falls back to the documented folder and PATH", () => {
    const have = new Set(["C:\\Tools\\geniex.exe"]);
    expect(locateGeniex("", env, (p) => have.has(p))).toBe("C:\\Tools\\geniex.exe");
    expect(locateGeniex("", env, () => false)).toBeNull();
  });
});

describe("installGeniex", () => {
  const mk = (over: any = {}) => ({
    download: async (_u: string, _d: string, cb: (p: number) => void) => { cb(50); cb(100); },
    run: async () => ({ code: 0, output: "ok C:\\Users\\me\\AppData\\Local\\GenieX CLI" }),
    exists: (p: string) => p === "C:\\Users\\me\\AppData\\Local\\GenieX CLI\\geniex.exe",
    env, tmpDir: require("os").tmpdir() + "/opennpu-test", ...over
  });
  it("downloads, runs, and returns the found path with progress", async () => {
    const seen: any[] = [];
    expect(await installGeniex(mk(), (p, m) => seen.push([p, m]))).toMatch(/GenieX CLI\\geniex\.exe$/);
    expect(seen.some(([p]) => p === 50)).toBe(true);
  });
  it("explains when the installer ran but nothing was found, and when it failed", async () => {
    await expect(installGeniex(mk({ exists: () => false }), () => undefined)).rejects.toThrow(/Locate geniex\.exe/);
    await expect(installGeniex(mk({ run: async () => ({ code: 5, output: "boom" }), exists: () => false }), () => undefined)).rejects.toThrow(/code 5.*boom/);
    await expect(installGeniex(mk({ download: async () => { throw new Error("Download failed (HTTP 403)"); } }), () => undefined)).rejects.toThrow(/403/);
  });
});

describe("setup service", () => {
  const ops = (over: any = {}) => ({
    geniexPath: () => null as string | null,
    installGeniex: async (p: any) => { p(50, "x"); return "C:\\g\\geniex.exe"; },
    onGeniexInstalled: () => undefined,
    voiceNeeds: () => ({ stt: true, tts: true, sttName: "Whisper base", ttsName: "Kokoro" }),
    installVoice: async () => undefined,
    ...over
  });
  it("installs everything missing in order and finishes", async () => {
    const order: string[] = [];
    const s = new SetupService(ops({ installVoice: async (k: string) => { order.push(k); }, onGeniexInstalled: () => order.push("geniex") }));
    expect(s.check()).toBe(true);
    expect(s.status().awaitingConfirm).toBe(true);
    await s.confirm();
    expect(order).toEqual(["geniex", "stt", "tts"]);
    expect(s.status().steps.every((x) => x.state === "done")).toBe(true);
    expect(s.status().active).toBe(false);
  });
  it("does nothing when everything is already installed", () => {
    const s = new SetupService(ops({ geniexPath: () => "C:\\g.exe", voiceNeeds: () => ({ stt: false, tts: false, sttName: "a", ttsName: "b" }) }));
    expect(s.check()).toBe(false);
  });
  it("keeps going after a failure, stays on screen, and retry works", async () => {
    let fail = true;
    const s = new SetupService(ops({ installGeniex: async () => { if (fail) throw new Error("no network"); return "C:\\g\\geniex.exe"; } }));
    s.check(); await s.confirm();
    const st = s.status();
    expect(st.steps[0].state).toBe("error");
    expect(st.steps[0].error).toMatch(/no network/);
    expect(st.steps[1].state).toBe("done");
    expect(st.active).toBe(true);
    fail = false;
    s.retry("geniex");
    await new Promise((r) => setTimeout(r, 50));
    expect(s.status().steps[0].state).toBe("done");
    expect(s.status().active).toBe(false);
  });
  it("downloads nothing until the person confirms, and nothing at all when they decline", async () => {
    const calls: string[] = [];
    const s = new SetupService(ops({ installGeniex: async () => { calls.push("geniex"); return "C:\\g\\geniex.exe"; }, installVoice: async (k: string) => { calls.push(k); } }));
    s.check(); await s.run();
    expect(calls).toEqual([]);
    expect(s.status().awaitingConfirm).toBe(true);
    s.decline();
    await s.run();
    expect(calls).toEqual([]);
    expect(s.status().active).toBe(false);
    expect(s.status().steps.every((x) => x.state === "skipped" || x.id === "llama")).toBe(true); // llama.cpp is only a step when the GPU or CPU is chosen
    expect(s.check()).toBe(false);
  });
  it("skip removes a step from the work", async () => {
    const s = new SetupService(ops());
    s.check(); s.skip("voice-tts"); await s.confirm();
    expect(s.status().steps.find((x) => x.id === "voice-tts")!.state).toBe("skipped");
  });
});
void initialSteps;
