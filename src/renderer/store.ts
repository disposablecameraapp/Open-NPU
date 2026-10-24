import type { ChatStats, FriendlyError } from "../shared/types";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  stats?: ChatStats;
  error?: FriendlyError;
  pending?: boolean;
  modelName?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated: number;
  turns: Turn[];
}

const KEY = "opennpu.conversations";

export function loadConversations(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveConversations(c: Conversation[]) {
  try {
    const clean = c.map((x) => ({ ...x, turns: x.turns.map((t) => ({ ...t, pending: false })) })).slice(0, 100);
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch { /* storage full or blocked: keep working in memory */ }
}

export function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New chat", updated: Date.now(), turns: [] };
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t || "New chat";
}
