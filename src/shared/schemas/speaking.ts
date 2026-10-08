import { z } from "zod";
import { bandRangeSchema, bandScoreSchema, correctionSchema } from "./common";

export const speakingPart1Schema = z.object({
  theme: z.string(),
  questions: z.array(z.string()).min(4).max(6),
});
export type SpeakingPart1 = z.infer<typeof speakingPart1Schema>;

export const cueCardSchema = z.object({
  topic: z.string(),
  description: z.string(),
  bulletPoints: z.array(z.string()).min(3).max(4),
  followUpQuestion: z.string().optional(),
});
export type CueCard = z.infer<typeof cueCardSchema>;

export const speakingFollowUpSchema = z.object({
  questions: z.array(z.string()).min(2).max(5),
});
export type SpeakingFollowUp = z.infer<typeof speakingFollowUpSchema>;

export const speakingFeedbackSchema = z.object({
  fluencyCoherence: bandScoreSchema,
  lexicalResource: bandScoreSchema,
  grammaticalRange: bandScoreSchema,
  pronunciation: bandScoreSchema.describe(
    "proxy estimate from transcript only — low confidence",
  ),
  overall: bandScoreSchema,
  overallRange: bandRangeSchema,
  summary: z.string(),
  corrections: z.array(correctionSchema).default([]),
  betterPhrases: z
    .array(z.object({ instead_of: z.string(), say: z.string() }))
    .default([]),
  topPriorities: z.array(z.string()).min(1).max(5),
});
export type SpeakingFeedback = z.infer<typeof speakingFeedbackSchema>;
