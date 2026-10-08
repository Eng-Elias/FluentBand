import type { ChatMessage } from "@/shared/llm";
import { learnerSummary, sys, user, WRITER_PERSONA, type LearnerCtx } from "./common";

export function buildListeningPrompt(
  topic: string,
  section: number,
  ctx: LearnerCtx,
): ChatMessage[] {
  const context: Record<number, string> = {
    1: "a social/everyday conversation between 2 speakers (e.g. booking, enquiry)",
    2: "a monologue on an everyday topic (e.g. a talk about local facilities)",
    3: "an academic conversation between 2-3 speakers (e.g. student + tutor)",
    4: "an academic monologue/lecture",
  };
  return [
    sys(WRITER_PERSONA),
    user(
      `${learnerSummary(ctx)}\n\n` +
        `Write an IELTS Listening Section ${section} script on "${topic}": ${context[section]}.\n` +
        `Requirements:\n` +
        `- Natural spoken style with realistic hesitations ("well,", "you know,", "let me see")\n` +
        `- ${ctx.cheaperMode ? "8-14" : "14-22"} speaker turns; each turn 1-3 sentences\n` +
        `- Use speaker labels listed in "speakers"\n` +
        `- ${ctx.cheaperMode ? "6-8" : "8-10"} questions of types: form_completion (gap fill with a ____ gap), mcq, matching\n` +
        `- Answers must be clearly stated (or paraphrased) in the script\n` +
        `- For form_completion answers use 1-3 words, easily heard`,
    ),
  ];
}
