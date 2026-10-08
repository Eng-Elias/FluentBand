import type { ChatMessage } from "@/shared/llm";
import { learnerSummary, sys, user, WRITER_PERSONA, type LearnerCtx } from "./common";

export function buildVocabPackPrompt(topic: string, ctx: LearnerCtx): ChatMessage[] {
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Create a vocabulary pack of ${ctx.cheaperMode ? "6-8" : "8-12"} useful ` +
        `collocations/lexical chunks for the IELTS topic "${topic}" at band ` +
        `${(ctx.level ?? 5.5) + 0.5}. Focus on CHUNKS (e.g. "take into account", ` +
        `"play a vital role in"), not single words. For each: chunk, meaning, an example ` +
        `sentence using it in an IELTS-style context, register note, and a common ` +
        `mistake learners make with it.`,
    ),
  ];
}

export function buildDiagnosticPrompt(): ChatMessage[] {
  return [
    sys(
      "You are an IELTS placement examiner. Estimate the learner's level from " +
        "their performance across the mini-test.",
    ),
    user(
      "Estimate the learner's starting band per skill and identify weak areas " +
        "from these results.",
    ),
  ];
}
