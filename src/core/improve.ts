import type { ChatEvent, ChatMessage, LoopRun, ReviewStep } from "../shared/types";
import { ArtifactSegment, artifactsIn } from "./artifacts";
import type { CheckReport } from "./codecheck";
import { integrate, parseReply } from "./review";
import { FOCUS_FROM, Range, changeSpan, diffText, errorLines, excerpts, outline, outlineText, resolveSpots } from "./focus";

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

export const PLANNER_INSTRUCTIONS = [
  "You improve a file round after round. You only see a map of the file (its landmarks and the line each starts on), not its code.",
  "Pick ONE new improvement that fits the direction you are given, and say where in the file it goes.",
  "Reply with exactly two lines:",
  "Improvement: <one short sentence>",
  "Where: <1 to 4 landmark names or line ranges from the map, separated by commas>"
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
  /** Files at least this long are read in pieces (default FOCUS_FROM). */
  focusFrom?: number;
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

const fileTag = (a: ArtifactSegment, body: string) => `<file name="${a.title.replace(/"/g, "'")}">\n${body}\n</file>`;

/** Outlines of every file: what the model sees to choose where to work. */
export function mapPrompt(o: { request: string; direction: string; done: string[]; arts: ArtifactSegment[]; round: number; rounds: number }): string {
  const past = o.done.length ? o.done.map((d) => `- ${d}`).join("\n") : "- none yet";
  return `The user first asked:\n${o.request.trim().slice(0, 600)}\n\nDirection for the improvements: ${o.direction.trim() || DEFAULT_GOAL}\n\nImprovements already made:\n${past}\n\nMap of the file(s):\n${o.arts.map((a) => outlineText(a.title, a.content)).join("\n\n")}\n\nRound ${o.round} of ${o.rounds}. Choose ONE new improvement, different from the ones above, and where it goes.`;
}

/** The pieces of each file around the given spots, for the model to edit. */
function piecesFor(arts: ArtifactSegment[], pick: (a: ArtifactSegment, i: number) => Range[], budget: number): string {
  const per = Math.max(1500, Math.floor(budget / Math.max(1, arts.length)));
  return arts.map((a, i) => {
    const ranges = pick(a, i);
    return ranges.length ? fileTag(a, excerpts(a.content, ranges, per)) : "";
  }).filter(Boolean).join("\n\n");
}

function editPrompt(what: string, pieces: string): string {
  return `Improvement to make: ${what}\n\nThe relevant part(s) of the file(s):\n${pieces}\n\nMake it with edit blocks. The old lines must be copied exactly from the parts above; touch nothing else.`;
}

function fixPrompt(arts: ArtifactSegment[], reports: CheckReport[], pieces?: string): string {
  const errs = arts.map((a, i) => (reports[i].errors.length ? `${a.title}:\n${reports[i].errors.map((e) => `- ${e}`).join("\n")}` : "")).filter(Boolean).join("\n\n");
  return `Running the file after your change gave errors:\n${errs}\n\n${pieces ? `The part(s) of the file(s) concerned:\n${pieces}` : `Current file(s):\n${code(arts)}`}\n\nFix them with edit blocks, changing as little as possible. Do not undo the improvement.`;
}

/** What a change did to each file, as a diff to show in the card. */
function changesBetween(before: ArtifactSegment[], after: ArtifactSegment[]): string {
  return after.map((a, i) => {
    const d = before[i] ? diffText(before[i].content, a.content) : "";
    return d ? (after.length > 1 ? `${a.title}\n${d}` : d) : "";
  }).filter(Boolean).join("\n\n");
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
  const note = (kind: ReviewStep["kind"], t: string, diff?: string) => steps.push(diff ? { kind, text: t, diff } : { kind, text: t });
  const started = now();
  let stop = "";

  try {
    for (round = 1; round <= o.rounds; round++) {
      if (o.signal?.aborted) throw new Error("aborted");
      if (now() >= o.endsAt) { stop = "The time is up."; round--; break; }
      const arts = artifactsIn(text);
      const focused = arts.reduce((n, a) => n + a.content.length, 0) >= (o.focusFrom ?? FOCUS_FROM);
      if (!focused && arts.reduce((n, a) => n + a.content.length, 0) > o.maxChars) { stop = "The file has grown too long for this model's context, so it stops here."; round--; break; }
      if (focused && arts.reduce((n, a) => n + outlineText(a.title, a.content).length, 0) > o.maxChars) { stop = "Even the map of the file is too long for this model's context, so it stops here."; round--; break; }
      note("info", `Round ${round}: choosing an improvement…`);
      yield loop("running");

      let reply: string;
      let what: string;
      if (focused) {
        // two small questions instead of one big one: where to work, then the edit on just those lines
        const plan = await o.askWriter([
          { role: "system", content: PLANNER_INSTRUCTIONS },
          { role: "user", content: mapPrompt({ request: o.request, direction: o.direction, done, arts, round, rounds: o.rounds }) }
        ]);
        if (o.signal?.aborted) throw new Error("aborted");
        what = /^\s*improvement:\s*(.+)$/im.exec(plan)?.[1]?.trim().slice(0, 160) ?? "an improvement";
        const wanted = (/^\s*where:\s*(.+)$/im.exec(plan)?.[1] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        const budget = Math.max(2000, Math.floor(o.maxChars / 2));
        let pieces = piecesFor(arts, (a, i) => resolveSpots(a.content, wanted.filter((w) => !/^[^:]+:/.test(w) || w.toLowerCase().startsWith(`${a.title.toLowerCase()}:`) || arts.length === 1), outline(a.content)).slice(0, 6), budget);
        if (!pieces) pieces = piecesFor(arts, (a) => resolveSpots(a.content, what.split(/\W+/).filter((w) => w.length > 3)).slice(0, 4), budget);
        if (!pieces) { // nothing matched: start from the top of the first file rather than asking for nothing
          pieces = fileTag(arts[0], excerpts(arts[0].content, [[1, 80]], budget, 0));
        }
        steps.pop();
        note("info", `Round ${round}: ${what}…`);
        yield loop("running");
        reply = await o.askWriter([
          { role: "system", content: IMPROVER_INSTRUCTIONS },
          { role: "user", content: editPrompt(what, pieces) }
        ]);
        steps.pop();
      } else {
        reply = await o.askWriter([
          { role: "system", content: IMPROVER_INSTRUCTIONS },
          { role: "user", content: roundPrompt({ request: o.request, direction: o.direction, done, arts, round, rounds: o.rounds }) }
        ]);
        steps.pop();
        what = /^\s*improvement:\s*(.+)$/im.exec(reply)?.[1]?.trim().slice(0, 160) ?? "an improvement";
      }
      if (o.signal?.aborted) throw new Error("aborted");
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
        const pieces = focused ? piecesFor(now2, (a, i) => {
          const span = changeSpan(arts[i]?.content ?? "", a.content);
          const around = errorLines(reports[i].errors).map((l): Range => [Math.max(1, l - 8), l + 12]);
          return [...(span ? [[span.start, Math.max(span.start, span.endAfter)] as Range] : []), ...around].slice(0, 8);
        }, Math.max(2000, Math.floor(o.maxChars / 2))) : undefined;
        const fix = await o.askWriter([
          { role: "system", content: IMPROVER_INSTRUCTIONS },
          { role: "user", content: fixPrompt(now2, reports, pieces) }
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
      note("ok", `Round ${round}: ${what}`, changesBetween(arts, artifactsIn(text)));
      yield { id: o.id, type: "replace", text };
      yield loop("running");
    }
  } catch (e) {
    if (o.signal?.aborted) {
      // stopped by the user: close the card (no spinner left behind) before the stop goes up
      while (steps.length && steps[steps.length - 1].kind === "info" && /…$/.test(steps[steps.length - 1].text)) steps.pop();
      note("info", `Stopped. ${plural(done.length, "improvement")} kept.`);
      yield loop("done");
      throw e;
    }
    stop = `It stopped: ${(e as Error).message}`;
  }
  const minutes = Math.max(1, Math.round((now() - started) / 60000));
  note(done.length ? "ok" : "error", `${stop ? `${stop} ` : ""}${plural(done.length, "improvement")} kept in ${minutes} min${o.endsAt ? ` (budget until ${clock(o.endsAt)})` : ""}.`);
  yield loop("done");
}
