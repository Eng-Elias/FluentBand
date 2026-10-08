import type { ErrorItem, Skill } from "../db/types";

/**
 * Rank error categories by recency-weighted frequency → weak areas.
 * Returns top N category keys like "grammar.articles".
 */
export function weakAreasFromErrors(errors: ErrorItem[], topN = 5): string[] {
  const now = Date.now();
  const HALF_LIFE_MS = 14 * 24 * 3600 * 1000; // 14 days
  const score = new Map<string, number>();
  for (const e of errors) {
    if (e.deletedAt) continue;
    const age = Math.max(0, now - e.createdAt);
    const w = Math.pow(0.5, age / HALF_LIFE_MS);
    score.set(e.category, (score.get(e.category) ?? 0) + w);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k]) => k);
}

/** Weakest skill by comparing skillLevels to target. */
export function weakestSkill(
  levels: Record<Skill, number>,
  target: number,
): Skill {
  let worst: Skill = "speaking";
  let worstGap = -Infinity;
  for (const s of ["listening", "reading", "writing", "speaking"] as Skill[]) {
    const gap = target - levels[s];
    if (gap > worstGap) {
      worstGap = gap;
      worst = s;
    }
  }
  return worst;
}
