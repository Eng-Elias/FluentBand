import { z } from "zod";

const mcqQuestion = z.object({
  type: z.literal("mcq"),
  question: z.string(),
  options: z.array(z.string()).min(3).max(5),
  answer: z.string(),
  evidence: z.string().describe("exact quote from the passage"),
});

const tfngQuestion = z.object({
  type: z.literal("tfng"),
  question: z.string(),
  answer: z.enum(["TRUE", "FALSE", "NOT_GIVEN"]),
  evidence: z.string(),
});

const completionQuestion = z.object({
  type: z.literal("completion"),
  question: z.string().describe("sentence with a ____ gap"),
  answer: z.string(),
  evidence: z.string(),
});

const matchingQuestion = z.object({
  type: z.literal("matching"),
  question: z.string().describe("the heading/statement to match"),
  options: z.array(z.string()).min(2),
  answer: z.string(),
  evidence: z.string(),
});

const summaryQuestion = z.object({
  type: z.literal("summary"),
  question: z.string().describe("summary sentence with a ____ gap"),
  answer: z.string(),
  evidence: z.string(),
});

export const readingQuestionSchema = z.discriminatedUnion("type", [
  mcqQuestion,
  tfngQuestion,
  completionQuestion,
  matchingQuestion,
  summaryQuestion,
]);

export const readingPassageSchema = z.object({
  title: z.string(),
  topic: z.string(),
  level: z.string(),
  passage: z.string(),
  wordCount: z.number().int().positive(),
  targetChunks: z.array(z.string()).default([]),
  questions: z.array(readingQuestionSchema).min(8).max(14),
});

export type ReadingQuestion = z.infer<typeof readingQuestionSchema>;
export type ReadingPassage = z.infer<typeof readingPassageSchema>;
