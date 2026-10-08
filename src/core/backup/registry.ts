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

export interface TableDef {
  /** Dexie table name — must match a table on FluentBandDB */
  name: keyof FluentBandDB & string;
  schema: z.ZodType;
  /** append = union by id; lww = last-write-wins by updatedAt */
  merge: MergeStrategy;
  /** included in export files */
  exportable: boolean;
}

export const TABLE_REGISTRY: TableDef[] = [
  { name: "settings", schema: settingsRowSchema, merge: "lww", exportable: true },
  { name: "profile", schema: profileRowSchema, merge: "lww", exportable: true },
  { name: "cards", schema: cardRowSchema, merge: "lww", exportable: true },
  { name: "reviews", schema: reviewRowSchema, merge: "append", exportable: true },
  { name: "attempts", schema: attemptRowSchema, merge: "append", exportable: true },
  { name: "errors", schema: errorRowSchema, merge: "append", exportable: true },
  { name: "content", schema: contentRowSchema, merge: "lww", exportable: false },
  { name: "sessions", schema: sessionRowSchema, merge: "append", exportable: true },
  { name: "topicsSeen", schema: topicSeenRowSchema, merge: "lww", exportable: true },
];

export const EXPORTABLE_TABLES = TABLE_REGISTRY.filter((t) => t.exportable);

export function getTableDef(name: string): TableDef | undefined {
  return TABLE_REGISTRY.find((t) => t.name === name);
}
