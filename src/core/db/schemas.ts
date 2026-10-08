import { z } from "zod";

const row = {
  id: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
  rev: z.number().optional(),
};

export const providerProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["openai", "anthropic"]),
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

export const settingsRowSchema = z.looseObject({
  ...row,
  providers: z.array(providerProfileSchema),
  activeProviderId: z.string().optional(),
  speech: z.looseObject({
    ttsProvider: z.enum(["kokoro", "webspeech", "local-server"]),
    sttProvider: z.enum(["whisper", "webspeech", "local-server"]),
    voice: z.string(),
    speed: z.number(),
    whisperModel: z.enum(["tiny.en", "base.en"]),
    localServerUrl: z.string().optional(),
  }),
  targetBand: z.number(),
  examDate: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]),
  cheaperMode: z.boolean(),
  lastExportAt: z.number().optional(),
  sessionsSinceExport: z.number(),
});

export const profileRowSchema = z.looseObject({
  ...row,
  skillLevels: z.looseObject({
    listening: z.number(),
    reading: z.number(),
    writing: z.number(),
    speaking: z.number(),
  }),
  vocabLevel: z.string(),
  weakAreas: z.array(z.string()),
  onboardingDone: z.boolean(),
});

export const cardRowSchema = z.looseObject({
  ...row,
  type: z.enum(["vocab", "collocation", "grammar", "pron"]),
  front: z.string(),
  back: z.string(),
  example: z.string().optional(),
  source: z.enum(["vocab-pack", "error", "manual", "diagnostic", "import"]),
  sourceId: z.string().optional(),
  fsrs: z.looseObject({
    due: z.number(),
    stability: z.number(),
    difficulty: z.number(),
    elapsedDays: z.number(),
    scheduledDays: z.number(),
    reps: z.number(),
    lapses: z.number(),
    state: z.number(),
    lastReview: z.number().optional(),
  }),
  suspended: z.boolean().optional(),
});

export const reviewRowSchema = z.looseObject({
  ...row,
  cardId: z.string(),
  rating: z.number(),
  durationMs: z.number(),
});

export const attemptRowSchema = z.looseObject({
  ...row,
  skill: z.enum(["listening", "reading", "writing", "speaking"]),
  taskType: z.string(),
  promptId: z.string().optional(),
  promptSnapshot: z.string(),
  input: z.string(),
  audioRef: z.string().optional(),
  result: z.unknown().optional(),
  band: z.number().optional(),
  bandRange: z.looseObject({ low: z.number(), high: z.number() }).optional(),
  durationMs: z.number().optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  promptVersion: z.string().optional(),
});

export const errorRowSchema = z.looseObject({
  ...row,
  category: z.string(),
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
  attemptId: z.string().optional(),
  cardId: z.string().optional(),
});

export const contentRowSchema = z.looseObject({
  ...row,
  kind: z.string(),
  topic: z.string(),
  level: z.string(),
  payload: z.unknown(),
  usedAt: z.number().optional(),
});

export const sessionBlockSchema = z.looseObject({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  minutes: z.number(),
  topic: z.string().optional(),
  route: z.string(),
  payload: z.record(z.string(), z.string()).optional(),
});

export const sessionRowSchema = z.looseObject({
  ...row,
  date: z.string(),
  plan: z.array(sessionBlockSchema),
  completedBlocks: z.array(z.string()),
  minutes: z.number(),
});

export const topicSeenRowSchema = z.looseObject({
  ...row,
  topic: z.string(),
  count: z.number(),
  lastSeen: z.number(),
});
