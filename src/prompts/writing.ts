import type { ChatMessage } from "@/shared/llm";
import {
  GRADER_PERSONA,
  learnerSummary,
  sys,
  user,
  WRITER_PERSONA,
  type LearnerCtx,
} from "./common";

export function buildTask1Prompt(topic: string, ctx: LearnerCtx): ChatMessage[] {
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Create an IELTS Academic Writing Task 1 based on the theme "${topic}". ` +
        `Invent plausible chart data (it does not need to be real statistics). ` +
        `Choose chartType: line, bar, pie, or table. Provide:\n` +
        `- description: the task prompt shown to the learner (must start "The chart/table shows...")\n` +
        `- Realistic series with labels and numbers suitable for a 150-word report\n` +
        `- modelAnswer: a band 8+ sample answer (~170 words)\n` +
        `- keyFeatures: the 3-5 trends/comparisons a good answer must mention`,
    ),
  ];
}

export function buildTask2Prompt(topic: string, ctx: LearnerCtx): ChatMessage[] {
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Write one IELTS Writing Task 2 prompt on "${topic}". ` +
        `Choose essayType: opinion, discuss_both_views, problem_solution, two_part, or advantages_disadvantages. ` +
        `The prompt must be realistic, debatable, and phrased like a real exam question ` +
        `(e.g. "Some people believe... Discuss both views and give your own opinion."). ` +
        `Also list 3-5 modelIdeas a strong essay could develop.`,
    ),
  ];
}

export function buildTask1GradePrompt(
  task: string,
  essay: string,
  ctx: LearnerCtx,
): ChatMessage[] {
  return [
    sys(GRADER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Grade this IELTS Academic Writing Task 1 response against the four official ` +
        `criteria (Task Achievement, Coherence & Cohesion, Lexical Resource, ` +
        `Grammatical Range & Accuracy). Use half-band steps.\n\n` +
        `TASK: ${task}\n\nESSAY:\n${essay}\n\n` +
        `Give sub-scores, overall, and an honest band range. Provide at least 5 ` +
        `concrete corrections quoting the learner's exact words (use the "category" ` +
        `taxonomy: grammar.tense/articles/agreement/prepositions/word_order/` +
        `complex_sentences, lexical.collocation/word_choice/repetition/register, ` +
        `coherence.*), sentence upgrades, and top-3 priorities.`,
    ),
  ];
}

export function buildTask2GradePrompt(
  promptText: string,
  essayType: string,
  essay: string,
  ctx: LearnerCtx,
): ChatMessage[] {
  return [
    sys(GRADER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Grade this IELTS Writing Task 2 response (${essayType}) against the four ` +
        `official criteria (Task Response, Coherence & Cohesion, Lexical Resource, ` +
        `Grammatical Range & Accuracy). Use half-band steps.\n\n` +
        `PROMPT: ${promptText}\n\nESSAY:\n${essay}\n\n` +
        `Give sub-scores, overall, and an honest band range. Provide at least 5 ` +
        `concrete corrections quoting the learner's exact words (use the "category" ` +
        `taxonomy), sentence upgrades, and top-3 priorities.`,
    ),
  ];
}
