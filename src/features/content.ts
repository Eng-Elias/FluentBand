"use client";

import type { ListeningScript } from "@/shared/schemas/listening";
import type { ReadingPassage, ReadingQuestion } from "@/shared/schemas/reading";
import type { ChartData, Task2Prompt } from "@/shared/schemas/writing";
import type { CueCard, SpeakingFollowUp, SpeakingPart1 } from "@/shared/schemas/speaking";
import type { VocabPack } from "@/shared/schemas/vocab";
import * as llm from "@/core/llm/client";
import { getDb, now, stamp } from "@/core/db/db";
import type { ContentItem } from "@/core/db/types";
import { buildListeningPrompt } from "@/prompts/listening";
import { buildReadingPrompt } from "@/prompts/reading";
import { buildTask1Prompt, buildTask2Prompt } from "@/prompts/writing";
import { buildCueCardPrompt, buildPart1Prompt, buildPart3Prompt } from "@/prompts/speaking";
import { buildVocabPackPrompt } from "@/prompts/vocab";
import { requireProvider } from "@/core/settings";
import type { LearnerCtx } from "@/prompts/common";

export interface GenCtx extends LearnerCtx {
  providerKey: { provider: Parameters<typeof llm.json>[0]; apiKey: string };
}

/** Build generation context from settings/profile; throws NoProviderError. */
export function makeGenCtx(
  settings: Parameters<typeof requireProvider>[0],
  profile?: { skillLevels: Record<string, number>; weakAreas: string[]; vocabLevel: string },
): GenCtx {
  const p = requireProvider(settings);
  return {
    providerKey: { provider: p.provider, apiKey: p.apiKey },
    level: profile?.skillLevels.reading ?? 5.5,
    targetBand: settings?.targetBand ?? 7,
    weakAreas: profile?.weakAreas ?? [],
    cheaperMode: settings?.cheaperMode,
  };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Verify each question's evidence quote appears in the passage; drop failures. */
export function verifyReading(r: ReadingPassage): {
  passage: ReadingPassage;
  dropped: number;
} {
  const hay = norm(r.passage);
  const keep: ReadingQuestion[] = r.questions.filter((q) =>
    hay.includes(norm(q.evidence)),
  );
  return {
    passage: { ...r, questions: keep },
    dropped: r.questions.length - keep.length,
  };
}

/** Verify form-completion answers actually appear in the script text. */
export function verifyListening(l: ListeningScript): {
  script: ListeningScript;
  dropped: number;
} {
  const hay = norm(l.script.map((s) => s.text).join(" "));
  const qs = l.questions.filter((q) =>
    q.type === "form_completion" ? hay.includes(norm(q.answer)) : true,
  );
  return {
    script: { ...l, questions: qs },
    dropped: l.questions.length - qs.length,
  };
}

export async function cacheContent(
  kind: string,
  topic: string,
  level: string,
  payload: unknown,
  extra?: Partial<ContentItem>,
): Promise<ContentItem> {
  const item = stamp<ContentItem>({ kind, topic, level, payload, ...extra });
  await getDb().content.add(item);
  // record topic usage
  const db = getDb();
  const existing = await db.topicsSeen.where("topic").equals(topic).first();
  if (existing) {
    await db.topicsSeen.update(existing.id, {
      count: existing.count + 1,
      lastSeen: Date.now(),
      updatedAt: Date.now(),
    });
  } else {
    await db.topicsSeen.add(
      stamp({ topic, count: 1, lastSeen: Date.now() }),
    );
  }
  return item;
}

export async function generateReading(
  topic: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: ReadingPassage }> {
  const { data } = await llm.json<ReadingPassage>(
    ctx.providerKey.provider,
    "reading.passage",
    buildReadingPrompt(topic, ctx),
    { temperature: 0.8, maxTokens: ctx.cheaperMode ? 4000 : 6000 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const { passage } = verifyReading(data);
  const content = await cacheContent(
    "reading.passage",
    topic,
    String(ctx.level),
    passage,
  );
  return { content, data: passage };
}

export async function generateListening(
  topic: string,
  section: number,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: ListeningScript }> {
  const { data } = await llm.json<ListeningScript>(
    ctx.providerKey.provider,
    "listening.script",
    buildListeningPrompt(topic, section, ctx),
    { temperature: 0.8, maxTokens: ctx.cheaperMode ? 3000 : 5000 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const { script } = verifyListening(data);
  const content = await cacheContent("listening.script", topic, String(ctx.level), script);
  return { content, data: script };
}

export async function generateTask1(
  topic: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: ChartData }> {
  const { data } = await llm.json<ChartData>(
    ctx.providerKey.provider,
    "writing.task1.chart",
    buildTask1Prompt(topic, ctx),
    { temperature: 0.7, maxTokens: 2500 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const content = await cacheContent("writing.task1.chart", topic, String(ctx.level), data);
  return { content, data };
}

export async function generateTask2(
  topic: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: Task2Prompt }> {
  const { data } = await llm.json<Task2Prompt>(
    ctx.providerKey.provider,
    "writing.task2.prompt",
    buildTask2Prompt(topic, ctx),
    { temperature: 0.8, maxTokens: 1200 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const content = await cacheContent("writing.task2.prompt", topic, String(ctx.level), data);
  return { content, data };
}

export async function generateVocabPack(
  topic: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: VocabPack }> {
  const { data } = await llm.json<VocabPack>(
    ctx.providerKey.provider,
    "vocab.pack",
    buildVocabPackPrompt(topic, ctx),
    { temperature: 0.7, maxTokens: 2000 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const content = await cacheContent("vocab.pack", topic, String(ctx.level), data);
  return { content, data };
}

/** Load a saved content item (for the library / deep links). */
export async function loadContent(id: string): Promise<ContentItem | undefined> {
  const item = await getDb().content.get(id);
  if (!item || item.deletedAt) return undefined;
  void getDb().content.update(id, { usedAt: now() });
  return item;
}

/** Persist synthesized audio turns (e.g. a listening script) on a content row. */
export async function saveContentAudio(id: string, blobs: Blob[]): Promise<void> {
  await getDb().content.update(id, { audioBlobs: blobs, updatedAt: now() });
}

/** Soft-delete content items by id. */
export async function deleteContent(ids: string[]): Promise<void> {
  const t = now();
  await getDb().content.bulkUpdate(
    ids.map((id) => ({ key: id, changes: { deletedAt: t, updatedAt: t } })),
  );
}

export async function generatePart1(
  theme: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: SpeakingPart1 }> {
  const { data } = await llm.json<SpeakingPart1>(
    ctx.providerKey.provider,
    "speaking.part1",
    buildPart1Prompt(theme, ctx),
    { temperature: 0.7, maxTokens: 800 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const content = await cacheContent("speaking.part1", theme, String(ctx.level), data);
  return { content, data };
}

export async function generateCueCard(
  topic: string,
  ctx: GenCtx,
): Promise<{ content: ContentItem; data: CueCard }> {
  const { data } = await llm.json<CueCard>(
    ctx.providerKey.provider,
    "speaking.part2.cuecard",
    buildCueCardPrompt(topic, ctx),
    { temperature: 0.7, maxTokens: 800 },
    { apiKey: ctx.providerKey.apiKey },
  );
  const content = await cacheContent("speaking.part2.cuecard", topic, String(ctx.level), data);
  return { content, data };
}

export async function generatePart3(
  topic: string,
  learnerAnswers: string,
  ctx: GenCtx,
): Promise<SpeakingFollowUp> {
  const { data } = await llm.json<SpeakingFollowUp>(
    ctx.providerKey.provider,
    "speaking.part3.followup",
    buildPart3Prompt(topic, learnerAnswers, ctx),
    { temperature: 0.7, maxTokens: 800 },
    { apiKey: ctx.providerKey.apiKey },
  );
  return data;
}
