import type { z } from "zod";
import type { FluentBandDB } from "../db/db";
import {
  attemptRowSchema,
  cardRowSchema,
  contentRowSchema,
  errorRowSchema,
  profileRowSchema,
  reviewRowSchema,
  sessionRowSchema,
  settingsRowSchema,
  topicSeenRowSchema,
} from "../db/schemas";

export type MergeStrategy = "lww" | "append";

/** Export category — lets users back up subsets of their data. */
export type BackupCategory = "config" | "progress" | "srs" | "content";

export const CATEGORY_LABELS: Record<BackupCategory, string> = {
  config: "Config & settings",
  progress: "Progress, results & corrections",
  srs: "SRS vocabulary cards",
  content: "Generated library content",
};

export const ALL_CATEGORIES: BackupCategory[] = [
  "config",
  "progress",
  "srs",
  "content",
];

export interface TableDef {
  /** Dexie table name — must match a table on FluentBandDB */
  name: keyof FluentBandDB & string;
  schema: z.ZodType;
  /** append = union by id; lww = last-write-wins by updatedAt */
  merge: MergeStrategy;
  /** included in export files */
  exportable: boolean;
  category: BackupCategory;
}

export const TABLE_REGISTRY: TableDef[] = [
  { name: "settings", schema: settingsRowSchema, merge: "lww", exportable: true, category: "config" },
  { name: "profile", schema: profileRowSchema, merge: "lww", exportable: true, category: "progress" },
  { name: "attempts", schema: attemptRowSchema, merge: "append", exportable: true, category: "progress" },
  { name: "sessions", schema: sessionRowSchema, merge: "append", exportable: true, category: "progress" },
  { name: "errors", schema: errorRowSchema, merge: "append", exportable: true, category: "progress" },
  { name: "cards", schema: cardRowSchema, merge: "lww", exportable: true, category: "srs" },
  { name: "reviews", schema: reviewRowSchema, merge: "append", exportable: true, category: "srs" },
  { name: "content", schema: contentRowSchema, merge: "lww", exportable: true, category: "content" },
  { name: "topicsSeen", schema: topicSeenRowSchema, merge: "lww", exportable: true, category: "content" },
];

export const EXPORTABLE_TABLES = TABLE_REGISTRY.filter((t) => t.exportable);

export function getTableDef(name: string): TableDef | undefined {
  return TABLE_REGISTRY.find((t) => t.name === name);
}
