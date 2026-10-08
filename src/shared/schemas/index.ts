import { z } from "zod";
import { readingPassageSchema } from "./reading";
import { listeningScriptSchema } from "./listening";
import {
  chartDataSchema,
  task2PromptSchema,
  writingFeedbackSchema,
} from "./writing";
import {
  cueCardSchema,
  speakingFeedbackSchema,
  speakingFollowUpSchema,
  speakingPart1Schema,
} from "./speaking";
import { diagnosticResultSchema, vocabPackSchema } from "./vocab";

export const SCHEMA_REGISTRY = {
  "reading.passage": readingPassageSchema,
  "listening.script": listeningScriptSchema,
  "writing.task1.chart": chartDataSchema,
  "writing.task2.prompt": task2PromptSchema,
  "writing.feedback": writingFeedbackSchema,
  "speaking.part1": speakingPart1Schema,
  "speaking.part2.cuecard": cueCardSchema,
  "speaking.part3.followup": speakingFollowUpSchema,
  "speaking.feedback": speakingFeedbackSchema,
  "vocab.pack": vocabPackSchema,
  "diagnostic.result": diagnosticResultSchema,
} as const;

export type SchemaId = keyof typeof SCHEMA_REGISTRY;

export function getSchema(id: string): z.ZodType | undefined {
  return (SCHEMA_REGISTRY as Record<string, z.ZodType>)[id];
}

export function schemaToJsonSchema(id: SchemaId): unknown {
  return z.toJSONSchema(SCHEMA_REGISTRY[id]);
}
