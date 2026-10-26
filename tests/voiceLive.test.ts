import { describe, expect, it } from "vitest";
import { EnergyVad } from "../src/core/vad";
import { endSilenceFor } from "../src/core/endpoint";
import { cleanTranscript } from "../src/core/transcript";
import { LiveDecoder, stabilize } from "../src/core/live";
import { encodeWav } from "../src/core/wav";
import { VoiceEngine } from "../src/core/voiceEngine";
import { clampVoice } from "../src/core/voiceModels";
import { foundrySpeechModels, parseModelList, foundryCatalogEntries } from "../src/core/foundry";

const tone = (ms: number, amp = 0.2, sr = 16000) => { const a = new Float32Array(Math.round((sr * ms) / 1000)); for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * 220 * i) / sr); return a; };
const quiet = (ms: number, sr = 16000) => new Float32Array(Math.round((sr * ms) / 1000)).map(() => (Math.random() - 0.5) * 0.004);

describe("vad for live speech", () => {
  it("gives the audio so far while speaking, and nothing between utterances", () => {
    const v = new EnergyVad();
    expect(v.snapshot()).toBeNull();
    v.push(quiet(400)); v.push(tone(800));
    expect(v.snapshot()!.length).toBeGreaterThan(16000 * 0.7);
    v.push(quiet(1500));
    expect(v.snapshot()).toBeNull();
  });
  it("end event counts the speech without the silence that ended it", () => {
    const v = new EnergyVad({ endSilenceMs: 900 });
    const ev = [...v.push(quiet(400)), ...v.push(tone(800)), ...v.push(quiet(1500))];
    const end = ev.find((e) => e.type === "end") as any;
    expect(end.speechSamples).toBeLessThan(end.samples.length - 16000 * 0.5);
    expect(end.speechSamples).toBeGreaterThan(16000 * 0.8);
    expect(end.rms).toBeGreaterThan(0.1);
  });
  it("a shorter pause ends the utterance sooner, and the minimum speech and level are settable", () => {
    const run = (ms: number) => { const v = new EnergyVad(); v.setEndSilence(ms); const ev = [...v.push(quiet(300)), ...v.push(tone(700)), ...v.push(quiet(ms - 100))]; return ev.some((e) => e.type === "end"); };
    expect(run(400)).toBe(false); // 300 ms of silence is not yet 400
    const v = new EnergyVad(); v.setEndSilence(300);
    expect([...v.push(quiet(300)), ...v.push(tone(700)), ...v.push(quiet(500))].some((e) => e.type === "end")).toBe(true);
    const w = new EnergyVad(); w.setMinSpeech(900);
    expect([...w.push(quiet(300)), ...w.push(tone(600)), ...w.push(quiet(1500))].some((e) => e.type === "end")).toBe(false);
    const q = new EnergyVad(); q.setMinRms(0.5);
    expect(q.push(Float32Array.from([...quiet(300), ...tone(800, 0.3), ...quiet(1000)])).length).toBe(0);
  });
});

describe("end of speech follows the sentence", () => {
  it("a finished sentence is answered sooner, an open one waits longer", () => {
    expect(endSilenceFor("What is the weather like today?", 800)).toBeLessThan(800);
    expect(endSilenceFor("Quel temps fait-il aujourd'hui ?", 800)).toBeLessThan(800);
    expect(endSilenceFor("I would like to know, ", 800)).toBeGreaterThan(800);
    expect(endSilenceFor("je voudrais savoir si", 800)).toBeGreaterThan(800);
    expect(endSilenceFor("et", 800)).toBeGreaterThan(800);
    expect(endSilenceFor("tell me about dogs", 800)).toBe(800);
    expect(endSilenceFor("", 800)).toBe(800);
  });
  it("stays inside sane bounds", () => {
    expect(endSilenceFor("Done.", 300)).toBeGreaterThanOrEqual(250);
    expect(endSilenceFor("and", 2500)).toBeLessThanOrEqual(3000);
  });
});

describe("what a recognizer invents on silence", () => {
  it("drops tags and video captions, keeps speech", () => {
    expect(cleanTranscript("[BLANK_AUDIO]")).toBe("");
    expect(cleanTranscript(" ... ")).toBe("");
    expect(cleanTranscript("Thanks for watching!")).toBe("");
    expect(cleanTranscript("Sous-titrage ST' 501")).toBe("");
    expect(cleanTranscript("Bonjour, comment ça va ?")).toBe("Bonjour, comment ça va ?");
  });
  it("drops sound descriptions anywhere in the text", () => {
    expect(cleanTranscript("(coughing)")).toBe("");
    expect(cleanTranscript("*sighs*")).toBe("");
    expect(cleanTranscript("[Music]")).toBe("");
    expect(cleanTranscript("(toux)")).toBe("");
    expect(cleanTranscript("♪ la la la ♪")).toBe("");
    expect(cleanTranscript("Bonjour (coughing) comment ça va ?")).toBe("Bonjour comment ça va ?");
    expect(cleanTranscript("Hello [laughter] , world")).toBe("Hello, world");
  });
  it("drops a lone 'thank you' only when the sound was quiet and short", () => {
    expect(cleanTranscript("Thank you.", { rms: 0.01, ms: 900 })).toBe("");
    expect(cleanTranscript("Thank you.", { rms: 0.1, ms: 900 })).toBe("Thank you.");
    expect(cleanTranscript("Merci.")).toBe("Merci.");
  });
});

describe("live words", () => {
  it("what two decodes agree on settles, the end keeps moving", () => {
    expect(stabilize("", "hello wor")).toEqual({ settled: "", moving: "hello wor" });
    expect(stabilize("hello wor", "Hello world how")).toEqual({ settled: "", moving: "Hello world how" });
    expect(stabilize("hello world how", "Hello world, how are you")).toEqual({ settled: "Hello world,", moving: "how are you" });
  });
  it("a correction of an earlier word is shown as moving again", () => {
    const t = stabilize("recognize speech now", "wreck a nice beach now");
    expect(t.settled).toBe("");
    expect(t.moving).toBe("wreck a nice beach now");
  });
  it("decodes the growing audio one at a time and keeps the last text for the end", async () => {
    const seen: number[] = [];
    let release: (() => void) | null = null;
    let t = 0;
    const d = new LiveDecoder({
      decode: (s) => { seen.push(s.length); return new Promise((r) => { release = () => r(`words ${s.length}`); }); },
      onText: () => undefined, now: () => t, gapMs: 0
    });
    await d.tick(new Float32Array(1000)); // too little new sound
    expect(seen).toEqual([]);
    const p = d.tick(new Float32Array(16000));
    await d.tick(new Float32Array(20000)); // one is running
    expect(seen).toEqual([16000]);
    release!(); await p;
    expect(d.current).toBe("words 16000");
    expect(d.reusable(16000)).toBe("words 16000"); // it saw all the speech
    expect(d.reusable(24000)).toBeNull(); // speech went on after it
    t = 1000;
    const p2 = d.tick(new Float32Array(24000)); release!(); await p2;
    expect(d.reusable(24000)).toBe("words 24000");
  });
  it("a skipped decode is asked again later, a reset forgets the old utterance", async () => {
    let n = 0, now = 0;
    const d = new LiveDecoder({ decode: async () => (++n === 1 ? null : "hi there"), onText: () => undefined, now: () => now, gapMs: 300 });
    await d.tick(new Float32Array(16000));
    expect(d.current).toBe("");
    await d.tick(new Float32Array(16000)); // too soon
    expect(n).toBe(1);
    now = 400; await d.tick(new Float32Array(16000));
    expect(d.current).toBe("hi there");
    d.reset();
    expect(d.current).toBe(""); expect(d.reusable(0)).toBeNull();
  });
});

describe("a recognizer busy with the end of an utterance", () => {
  it("previews are skipped while it works, the final decode always runs", async () => {
    let gate: (() => void) | null = null;
    const engine = new VoiceEngine({
      createStt: async () => ({ decode: (s) => new Promise((r) => { gate = () => r(`n${s.length}`); }) }),
      createTts: async () => { throw new Error("no"); }
    });
    await engine.loadStt({});
    const first = engine.transcribe(new Float32Array(16000), 16000, true);
    expect(await engine.transcribe(new Float32Array(16000), 16000, true)).toBeNull();
    const final = engine.transcribe(new Float32Array(8000), 16000, false);
    gate!(); expect(await first).toBe("n16000");
    await new Promise((r) => setTimeout(r)); gate!();
    expect(await final).toBe("n8000");
  });
});

describe("wav", () => {
  it("writes a 16-bit mono header and clips", () => {
    const w = encodeWav(Float32Array.from([0, 1, -1, 2]), 16000);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([32767, -32767, 32767]);
    expect(w.length).toBe(44 + 8);
  });
});

describe("microphone settings", () => {
  it("are held to their range", () => {
    expect(clampVoice("minLevel", 5)).toBe(0.125);
    expect(clampVoice("endSilenceMs", 10)).toBe(200);
    expect(clampVoice("minSpeechMs", NaN)).toBe(300);
    expect(clampVoice("interruptMs", 10)).toBe(200);
  });
});

describe("Foundry Local speech models", () => {
  const row = (alias: string, dev: string, task: string, size: string, id: string) => `${alias.padEnd(20)}  ${dev.padEnd(8)}  ${task.padEnd(10)}  ${size.padEnd(9)}  MIT         ${id}`;
  const head = "Alias                 Device    Task        File Size  License     Model ID\n";
  const table = head + [row("whisper-tiny", "NPU", "speech", "0.30 GB", "whisper-tiny-qnn-npu"), row("", "CPU", "speech", "0.20 GB", "whisper-tiny-generic-cpu"), row("qwen2.5-0.5b", "CPU", "chat", "0.50 GB", "qwen2.5-0.5b-cpu"), row("whisper-small", "CPU", "speech", "0.90 GB", "whisper-small-cpu")].join("\n");
  const variants = parseModelList(table);
  it("are listed with their device, the NPU build first, and are not chat models", () => {
    const m = foundrySpeechModels(variants);
    expect(m.map((x) => x.id)).toEqual(["foundry-stt:whisper-tiny", "foundry-stt:whisper-small"]);
    expect(m[0]).toMatchObject({ kind: "stt", family: "foundry", device: "NPU", foundryAlias: "whisper-tiny" });
    expect(foundryCatalogEntries(variants).map((e) => e.id)).toEqual(["foundry:qwen2.5-0.5b"]);
  });
  it("are found even when the table does not say what they are", () => {
    const m = foundrySpeechModels(parseModelList(head + row("whisper-base", "NPU", "-", "0.40 GB", "whisper-base-npu")));
    expect(m).toHaveLength(1);
    expect(foundryCatalogEntries(parseModelList(head + row("whisper-base", "NPU", "-", "0.40 GB", "whisper-base-npu")))).toHaveLength(0);
  });
});
