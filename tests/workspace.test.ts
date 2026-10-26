import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { artifactsIn, parseSegments, previewDocument, stripArtifacts } from "../src/core/artifacts";
import { buildSystemPrompt, knowledgeBudget, packKnowledge } from "../src/core/projects";
import { describeSchedule, isDue, nextRun, validateSchedule } from "../src/core/schedule";
import { JsonStore } from "../src/core/library";
import { Scheduler } from "../src/core/scheduler";
import type { Project, ScheduledTask } from "../src/shared/types";

describe("artifact parsing", () => {
  it("splits prose and artifacts, strips code fences", () => {
    const t = 'Here you go.\n<artifact type="html" title="Timer">\n```html\n<h1>Hi</h1>\n```\n</artifact>\nDone.';
    const s = parseSegments(t);
    expect(s.map((x) => x.t)).toEqual(["text", "artifact", "text"]);
    const a = artifactsIn(t)[0];
    expect(a).toMatchObject({ kind: "html", title: "Timer", content: "<h1>Hi</h1>", open: false });
  });
  it("handles an artifact that is still streaming, including a half-written tag", () => {
    expect(parseSegments('Sure <artifact type="code" language="python" title="x">print(1')[1]).toMatchObject({ t: "artifact", open: true, kind: "code", language: "python", content: "print(1" });
    expect(parseSegments("Sure <artif")).toEqual([{ t: "text", v: "Sure " }]);
    expect(parseSegments('Sure <artifact type="ht')[1]).toMatchObject({ open: true });
    expect(artifactsIn('<artifact type="svg" title="a"><svg/>')).toHaveLength(0);
  });
  it("numbers several artifacts and ignores look-alike words", () => {
    const t = '<artifact type="md" title="A">one</artifact> and <artifact type="svg" title="B"><svg/></artifact> <artifactory>';
    expect(artifactsIn(t).map((a) => [a.index, a.kind])).toEqual([[0, "markdown"], [1, "svg"]]);
    expect(stripArtifacts(t)).toContain("[A]");
    expect(stripArtifacts(t)).toContain("<artifactory>");
  });
  it("puts a network-blocking CSP into previews", () => {
    expect(previewDocument("html", "<p>x</p>")).toContain("default-src 'none'");
    expect(previewDocument("html", "<html><head><title>t</title></head></html>")).toMatch(/<head><meta http-equiv="Content-Security-Policy"/);
    expect(previewDocument("svg", "<svg/>")).toContain("<svg/>");
  });
});

const project = (files: { name: string; content: string }[], extra: Partial<Project> = {}): Project => ({
  id: "p", name: "French", description: "Learn French", instructions: "Answer in French.", created: 0, updated: 0,
  files: files.map((f, i) => ({ id: String(i), ...f })), ...extra
});

describe("project context", () => {
  it("builds the system prompt in order", () => {
    const s = buildSystemPrompt({ custom: "I am Sam", project: project([{ name: "notes.md", content: "Bonjour" }]), extra: "Be brief", knowledgeChars: 1000 });
    expect(s.indexOf("I am Sam")).toBeLessThan(s.indexOf('project "French"'));
    expect(s).toContain("Answer in French.");
    expect(s).toContain('<file name="notes.md">\nBonjour');
    expect(s).toContain("Be brief");
    expect(s).toContain("<artifact");
    expect(buildSystemPrompt({ knowledgeChars: 10, artifacts: false })).toBe("");
    expect(buildSystemPrompt({ custom: "I am Fabien, a software engineer", knowledgeChars: 10, artifacts: false })).toMatch(/"I" and "my" are the USER, never you[\s\S]*I am Fabien/);
    const voice = buildSystemPrompt({ knowledgeChars: 10 });
    expect(voice).toMatch(/first person singular[\s\S]*never "we"/);
    expect(voice).toMatch(/did not paste them/);
  });
  it("cuts big files to a fair share and keeps small ones whole", () => {
    const p = project([{ name: "small", content: "a".repeat(100) }, { name: "big", content: "b".repeat(10000) }]);
    const k = packKnowledge(p, 1000);
    expect(k.truncated).toEqual(["big"]);
    expect(k.text).toContain("a".repeat(100));
    expect(k.text.length).toBeLessThan(1400);
  });
  it("lets knowledge use about a third of the context", () => {
    expect(knowledgeBudget(16384)).toBeCloseTo(19114, -2);
    expect(knowledgeBudget(100)).toBe(2000);
  });
});

describe("schedules", () => {
  const at = (h: number, m = 0, d = 10) => new Date(2026, 5, d, h, m).getTime(); // 10 June 2026 is a Wednesday
  it("finds the next daily and weekly times", () => {
    expect(nextRun({ kind: "daily", time: "08:30" }, at(7))).toBe(at(8, 30));
    expect(nextRun({ kind: "daily", time: "08:30" }, at(9))).toBe(at(8, 30, 11));
    expect(nextRun({ kind: "daily", time: "08:30" }, at(8, 30))).toBe(at(8, 30, 11));
    expect(nextRun({ kind: "weekly", days: [1], time: "09:00" }, at(10))).toBe(at(9, 0, 15)); // next Monday
    expect(new Date(nextRun({ kind: "weekly", days: [3], time: "09:00" }, at(10))!).getDay()).toBe(3);
  });
  it("handles interval and once", () => {
    expect(nextRun({ kind: "interval", everyMin: 15 }, 1000)).toBe(1000 + 15 * 60000);
    expect(nextRun({ kind: "once", at: 5000 }, 1000)).toBe(5000);
    expect(nextRun({ kind: "once", at: 5000 }, 6000)).toBeNull();
  });
  it("validates and describes", () => {
    expect(validateSchedule({ kind: "daily", time: "25:00" }, 0)).toBeTruthy();
    expect(validateSchedule({ kind: "weekly", days: [], time: "08:00" }, 0)).toBeTruthy();
    expect(validateSchedule({ kind: "once", at: 1 }, 5)).toBeTruthy();
    expect(validateSchedule({ kind: "interval", everyMin: 30 }, 0)).toBeNull();
    expect(describeSchedule({ kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" })).toBe("Weekdays at 08:00");
    expect(describeSchedule({ kind: "interval", everyMin: 120 })).toBe("Every 2 hours");
  });
});

function task(over: Partial<ScheduledTask> = {}): ScheduledTask {
  return { id: "t1", name: "Brief", prompt: "hi", projectId: null, modelId: null, schedule: { kind: "interval", everyMin: 10 }, enabled: true, created: 0, nextRun: 1000, running: false, runs: [], ...over };
}

describe("scheduler", () => {
  const tmp = () => new JsonStore<ScheduledTask>(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "npu-")), "tasks.json"));
  it("persists and reloads the store", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "npu-")), "x", "a.json");
    new JsonStore<{ id: string }>(f).upsert({ id: "a" });
    expect(new JsonStore<{ id: string }>(f).list()).toEqual([{ id: "a" }]);
    fs.writeFileSync(f, "{ broken");
    expect(new JsonStore<{ id: string }>(f).list()).toEqual([]);
  });
  it("runs due tasks, records the result and reschedules", async () => {
    const store = tmp();
    store.upsert(task());
    store.upsert(task({ id: "later", nextRun: 9e12 }));
    store.upsert(task({ id: "off", enabled: false }));
    let now = 5000;
    const seen: string[] = [];
    const s = new Scheduler({ store, now: () => now, canRun: () => true, onChange: () => undefined, run: async (t) => { seen.push(t.id); return { status: "ok", output: "done", artifactIds: ["a1"] }; } });
    expect(await s.tick()).toBe(1);
    expect(seen).toEqual(["t1"]);
    const t = store.get("t1")!;
    expect(t.running).toBe(false);
    expect(t.runs[0]).toMatchObject({ status: "ok", output: "done", artifactIds: ["a1"] });
    expect(t.nextRun).toBe(5000 + 10 * 60000);
    now += 60000;
    expect(await s.tick()).toBe(0);
  });
  it("records failures, disables one-shot tasks and waits while the user is chatting", async () => {
    const store = tmp();
    store.upsert(task({ schedule: { kind: "once", at: 1000 } }));
    let busy = true;
    const s = new Scheduler({ store, now: () => 2000, canRun: () => !busy, onChange: () => undefined, run: async () => { throw new Error("no model"); } });
    expect(await s.tick()).toBe(0);
    busy = false;
    expect(await s.tick()).toBe(1);
    const t = store.get("t1")!;
    expect(t.runs[0]).toMatchObject({ status: "error", error: "no model" });
    expect(t.enabled).toBe(false);
    expect(t.nextRun).toBeNull();
    expect(isDue(t, 9e12)).toBe(false);
  });
  it("clears a running flag left over from a crashed session", () => {
    const store = tmp();
    store.upsert(task({ running: true }));
    const s = new Scheduler({ store, canRun: () => false, onChange: () => undefined, run: async () => ({ status: "ok", output: "", artifactIds: [] }) });
    s.start(1e9);
    s.stop();
    expect(store.get("t1")!.running).toBe(false);
  });
});
