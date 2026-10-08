import Dexie, { type Table } from "dexie";
import { v7 as uuidv7 } from "uuid";
import type {
  Attempt,
  Card,
  ContentItem,
  ErrorItem,
  Profile,
  Review,
  Session,
  Settings,
  TopicSeen,
} from "./types";

export const SCHEMA_VERSION = 1;
export const APP_ID = "fluentband";
export const BACKUP_FORMAT = "fluentband-backup";

export class FluentBandDB extends Dexie {
  settings!: Table<Settings, string>;
  profile!: Table<Profile, string>;
  cards!: Table<Card, string>;
  reviews!: Table<Review, string>;
  attempts!: Table<Attempt, string>;
  errors!: Table<ErrorItem, string>;
  content!: Table<ContentItem, string>;
  sessions!: Table<Session, string>;
  topicsSeen!: Table<TopicSeen, string>;

  constructor(name = "fluentband") {
    super(name);
    this.version(1).stores({
      settings: "id",
      profile: "id",
      cards: "id, type, source, fsrs.due, suspended, deletedAt",
      reviews: "id, cardId, createdAt",
      attempts: "id, skill, taskType, createdAt",
      errors: "id, category, attemptId, createdAt",
      content: "id, kind, topic, createdAt",
      sessions: "id, date",
      topicsSeen: "id, topic",
    });
  }
}

let _db: FluentBandDB | undefined;

/** Browser-only singleton. Never call during SSR. */
export function getDb(): FluentBandDB {
  if (!_db) _db = new FluentBandDB();
  return _db;
}

export function newId(): string {
  return uuidv7();
}

export function now(): number {
  return Date.now();
}

export function stamp<T extends { id: string }>(
  row: Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string },
): T {
  const t = now();
  return {
    ...row,
    id: row.id ?? newId(),
    createdAt: t,
    updatedAt: t,
  } as unknown as T;
}

export const SINGLETON_SETTINGS_ID = "settings";
export const SINGLETON_PROFILE_ID = "profile";

export function defaultSettings(): Settings {
  return stamp<Settings>({
    id: SINGLETON_SETTINGS_ID,
    providers: [],
    speech: {
      ttsProvider: "kokoro",
      sttProvider: "whisper",
      voice: "af_heart",
      speed: 1,
      whisperModel: "tiny.en",
    },
    targetBand: 7,
    theme: "system",
    cheaperMode: false,
    sessionsSinceExport: 0,
  });
}

export function defaultProfile(): Profile {
  return stamp<Profile>({
    id: SINGLETON_PROFILE_ID,
    skillLevels: { listening: 5.5, reading: 5.5, writing: 5.5, speaking: 5.5 },
    vocabLevel: "B1",
    weakAreas: [],
    onboardingDone: false,
  });
}
