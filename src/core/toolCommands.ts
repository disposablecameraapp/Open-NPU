/** Tools on command: with the switch on, a tool runs only when the message starts with its "/" word. */
export type ToolName = "web" | "images" | "agents" | "check" | "improve" | "build";

export const TOOL_COMMANDS: { name: ToolName; word: string; hint: string }[] = [
  { name: "web", word: "web", hint: "Search the web for this message" },
  { name: "images", word: "images", hint: "Allow Wikimedia pictures in this answer" },
  { name: "agents", word: "agents", hint: "Allow sub-agents for this message" },
  { name: "check", word: "check", hint: "Run and check the code written for this message" },
  { name: "improve", word: "improve", hint: "Run the auto-improve loop after this answer" },
  { name: "build", word: "build", hint: "Build files with the planning, writing and testing steps (pages, programs, decks, Word, Excel)" }
];

const WORDS = new Map<string, ToolName>(TOOL_COMMANDS.map((c) => [c.word, c.name]));

/** The commands at the start of a message, and the message without them. Anything else is left as typed. */
export function takeToolCommands(text: string): { used: Set<ToolName>; text: string } {
  const used = new Set<ToolName>();
  let rest = text.trimStart();
  for (;;) {
    const m = /^\/([a-z]+)(?=\s|$)\s*/i.exec(rest);
    const tool = m ? WORDS.get(m[1].toLowerCase()) : undefined;
    if (!m || !tool) break;
    used.add(tool);
    rest = rest.slice(m[0].length);
  }
  return { used, text: used.size ? rest : text };
}
