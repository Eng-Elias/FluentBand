import type { ChatMessage } from "@/shared/llm";

export interface LearnerCtx {
  level?: number; // current band estimate
  targetBand?: number;
  weakAreas?: string[];
  topicsSeen?: string[];
  cheaperMode?: boolean;
}

export function learnerSummary(ctx: LearnerCtx): string {
  const lines = [
    `Learner current band estimate: ${ctx.level ?? 5.5}`,
    `Target band: ${ctx.targetBand ?? 7}`,
  ];
  if (ctx.weakAreas?.length) {
    lines.push(`Known weak areas: ${ctx.weakAreas.join(", ")}`);
  }
  return lines.join("\n");
}

export function sys(persona: string): ChatMessage {
  return { role: "system", content: persona };
}

export function user(content: string): ChatMessage {
  return { role: "user", content };
}

export const GRADER_PERSONA =
  "You are a strict, experienced IELTS examiner. Quote the learner's exact " +
  "words when giving feedback. Do not be generous. Always give a band range, " +
  "and list your uncertainty honestly.";

export const WRITER_PERSONA =
  "You are an expert IELTS materials writer creating original practice " +
  "content indistinguishable in style and difficulty from real IELTS tests.";

export const PROMPT_VERSION = "v1";
