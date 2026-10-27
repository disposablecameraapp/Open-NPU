import type { SlidePick } from "../core/slidePicks";
import type { Memo } from "../core/memo";
import type { AgentRun, Attachment, ChatStats, FriendlyError, BuildRun, LoopRun, ReviewRun } from "../shared/types";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  stats?: ChatStats;
  error?: FriendlyError;
  pending?: boolean;
  /** The person pressed Stop: the text so far is kept. */
  stopped?: boolean;
  modelName?: string;
  /** Spoken in a voice chat and cut by the person: the text is only what had been said aloud. */
  interrupted?: boolean;
  /** With `interrupted`: how many words of the answer, as the voice reads it, were said aloud. The whole answer is kept. */
  heardWords?: number;
  attachments?: Attachment[];
  /** Slides of a presentation the person pointed at in the preview, in the order chosen. */
  picks?: SlidePick[];
  agents?: AgentRun[];
  review?: ReviewRun;
  loop?: LoopRun;
  build?: BuildRun;
  /** Things done to the request or answer that the person should know (older messages left out, a cut answer continued). */
  notices?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  updated: number;
  /** Chats inside a project get its instructions and knowledge. */
  projectId?: string | null;
  /** Kept at the top of the sidebar. */
  pinned?: boolean;
  /** Out of the sidebar lists until restored; the chat itself is kept. */
  archived?: boolean;
  /** True once a proper title was made for it (or the person renamed it). */
  named?: boolean;
  /** What the oldest turns said, kept when they no longer fit the model's window (see core/compaction). */
  memo?: Memo;
  turns: Turn[];
}

const KEY = "opennpu.conversations";

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

/** Saved chats are read back as found: anything malformed is repaired or dropped so one bad value can never stop the app from drawing. */
function cleanTurn(t: Record<string, any>): Turn {
  const turn: Turn = { ...t, role: t.role === "user" ? "user" : "assistant", content: typeof t.content === "string" ? t.content : "", pending: false } as Turn;
  if (t.thinking !== undefined && typeof t.thinking !== "string") delete turn.thinking;
  if (t.attachments !== undefined) turn.attachments = list(t.attachments) as any;
  if (t.agents !== undefined) turn.agents = list(t.agents) as any;
  if (t.notices !== undefined) turn.notices = Array.isArray(t.notices) ? t.notices.filter((n: unknown) => typeof n === "string") : undefined;
  if (t.build !== undefined) turn.build = isObj(t.build) && Array.isArray(t.build.steps) ? { status: "done", steps: list(t.build.steps) as any, spec: typeof t.build.spec === "string" ? t.build.spec : undefined, start: Array.isArray(t.build.start) ? list(t.build.start) as any : undefined, verify: Array.isArray(t.build.verify) ? list(t.build.verify) as any : undefined } : undefined;
  for (const k of ["review", "loop"] as const) {
    if (t[k] !== undefined && !(isObj(t[k]) && Array.isArray(t[k].steps))) delete turn[k];
  }
  return turn;
}

export function loadConversations(): Conversation[] {
  try {
    return list(JSON.parse(localStorage.getItem(KEY) ?? "[]"))
      .filter((c) => typeof c.id === "string")
      .map((c) => ({ ...c, memo: isObj(c.memo) && typeof c.memo.text === "string" && typeof c.memo.turns === "number" && typeof c.memo.hash === "string" ? c.memo : undefined, title: typeof c.title === "string" ? c.title : "Chat", updated: typeof c.updated === "number" ? c.updated : 0, turns: list(c.turns).map(cleanTurn) }) as Conversation);
  } catch { return []; }
}

export function resetConversations() {
  try { localStorage.removeItem(KEY); } catch { /* blocked */ }
}

export function saveConversations(c: Conversation[]) {
  try {
    const clean = c.map((x) => ({ ...x, turns: x.turns.map((t) => ({ ...t, pending: false, attachments: t.attachments?.map(({ dataUrl, ...a }) => a), agents: t.agents?.map((a) => ({ ...a, status: a.status === "running" ? "error" as const : a.status })), review: t.review ? { ...t.review, status: "done" as const, shots: undefined } : undefined, loop: t.loop ? { ...t.loop, status: "done" as const } : undefined, build: t.build ? { status: "done" as const, spec: t.build.spec, start: t.build.start?.map(({ shot, ...v }) => ({ ...v, status: v.status === "running" ? "error" as const : v.status })), verify: t.build.verify?.map(({ shot, ...v }) => ({ ...v, status: v.status === "running" ? "error" as const : v.status })), steps: t.build.steps.map((s) => ({ ...s, status: s.status === "running" || s.status === "waiting" ? "error" as const : s.status, stages: s.stages?.map(({ shot, ...v }) => ({ ...v, status: v.status === "running" ? "error" as const : v.status })) })) } : undefined })) })).slice(0, 100);
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch { /* storage full or blocked: keep working in memory */ }
}

export function newConversation(projectId: string | null = null): Conversation {
  return { id: crypto.randomUUID(), title: "New chat", updated: Date.now(), projectId, turns: [] };
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t || "New chat";
}
