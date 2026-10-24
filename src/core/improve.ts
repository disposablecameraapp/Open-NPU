import type { ChatEvent, ChatMessage, LoopRun, ReviewStep } from "../shared/types";
import { ArtifactSegment, artifactsIn } from "./artifacts";
import type { CheckReport } from "./codecheck";
import { integrate, parseReply } from "./review";

export const DEFAULT_GOAL = "Make it noticeably better: richer features, nicer visuals and polish, smoother controls. Keep everything that already works.";

export const IMPROVER_INSTRUCTIONS = [
  "You improve a file round after round. Each round you make ONE new improvement that fits the direction you are given, and nothing else.",
  "Never break what already works. Do not remove features. Pages cannot use the network or external files: everything stays inline (draw 3D with canvas or hand-written WebGL, no libraries).",
  "Reply with a first line `Improvement: <one short sentence>`, then the change as edit blocks with lines copied exactly from the current file:",
  '<edit file="exact file name">',
  "<<<<<<< SEARCH",
  "the old lines",
  "=======",
  "the new lines",
  ">>>>>>> REPLACE",
  "</edit>",
  "Several blocks are fine. Send the whole file as <artifact type=\"…\" title=\"exact file name\">…</artifact> only if most of it changes."
].join("\n");

export interface ImproveOptions {
  id: string;
  /** The whole answer so far, artifacts included. */
  answer: string;
  /** What the user first asked for. */
  request: string;
  /** What to improve, in the user's words; empty = DEFAULT_GOAL. */
  direction: string;
  rounds: number;
  /** When the time budget ends (epoch ms). */
  endsAt: number;
  /** Characters of code that fit in the model's context next to the instructions. */
  maxChars: number;
  now?: () => number;
  check: (a: ArtifactSegment) => Promise<CheckReport>;
  askWriter: (messages: ChatMessage[]) => Promise<string>;
  signal?: AbortSignal;
}

const code = (arts: ArtifactSegment[]) => arts.map((a) =>
  `<artifact type="${a.kind}"${a.kind === "code" ? ` language="${a.language}"` : ""} title="${a.title.replace(/"/g, "'")}">\n${a.content.replace(/\s+$/, "")}\n</artifact>`).join("\n");

export function roundPrompt(o: { request: string; direction: string; done: string[]; arts: ArtifactSegment[]; round: number; rounds: number }): string {
  const past = o.done.length ? o.done.map((d) => `- ${d}`).join("\n") : "- none yet";
  return `The user first asked:\n${o.request.trim().slice(0, 1500)}\n\nDirection for the improvements: ${o.direction.trim() || DEFAULT_GOAL}\n\nImprovements already made:\n${past}\n\nCurrent file(s):\n${code(o.arts)}\n\nRound ${o.round} of ${o.rounds}. Make ONE new improvement, different from the ones above. Start with "Improvement: …", then the edit blocks.`;
}

function fixPrompt(arts: ArtifactSegment[], reports: CheckReport[]): string {
  const errs = arts.map((a, i) => (reports[i].errors.length ? `${a.title}:\n${reports[i].errors.map((e) => `- ${e}`).join("\n")}` : "")).filter(Boolean).join("\n\n");
  return `Running the file after your change gave errors:\n${errs}\n\nCurrent file(s):\n${code(arts)}\n\nFix them with edit blocks, changing as little as possible. Do not undo the improvement.`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Keeps improving the files of an answer until the rounds or the time run out. Each round starts from a clean context
 * (the request, what was already done, the latest code), makes one change, runs the result and keeps it only if it runs
 * without errors: a round that cannot be fixed is thrown away, so the file never gets worse. Yields "loop" events (the
 * whole run each time) and "replace" events with the improved answer after every kept round.
 */
export async function* improve(o: ImproveOptions): AsyncGenerator<ChatEvent> {
  const now = o.now ?? Date.now;
  let text = o.answer;
  if (!artifactsIn(text).length) return;
  const steps: ReviewStep[] = [];
  const done: string[] = [];
  let round = 0;
  let failedInARow = 0;
  const loop = (status: LoopRun["status"]): ChatEvent => ({ id: o.id, type: "loop", loop: { status, round, rounds: o.rounds, endsAt: o.endsAt, accepted: done.length, steps: [...steps] } });
  const note = (kind: ReviewStep["kind"], t: string) => steps.push({ kind, text: t });
  const started = now();
  let stop = "";

  try {
    for (round = 1; round <= o.rounds; round++) {
      if (o.signal?.aborted) throw new Error("aborted");
      if (now() >= o.endsAt) { stop = "The time is up."; round--; break; }
      const arts = artifactsIn(text);
      if (arts.reduce((n, a) => n + a.content.length, 0) > o.maxChars) { stop = "The file has grown too long for this model's context, so it stops here."; round--; break; }
      note("info", `Round ${round}: choosing an improvement…`);
      yield loop("running");

      const reply = await o.askWriter([
        { role: "system", content: IMPROVER_INSTRUCTIONS },
        { role: "user", content: roundPrompt({ request: o.request, direction: o.direction, done, arts, round, rounds: o.rounds }) }
      ]);
      if (o.signal?.aborted) throw new Error("aborted");
      steps.pop();
      const what = /^\s*improvement:\s*(.+)$/im.exec(reply)?.[1]?.trim().slice(0, 160) ?? "an improvement";
      let next = integrate(text, parseReply(reply));
      if (!next.changed) {
        failedInARow++;
        note("error", `Round ${round}: the change could not be applied (${what}).`);
        if (failedInARow >= 3) { stop = "Three rounds in a row produced nothing usable, so it stops here."; break; }
        yield loop("running");
        continue;
      }

      // run it; two tries to fix what the change broke
      let candidate = next.text;
      let ok = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        const now2 = artifactsIn(candidate);
        const reports: CheckReport[] = [];
        for (const a of now2) reports.push(await o.check(a));
        const errors = reports.reduce((n, r) => n + r.errors.length, 0);
        if (!errors) { ok = true; break; }
        if (attempt === 2) { note("error", `Round ${round}: still ${plural(errors, "error")} after fixing, so "${what}" was thrown away.`); break; }
        note("info", `Round ${round}: ${plural(errors, "error")}, fixing…`);
        yield loop("running");
        steps.pop();
        const fix = await o.askWriter([
          { role: "system", content: IMPROVER_INSTRUCTIONS },
          { role: "user", content: fixPrompt(now2, reports) }
        ]);
        if (o.signal?.aborted) throw new Error("aborted");
        next = integrate(candidate, parseReply(fix));
        if (!next.changed) { note("error", `Round ${round}: the fix could not be applied, so "${what}" was thrown away.`); break; }
        candidate = next.text;
      }
      if (!ok) {
        failedInARow++;
        yield loop("running");
        if (failedInARow >= 3) { stop = "Three rounds in a row failed, so it stops here."; break; }
        continue;
      }
      failedInARow = 0;
      text = candidate;
      done.push(what);
      note("ok", `Round ${round}: ${what}`);
      yield { id: o.id, type: "replace", text };
      yield loop("running");
    }
  } catch (e) {
    if (o.signal?.aborted) throw e;
    stop = `It stopped: ${(e as Error).message}`;
  }
  const minutes = Math.max(1, Math.round((now() - started) / 60000));
  note(done.length ? "ok" : "error", `${stop ? `${stop} ` : ""}${plural(done.length, "improvement")} kept in ${minutes} min${o.endsAt ? ` (budget until ${clock(o.endsAt)})` : ""}.`);
  yield loop("done");
}
