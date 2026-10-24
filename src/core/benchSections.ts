import type { TaskCategory } from "./dynamic";

/**
 * What the benchmark covers: every kind of thing somebody asks an AI, split into sections so the results can be read section
 * by section. A section is a family of tests; it points at the Dynamic kind of work it informs, so the best model of a section is
 * a candidate for that line of a pack's table.
 */
export const BENCH_SECTIONS = [
  // writing and language
  { id: "writing_fr", group: "Writing", label: "Writing in French", dynamic: "writing" },
  { id: "writing_en", group: "Writing", label: "Writing in English", dynamic: "writing" },
  { id: "rewrite", group: "Writing", label: "Summaries and rewriting", dynamic: "summarize" },
  { id: "creative", group: "Writing", label: "Creative writing", dynamic: "creative" },
  { id: "translate_fr", group: "Languages", label: "Translation with French", dynamic: "translate_fr" },
  { id: "translate_other", group: "Languages", label: "Other languages", dynamic: "translate_other" },
  // thinking
  { id: "math", group: "Thinking", label: "Maths", dynamic: "math" },
  { id: "reasoning", group: "Thinking", label: "Logic and reasoning", dynamic: "reasoning" },
  { id: "planning", group: "Thinking", label: "Planning", dynamic: "planning" },
  { id: "knowledge", group: "Knowledge", label: "Facts", dynamic: "knowledge" },
  { id: "honesty", group: "Knowledge", label: "Does not invent", dynamic: "knowledge" },
  { id: "long_context", group: "Knowledge", label: "Long documents", dynamic: "long_context" },
  // following orders and data
  { id: "instruction", group: "Orders", label: "Strict instructions", dynamic: "instruction" },
  { id: "structured", group: "Orders", label: "Structured output (JSON, CSV)", dynamic: "tool_use" },
  { id: "data", group: "Orders", label: "Reading tables and data", dynamic: "tool_use" },
  { id: "tools", group: "Orders", label: "Calling tools", dynamic: "tool_use" },
  { id: "web_search", group: "Orders", label: "Web search", dynamic: "tool_use" },
  // assistant
  { id: "chat", group: "Assistant", label: "Conversation and advice", dynamic: "chat" },
  { id: "fast", group: "Assistant", label: "Quick replies", dynamic: "fast" },
  { id: "safety", group: "Assistant", label: "Safety and over-refusal", dynamic: "chat" },
  // code
  { id: "code_python", group: "Code", label: "Python (run)", dynamic: "python_code" },
  { id: "code_js", group: "Code", label: "JavaScript (run)", dynamic: "python_code" },
  { id: "code_html", group: "Code", label: "HTML", dynamic: "web_code" },
  { id: "code_css", group: "Code", label: "CSS", dynamic: "web_code" },
  { id: "code_web", group: "Code", label: "Whole web pages and games", dynamic: "web_code" },
  { id: "code_sql", group: "Code", label: "SQL", dynamic: "python_code" },
  { id: "code_shell", group: "Code", label: "Shell and regular expressions", dynamic: "python_code" },
  { id: "code_repair", group: "Code", label: "Fixing code", dynamic: "code_repair" },
  { id: "code_explain", group: "Code", label: "Explaining and reviewing code", dynamic: "code_explain" }
] as const satisfies readonly { id: string; group: string; label: string; dynamic: TaskCategory }[];

export type BenchSection = (typeof BENCH_SECTIONS)[number]["id"];
export const SECTION_INFO = Object.fromEntries(BENCH_SECTIONS.map((s) => [s.id, s])) as Record<BenchSection, (typeof BENCH_SECTIONS)[number]>;

