/**
 * A program with many parts is planned part by part. The three planning questions (what is shown, what happens, what is calculated)
 * are asked of a small group of parts at a time, each seeing the units already planned, so no question has more to cover than a small
 * model can hold and no limit on the size of the program is needed.
 */

/** Parts planned together. */
export const PARTS_PER_BATCH = 4;

/** Up to this many parts the three questions are asked once, as before: a first real build with six parts planned every unit three times over and lost minutes to the repeats. */
export const SPLIT_FROM = 8;

/** The parts text split in groups: each group is the core line (shared by all) and some feature lines. One group when the program is small. */
export function featureBatches(structure: string, per = PARTS_PER_BATCH): string[] {
  const lines = structure.split("\n").map((l) => l.trim()).filter(Boolean);
  const core = lines.filter((l) => /^core\b/i.test(l));
  const features = lines.filter((l) => /^feature\b/i.test(l));
  // a program of a few parts is one group, as before; a group of one more than `per` is not worth splitting
  if (features.length <= SPLIT_FROM) return [];
  const out: string[] = [];
  for (let i = 0; i < features.length; i += per) out.push([...core, ...features.slice(i, i + per)].join("\n"));
  return out;
}
