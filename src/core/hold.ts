/**
 * A message that only hands over material ("here is the context, wait for my instructions") asks for nothing yet. The words inside the
 * material (a pasted essay full of dates, "code", "interface"...) must not start a web search, a plan or a build: the answer is a short
 * acknowledgement. Only the end of the message is read, because that is where the person says what to do with what was pasted.
 */
const HOLD = new RegExp(
  [
    "attends?\\s+(?:mes|la|ma|d'abord|que|les|pour)\\b",
    "attendez\\s+(?:mes|la|ma)\\b",
    "(?:ne\\s+fais|ne\\s+fait)\\s+(?:rien|pas)\\s+(?:encore|pour\\s+l'instant|tout\\s+de\\s+suite)",
    "pas\\s+encore\\s+(?:de\\s+)?(?:question|instruction|consigne)",
    "(?:comme|en\\s+guise\\s+de|pour)\\s+(?:simple\\s+)?contexte",
    "les?\\s+(?:instructions?|consignes?)\\s+(?:arrivent|suivent|viennent|vont\\s+venir)",
    "wait\\s+(?:for|until)\\s+(?:my|the)\\s+(?:instructions?|next|request|question)",
    "(?:as|for)\\s+(?:background\\s+)?context(?:\\s+only)?",
    "(?:don'?t|do\\s+not)\\s+(?:do|answer)\\s+(?:anything|yet)",
    "instructions?\\s+(?:to\\s+follow|(?:are\\s+)?coming|next)"
  ].join("|"),
  "i"
);

/** The last stretch of the message is the only part read. */
const TAIL_CHARS = 220;

export function awaitsInstructions(text: string): boolean {
  const tail = text.trim().slice(-TAIL_CHARS);
  // a long request that merely ends with a question mark is not a hold; a hold is a short closing remark
  const last = tail.split(/\n+/).filter((l) => l.trim()).pop() ?? "";
  return last.length <= 160 && HOLD.test(last);
}

/** What the model is told when the message holds: say nothing more than that the material is received. */
export const HOLD_NOTE = "[The person gave the text above as context and will send the instructions next. Reply in the language of their message with one short sentence saying you read it and are waiting. Do not summarize it, do not search, do not write files.]";
