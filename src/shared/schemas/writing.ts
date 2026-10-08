import { z } from "zod";
import { bandRangeSchema, bandScoreSchema, correctionSchema } from "./common";

// --- Task 1 (Academic): structured chart data rendered by the app as SVG ---

export const chartSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
  color: z.string().optional(),
});

export const chartDataSchema = z.object({
  chartType: z.enum(["line", "bar", "pie", "table"]),
  title: z.string(),
  description: z.string().describe("one-line task prompt shown above the chart"),
  unit: z.string().optional(),
  xLabels: z.array(z.string()).optional(),
  series: z.array(chartSeriesSchema).min(1),
  modelAnswer: z.string(),
  keyFeatures: z.array(z.string()).min(2),
});
export type ChartData = z.infer<typeof chartDataSchema>;

// --- Task 2 ---

export const task2PromptSchema = z.object({
  prompt: z.string(),
  essayType: z.enum([
    "opinion",
    "discuss_both_views",
    "problem_solution",
    "two_part",
    "advantages_disadvantages",
  ]),
  topic: z.string(),
  modelIdeas: z.array(z.string()).min(2),
});
export type Task2Prompt = z.infer<typeof task2PromptSchema>;

// --- Grading ---

export const writingFeedbackSchema = z.object({
  taskAchievement: bandScoreSchema,
  coherenceCohesion: bandScoreSchema,
  lexicalResource: bandScoreSchema,
  grammaticalRange: bandScoreSchema,
  overall: bandScoreSchema,
  overallRange: bandRangeSchema,
  summary: z.string(),
  corrections: z.array(correctionSchema).min(3),
  upgradedSentences: z
    .array(z.object({ original: z.string(), upgraded: z.string() }))
    .default([]),
  topPriorities: z.array(z.string()).min(1).max(5),
});
export type WritingFeedback = z.infer<typeof writingFeedbackSchema>;
