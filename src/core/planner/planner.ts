import { newId } from "../db/db";
import type { SessionBlock } from "../db/types";
import { pickTopic } from "./topics";
import { weakestSkill } from "./weak";

export interface PlannerInput {
  dueCardCount: number;
  weakAreas: string[];
  skillLevels: { listening: number; reading: number; writing: number; speaking: number };
  targetBand: number;
  topicsSeen: { topic: string; count: number; lastSeen: number }[];
  dayIndex: number; // days since first session — alternates skills
  cheaperMode?: boolean;
}

/**
 * Build the ~40-min Daily Session plan.
 * Structure (learning-science):
 *   1. SRS reviews (warm-up, retrieval practice)
 *   2. Input: Reading or Listening (alternates), i+1 level
 *   3. Fluency: 4/3/2 drill or shadowing (alternates)
 *   4. Output: Writing or Speaking Part 2+3 (alternates)
 *   5. Feedback/harvest: error review
 * Topic continuity: the same IELTS theme runs through all blocks.
 */
export function buildDailyPlan(input: PlannerInput): {
  blocks: SessionBlock[];
  topic: string;
} {
  const topic = pickTopic(input.topicsSeen);
  const weak = weakestSkill(input.skillLevels, input.targetBand);
  const blocks: SessionBlock[] = [];
  const alt = input.dayIndex % 2;

  // 1. SRS reviews
  if (input.dueCardCount > 0) {
    blocks.push({
      id: newId(),
      kind: "srs_review",
      label: `Review ${Math.min(input.dueCardCount, 30)} due cards`,
      minutes: Math.min(10, Math.max(5, Math.ceil(input.dueCardCount / 5))),
      route: "/vocab",
      topic,
    });
  }

  // 2. Input block — favor weaker receptive skill
  const inputKind =
    weak === "listening" || (weak !== "reading" && alt === 1)
      ? "listening"
      : "reading";
  blocks.push({
    id: newId(),
    kind: inputKind,
    label: inputKind === "reading" ? "Reading passage + questions" : "Listening section + questions",
    minutes: input.cheaperMode ? 8 : 10,
    route: `/${inputKind}`,
    topic,
    payload: { topic },
  });

  // 3. Fluency block
  const fluencyKind = alt === 0 ? "speaking_432" : "speaking_shadowing";
  blocks.push({
    id: newId(),
    kind: fluencyKind,
    label: alt === 0 ? "4/3/2 fluency drill" : "Shadowing drill",
    minutes: 8,
    route: `/speaking?mode=${fluencyKind === "speaking_432" ? "drill" : "shadowing"}`,
    topic,
    payload: { topic },
  });

  // 4. Output block — favor weaker productive skill
  const outKind =
    weak === "writing" || (weak !== "speaking" && alt === 1)
      ? "writing_t2"
      : "speaking_part";
  blocks.push({
    id: newId(),
    kind: outKind,
    label: outKind === "writing_t2" ? "Writing Task 2 essay" : "Speaking Part 2 + 3",
    minutes: input.cheaperMode ? 10 : 12,
    route: outKind === "writing_t2" ? "/writing?task=2" : "/speaking?mode=part23",
    topic,
    payload: { topic },
  });

  // 5. Feedback & harvest
  blocks.push({
    id: newId(),
    kind: "error_review",
    label: "Review today's corrections",
    minutes: 5,
    route: "/errors",
    topic,
  });

  return { blocks, topic };
}
