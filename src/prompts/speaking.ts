import type { ChatMessage } from "@/shared/llm";
import {
  GRADER_PERSONA,
  learnerSummary,
  sys,
  user,
  WRITER_PERSONA,
  type LearnerCtx,
} from "./common";

export function buildPart1Prompt(theme: string, ctx: LearnerCtx): ChatMessage[] {
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Create an IELTS Speaking Part 1 question set on the theme "${theme}". ` +
        `4-5 short personal questions like a real examiner would ask.`,
    ),
  ];
}

export function buildCueCardPrompt(topic: string, ctx: LearnerCtx): ChatMessage[] {
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Create an IELTS Speaking Part 2 cue card on "${topic}". ` +
        `Format: "Describe ... You should say: ..." with 3-4 bullet points, ` +
        `plus one rounding-off follow-up question.`,
    ),
  ];
}

export function buildPart3Prompt(
  cueCardTopic: string,
  learnerAnswers: string,
  ctx: LearnerCtx,
): ChatMessage[] {
  return [
    sys(
      "You are an IELTS Speaking examiner running Part 3. Ask deeper, abstract " +
        "discussion questions connected to the Part 2 topic and the candidate's " +
        "own answers.",
    ),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Part 2 topic was: ${cueCardTopic}\n` +
        `Candidate said: "${learnerAnswers.slice(0, 2000)}"\n\n` +
        `Ask 3-5 Part 3 follow-up questions that deepen the discussion.`,
    ),
  ];
}

export function buildSpeakingGradePrompt(
  transcript: string,
  metrics: Record<string, number>,
  ctx: LearnerCtx,
): ChatMessage[] {
  return [
    sys(GRADER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Grade this IELTS speaking transcript against Fluency & Coherence, Lexical ` +
        `Resource, Grammatical Range & Accuracy, and Pronunciation.\n` +
        `IMPORTANT: you only have a transcript — pronunciation is a LOW-CONFIDENCE ` +
        `proxy estimate. Computed metrics: ${JSON.stringify(metrics)}\n\n` +
        `TRANSCRIPT:\n${transcript}\n\n` +
        `Give sub-scores, overall, honest band range, corrections quoting exact ` +
        `words (category taxonomy), better phrases to say instead, and top priorities.`,
    ),
  ];
}
