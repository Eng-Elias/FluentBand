import { z } from "zod";

export const vocabItemSchema = z.object({
  chunk: z.string().describe("collocation or chunk, e.g. 'take into account'"),
  meaning: z.string(),
  example: z.string(),
  register: z.enum(["formal", "neutral", "informal"]),
  commonMistake: z.string().optional(),
});

export const vocabPackSchema = z.object({
  topic: z.string(),
  level: z.string(),
  items: z.array(vocabItemSchema).min(6).max(14),
});
export type VocabItem = z.infer<typeof vocabItemSchema>;
export type VocabPack = z.infer<typeof vocabPackSchema>;

export const diagnosticResultSchema = z.object({
  estimatedBand: z.object({
    listening: z.number().min(0).max(9),
    reading: z.number().min(0).max(9),
    writing: z.number().min(0).max(9),
    speaking: z.number().min(0).max(9),
  }),
  vocabLevel: z.string(),
  weakAreas: z.array(z.string()),
  notes: z.string(),
});
export type DiagnosticResult = z.infer<typeof diagnosticResultSchema>;
