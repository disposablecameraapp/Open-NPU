import type { AgentRun, Attachment, ChatStats, FriendlyError, ReviewRun } from "../shared/types";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  stats?: ChatStats;
  error?: FriendlyError;
  pending?: boolean;
  modelName?: string;
  attachments?: Attachment[];
  agents?: AgentRun[];
  review?: ReviewRun;
}

export interface Conversation {
  id: string;
  title: string;
  updated: number;
  /** Chats inside a project get its instructions and knowledge. */
  projectId?: string | null;
  turns: Turn[];
}

const KEY = "opennpu.conversations";

export function loadConversations(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveConversations(c: Conversation[]) {
  try {
    const clean = c.map((x) => ({ ...x, turns: x.turns.map((t) => ({ ...t, pending: false, attachments: t.attachments?.map(({ dataUrl, ...a }) => a), agents: t.agents?.map((a) => ({ ...a, status: a.status === "running" ? "error" as const : a.status })), review: t.review ? { ...t.review, status: "done" as const } : undefined })) })).slice(0, 100);
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
