"use client";

import type { Correction } from "@/shared/schemas/common";
import type { WritingFeedback } from "@/shared/schemas/writing";
import type { SpeakingFeedback } from "@/shared/schemas/speaking";
import * as llm from "@/core/llm/client";
import { getDb, stamp } from "@/core/db/db";
import type { Attempt, ErrorItem, Skill } from "@/core/db/types";
import { cardFromError } from "@/core/srs/cards";
import type { GenCtx } from "./content";
import type { ChatMessage } from "@/shared/llm";
import { PROMPT_VERSION } from "@/prompts/common";

function avg05(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 2) / 2;
}

/** Grade writing: sample twice (calibration) and merge. */
export async function gradeWriting(
  schemaId: "writing.feedback",
  messages: ChatMessage[],
  ctx: GenCtx,
): Promise<WritingFeedback> {
  const [a, b] = await Promise.all([
    llm.json<WritingFeedback>(ctx.providerKey.provider, schemaId, messages, { temperature: 0.3, maxTokens: 3000 }, { apiKey: ctx.providerKey.apiKey }),
    llm.json<WritingFeedback>(ctx.providerKey.provider, schemaId, messages, { temperature: 0.4, maxTokens: 3000 }, { apiKey: ctx.providerKey.apiKey }),
  ]);
  const x = a.data;
  const y = b.data;
  return {
    ...x,
    taskAchievement: avg05(x.taskAchievement, y.taskAchievement),
    coherenceCohesion: avg05(x.coherenceCohesion, y.coherenceCohesion),
    lexicalResource: avg05(x.lexicalResource, y.lexicalResource),
    grammaticalRange: avg05(x.grammaticalRange, y.grammaticalRange),
    overall: avg05(x.overall, y.overall),
    overallRange: {
      low: Math.min(x.overallRange.low, y.overallRange.low),
      high: Math.max(x.overallRange.high, y.overallRange.high),
    },
    corrections: [...x.corrections, ...y.corrections].slice(0, 12),
  };
}

export async function gradeSpeaking(
  messages: ChatMessage[],
  ctx: GenCtx,
): Promise<SpeakingFeedback> {
  const { data } = await llm.json<SpeakingFeedback>(
    ctx.providerKey.provider,
    "speaking.feedback",
    messages,
    { temperature: 0.3, maxTokens: 3000 },
    { apiKey: ctx.providerKey.apiKey },
  );
  return data;
}

/** Persist an attempt + push corrections into errors table + SRS cards. */
export async function recordAttempt(fields: {
  skill: Skill;
  taskType: string;
  promptSnapshot: string;
  input: string;
  result?: unknown;
  band?: number;
  bandRange?: { low: number; high: number };
  durationMs?: number;
  metrics?: Record<string, number>;
  audioRef?: string;
}): Promise<Attempt> {
  const db = getDb();
  const attempt = stamp<Attempt>({ ...fields, promptVersion: PROMPT_VERSION });
  await db.attempts.add(attempt);
  return attempt;
}

export async function harvestCorrections(
  corrections: Correction[],
  attemptId: string,
): Promise<number> {
  const db = getDb();
  let count = 0;
  for (const c of corrections) {
    const err = stamp<ErrorItem>({
      category: c.category,
      original: c.original,
      corrected: c.corrected,
      explanation: c.explanation,
      attemptId,
    });
    await db.errors.add(err);
    await cardFromError(err);
    count++;
  }
  return count;
}
