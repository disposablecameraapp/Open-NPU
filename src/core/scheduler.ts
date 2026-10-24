import type { ScheduledTask, TaskRun } from "../shared/types";
import { JsonStore } from "./library";
import { isDue, nextRun } from "./schedule";

export interface SchedulerDeps {
  store: JsonStore<ScheduledTask>;
  run: (task: ScheduledTask) => Promise<Omit<TaskRun, "id" | "startedAt" | "finishedAt">>;
  /** False while the user is chatting: the NPU runs one model at a time. */
  canRun: () => boolean;
  onChange: (t: ScheduledTask) => void;
  now?: () => number;
  keepRuns?: number;
}

/** Runs tasks when they are due, one at a time. Tasks missed while the app was closed run once on the next tick. */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private now: () => number;
  constructor(private d: SchedulerDeps) { this.now = d.now ?? Date.now; }

  start(everyMs = 30_000) {
    // a task still marked running died with the last session
    for (const t of this.d.store.list()) if (t.running) this.d.store.upsert({ ...t, running: false });
    this.stop();
    this.timer = setInterval(() => void this.tick(), everyMs);
    void this.tick();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let ran = 0;
    try {
      for (const t of this.d.store.list()) {
        if (!this.d.canRun()) break;
        if (isDue(t, this.now())) { await this.execute(t.id); ran++; }
      }
    } finally { this.ticking = false; }
    return ran;
  }

  async execute(id: string): Promise<TaskRun | null> {
    const t = this.d.store.get(id);
    if (!t || t.running) return null;
    const startedAt = this.now();
    this.save({ ...t, running: true });
    let result: Omit<TaskRun, "id" | "startedAt" | "finishedAt">;
    try { result = await this.d.run(t); }
    catch (e) { result = { status: "error", output: "", error: (e as Error).message, artifactIds: [] }; }
    const finishedAt = this.now();
    const run: TaskRun = { id: `${t.id}:${startedAt}`, startedAt, finishedAt, ...result };
    const fresh = this.d.store.get(id) ?? t; // the user may have edited it meanwhile
    const next = nextRun(fresh.schedule, finishedAt);
    this.save({
      ...fresh, running: false, nextRun: next,
      enabled: fresh.schedule.kind === "once" ? false : fresh.enabled,
      runs: [run, ...fresh.runs].slice(0, this.d.keepRuns ?? 20)
    });
    return run;
  }

  private save(t: ScheduledTask) { this.d.store.upsert(t); this.d.onChange(t); }
}
