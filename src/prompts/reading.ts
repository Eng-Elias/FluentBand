import type { ChatMessage } from "@/shared/llm";
import { learnerSummary, sys, user, WRITER_PERSONA, type LearnerCtx } from "./common";

export function buildReadingPrompt(
  topic: string,
  ctx: LearnerCtx,
): ChatMessage[] {
  const wordTarget = ctx.cheaperMode ? "600-750" : "700-900";
  const qCount = ctx.cheaperMode ? "8-10" : "10-13";
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Write an IELTS Academic Reading passage on the topic "${topic}", pitched ` +
        `at band ${(ctx.level ?? 5.5) + 0.5} (slightly above the learner's level). ` +
        `Requirements:\n` +
        `- Passage: ${wordTarget} words, academic style, ${ctx.cheaperMode ? 4 : 5} paragraphs\n` +
        `- ${qCount} questions mixing types: tfng (TRUE/FALSE/NOT_GIVEN), mcq, completion, matching, summary\n` +
        `- Every question MUST include "evidence": an exact verbatim quote from the passage that proves the answer\n` +
        `- Include 3-6 useful collocations in "targetChunks" that appear verbatim in the passage\n` +
        `- Report the true wordCount`,
    ),
  ];
}
