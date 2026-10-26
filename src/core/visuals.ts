/**
 * What of an answer is to be looked at rather than listened to: its finished charts and its Wikimedia pictures. The voice chat shows them
 * on its screen while the voice says what they show; a chart still being written is left out until its block is closed.
 */
export function visualsOf(answer: string): string {
  const out: string[] = [];
  for (const m of answer.matchAll(/```chart[^\n]*\n[\s\S]*?\n```|^[ \t]*!\[[^\]\n]*\]\(wikimedia:[^)\n]+\)[ \t]*$/gm)) out.push(m[0].trim());
  return out.join("\n\n");
}
