import { z } from "zod";

export const bandScoreSchema = z
  .number()
  .min(0)
  .max(9)
  .refine((v) => Math.round(v * 2) === v * 2, {
    message: "band must be in 0.5 steps",
  });

export const bandRangeSchema = z.object({
  low: bandScoreSchema,
  high: bandScoreSchema,
});

export const correctionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
  category: z.enum([
    "grammar.tense",
    "grammar.articles",
    "grammar.agreement",
    "grammar.prepositions",
    "grammar.word_order",
    "grammar.complex_sentences",
    "lexical.collocation",
    "lexical.word_choice",
    "lexical.repetition",
    "lexical.register",
    "coherence.cohesive_devices",
    "coherence.paragraphing",
    "coherence.task_response",
    "speaking.fillers",
    "speaking.long_pauses",
    "speaking.self_corrections",
    "speaking.short_answers",
  ]),
});

export type Correction = z.infer<typeof correctionSchema>;
export type BandRange = z.infer<typeof bandRangeSchema>;
