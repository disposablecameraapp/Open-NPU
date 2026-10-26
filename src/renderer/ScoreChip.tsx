import { SCORES_NOTE, scoreLevel, type Score } from "../core/scores";

/** How good a model did in the app's own tests, at a glance; nothing for a model that was not tested. */
export function ScoreChip({ score }: { score: Score | null }) {
  if (!score) return null;
  return (
    <span className={`badge score ${scoreLevel(score.quality)}`} title={`${SCORES_NOTE}${score.tokPerSec ? ` Speed: ${score.tokPerSec} tokens/s.` : ""}`}>
      {score.quality}/100
    </span>
  );
}
