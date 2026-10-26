/** The kinds of drawn block that take a moment to write or to mend, and the short sentences that take turns while they do. */
export type FigureKind = "chart" | "diagram" | "figures" | "cards" | "quiz" | "checklist" | "sheet";

const DRAW: Record<FigureKind, string[]> = {
  chart: ["Placing the axes", "Plotting the values", "Adding the inputs and the formulas"],
  diagram: ["Placing the boxes", "Linking them one to another"],
  figures: ["Setting the key numbers"],
  cards: ["Writing each card"],
  quiz: ["Writing the questions", "Writing the answers"],
  checklist: ["Listing the items"],
  sheet: ["Filling the cells", "Writing the formulas"]
};
const FIX: Record<FigureKind, string[]> = {
  chart: ["Reading what stopped the chart", "Mending the data so it can be drawn", "Trying the chart again"],
  diagram: ["Finding the line that breaks the diagram", "Repairing it", "Drawing it again"],
  figures: ["Mending the figures"], cards: ["Mending the cards"], quiz: ["Mending the quiz"], checklist: ["Mending the list"], sheet: ["Mending the sheet", "Checking the formulas"]
};

export function phrasesForFigure(kind: FigureKind, stage: "draw" | "fix"): string[] {
  return (stage === "fix" ? FIX : DRAW)[kind];
}
