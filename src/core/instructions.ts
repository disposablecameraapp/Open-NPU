/** The personal instructions come in three parts of growing size; a model gets as many as its context window can carry. */
export const INSTRUCTION_LIMITS = [500, 1000, 2000] as const;
/** The context (in tokens) from which a model is given the second and the third part. */
export const INSTRUCTION_CONTEXT = [0, 8192, 16384] as const;

export interface InstructionParts { customInstructions?: string; customInstructions2?: string; customInstructions3?: string }

/** How many of the three parts a model with this context window is given (1 to 3). */
export function instructionTiers(contextTokens: number): 1 | 2 | 3 {
  return contextTokens >= INSTRUCTION_CONTEXT[2] ? 3 : contextTokens >= INSTRUCTION_CONTEXT[1] ? 2 : 1;
}

/** The parts the model is given, each cut to its limit, in one text. */
export function composeInstructions(p: InstructionParts, contextTokens: number): string {
  const all = [p.customInstructions, p.customInstructions2, p.customInstructions3];
  return all.slice(0, instructionTiers(contextTokens)).map((t, i) => (t ?? "").trim().slice(0, INSTRUCTION_LIMITS[i])).filter(Boolean).join("\n");
}

/** A part is full enough to unfold the next one. */
export const FILL_TO_UNFOLD = 0.8;
