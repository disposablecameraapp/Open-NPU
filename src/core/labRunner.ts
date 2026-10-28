/**
 * Runs a series of prompts (see `promptLab.ts`) on the models that were picked, one model at a time, and scores every answer against the
 * ideal of its prompt. The prompts go to the model as they are written in the file: no planner, no router, no construction engine.
 * What talks to a model is given in (`LabDeps.ask`), so the order of the work and the scoring are tested without one.
 */
import { optionsFor, scoreAnswer, type LabFile, type LabOptions, type LabRun } from "./promptLab";

export interface LabModel { id: string; name: string }

export interface LabDeps {
  /** Gets a model ready (loads it); throws with the reason when it cannot. */
  prepare(model: LabModel, signal: AbortSignal): Promise<void>;
  /** One question to the loaded model; throws on a failure. */
  ask(model: LabModel, system: string | undefined, prompt: string, o: LabOptions, signal: AbortSignal): Promise<{ answer: string; seconds: number; tokens: number | null }>;
  emit(s: LabState): void;
}

export interface LabState {
  running: boolean;
  /** What is being done now, in a few words. */
  phase: string;
  total: number;
  done: number;
  runs: LabRun[];
  /** The models that were asked, in order (also the ones that could not be loaded). */
  models: string[];
  log: string[];
  /** Models that could not be loaded, with the reason. */
  failed: { model: string; error: string }[];
  stopped?: boolean;
}

export const emptyLab = (): LabState => ({ running: false, phase: "", total: 0, done: 0, runs: [], models: [], log: [], failed: [] });

export class LabRunner {
  private ac: AbortController | null = null;
  private s: LabState = emptyLab();
  constructor(private d: LabDeps) {}

  state(): LabState { return this.s; }
  get running() { return this.s.running; }

  stop() { this.ac?.abort(); }

  private set(p: Partial<LabState>) { this.s = { ...this.s, ...p }; this.d.emit(this.s); }
  private log(line: string) { this.set({ log: [...this.s.log, `${new Date().toLocaleTimeString()} ${line}`].slice(-300) }); }

  /** Starts a run; it goes on by itself, and `state()` or the emitted states tell where it is. */
  start(file: LabFile, models: LabModel[]): { ok: boolean; error?: string } {
    if (this.s.running) return { ok: false, error: "A run is already going." };
    if (!file.prompts.length) return { ok: false, error: "The file has no prompt." };
    if (!models.length) return { ok: false, error: "Pick at least one model." };
    this.ac = new AbortController();
    const total = models.length * file.prompts.reduce((n, p) => n + optionsFor(file, p).runs, 0);
    this.s = { ...emptyLab(), running: true, phase: "starting", total, models: models.map((m) => m.name) };
    this.d.emit(this.s);
    void this.loop(file, models, this.ac.signal);
    return { ok: true };
  }

  private async loop(file: LabFile, models: LabModel[], signal: AbortSignal) {
    try {
      for (const m of models) {
        if (signal.aborted) break;
        this.set({ phase: `loading ${m.name}` });
        try { await this.d.prepare(m, signal); }
        catch (e) {
          const error = signal.aborted ? "stopped" : (e as Error).message;
          this.log(`${m.name}: could not be loaded: ${error}`);
          this.set({ failed: [...this.s.failed, { model: m.name, error }], done: this.s.done + file.prompts.reduce((n, p) => n + optionsFor(file, p).runs, 0) });
          continue;
        }
        for (const p of file.prompts) {
          const o = optionsFor(file, p);
          for (let run = 1; run <= o.runs; run++) {
            if (signal.aborted) break;
            this.set({ phase: `${m.name} · ${p.name} · run ${run} of ${o.runs}` });
            let r: LabRun;
            try {
              const a = await this.d.ask(m, o.system, p.prompt, o, signal);
              r = { prompt: p.name, model: m.name, run, answer: a.answer, seconds: a.seconds, tokens: a.tokens, score: scoreAnswer(a.answer, p) };
              this.log(`${m.name} · ${p.name} · run ${run}: score ${r.score.total}, ${a.seconds.toFixed(1)} s`);
            } catch (e) {
              if (signal.aborted) break;
              const error = (e as Error).message;
              r = { prompt: p.name, model: m.name, run, answer: "", seconds: 0, tokens: null, score: { similarity: null, checks: [], total: 0 }, error };
              this.log(`${m.name} · ${p.name} · run ${run}: failed: ${error}`);
            }
            this.set({ runs: [...this.s.runs, r], done: this.s.done + 1 });
          }
        }
      }
    } finally {
      this.set({ running: false, phase: signal.aborted ? "stopped" : "done", stopped: signal.aborted });
    }
  }
}
