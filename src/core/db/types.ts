import type { ProviderConfig } from "@/shared/llm";

/** Base fields present on every table (required for export/merge). */
export interface Row {
  id: string; // UUIDv7
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  rev?: number;
}

export interface ProviderProfile extends ProviderConfig {
  id: string;
  label: string;
  apiKey: string; // stored locally; optionally encrypted in backups
}

export interface Settings extends Row {
  providers: ProviderProfile[];
  activeProviderId?: string;
  speech: {
    ttsProvider: "kokoro" | "webspeech" | "local-server";
    sttProvider: "whisper" | "webspeech" | "local-server";
    voice: string;
    speed: number;
    whisperModel: "tiny.en" | "base.en";
    localServerUrl?: string;
  };
  targetBand: number;
  examDate?: string;
  theme: "light" | "dark" | "system";
  cheaperMode: boolean;
  lastExportAt?: number;
  sessionsSinceExport: number;
}

export interface Profile extends Row {
  skillLevels: {
    listening: number;
    reading: number;
    writing: number;
    speaking: number;
  };
  vocabLevel: string;
  weakAreas: string[];
  onboardingDone: boolean;
}

export type CardType = "vocab" | "collocation" | "grammar" | "pron";
export type CardSource =
  | "vocab-pack"
  | "error"
  | "manual"
  | "diagnostic"
  | "import";

export interface FsrsState {
  due: number; // epoch ms
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number; // 0=new 1=learning 2=review 3=relearning
  lastReview?: number;
}

export interface Card extends Row {
  type: CardType;
  front: string;
  back: string;
  example?: string;
  source: CardSource;
  sourceId?: string;
  fsrs: FsrsState;
  suspended?: boolean;
}

export interface Review extends Row {
  cardId: string;
  rating: number; // 1=again 2=hard 3=good 4=easy
  durationMs: number;
}

export type Skill = "listening" | "reading" | "writing" | "speaking";

export interface Attempt extends Row {
  skill: Skill;
  taskType: string;
  promptId?: string;
  promptSnapshot: string;
  input: string; // text or transcript
  audioRef?: string; // content table id holding the recording blob
  result?: unknown;
  band?: number;
  bandRange?: { low: number; high: number };
  durationMs?: number;
  metrics?: Record<string, number>;
  promptVersion?: string;
}

export interface ErrorItem extends Row {
  category: string; // e.g. "grammar.articles"
  original: string;
  corrected: string;
  explanation: string;
  attemptId?: string;
  cardId?: string; // linked SRS card if created
}

export interface ContentItem extends Row {
  kind: string; // reading.passage | listening.script | ...
  topic: string;
  level: string;
  payload: unknown;
  audioBlob?: Blob;
  usedAt?: number;
}

export interface Session extends Row {
  date: string; // YYYY-MM-DD
  plan: SessionBlock[];
  completedBlocks: string[]; // block ids
  minutes: number;
}

export interface SessionBlock {
  id: string;
  kind:
    | "srs_review"
    | "reading"
    | "listening"
    | "speaking_432"
    | "speaking_shadowing"
    | "speaking_part"
    | "writing_t1"
    | "writing_t2"
    | "vocab_pack"
    | "error_review";
  label: string;
  minutes: number;
  topic?: string;
  route: string;
  payload?: Record<string, string>;
}

export interface TopicSeen extends Row {
  topic: string;
  count: number;
  lastSeen: number;
}
