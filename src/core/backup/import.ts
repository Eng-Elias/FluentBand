import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";
import type { Table } from "dexie";
import { APP_ID, BACKUP_FORMAT, SCHEMA_VERSION } from "../db/db";
import { EXPORTABLE_TABLES } from "./registry";
import { decryptSecrets, sha256Hex } from "./crypto";
import { mergeTable } from "./merge";
import type { Row } from "../db/types";
import type { Manifest } from "./export";

const manifestSchema = z.looseObject({
  app: z.literal(APP_ID),
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  exportedAt: z.number(),
  deviceLabel: z.string(),
  options: z.looseObject({
    includeAudio: z.boolean(),
    includeKeys: z.boolean(),
  }),
  counts: z.record(z.string(), z.number()),
  sha256: z.record(z.string(), z.string()),
});

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export interface ParsedBackup {
  manifest: Manifest;
  tables: Record<string, Row[]>;
  secretsEncrypted?: Uint8Array;
  audio: Record<string, Uint8Array>;
}

/** Unzip + validate manifest + verify hashes + Zod-validate every row. */
export async function parseBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError("Not a valid backup file (zip unreadable)");
  }
  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new ImportError("Missing manifest.json");
  let manifest: Manifest;
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestRaw))) as Manifest;
  } catch {
    throw new ImportError("Invalid or unrecognized manifest");
  }
  if (manifest.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(
      `Backup was made by a newer app version (schema ${manifest.schemaVersion}). Please update the app.`,
    );
  }
  // Verify integrity of every file listed in manifest.sha256
  for (const [name, hash] of Object.entries(manifest.sha256)) {
    const data = files[name];
    if (!data) throw new ImportError(`Missing file: ${name}`);
    const actual = await sha256Hex(data);
    if (actual !== hash) throw new ImportError(`Integrity check failed: ${name}`);
  }

  const tables: Record<string, Row[]> = {};
  for (const t of EXPORTABLE_TABLES) {
    const raw = files[`data/${t.name}.json`];
    if (!raw) continue;
    let rows: unknown[];
    try {
      rows = JSON.parse(strFromU8(raw));
      if (!Array.isArray(rows)) throw new Error();
    } catch {
      throw new ImportError(`Corrupt data file: ${t.name}.json`);
    }
    const out: Row[] = [];
    for (const r of rows) {
      const check = t.schema.safeParse(r);
      if (!check.success) {
        throw new ImportError(
          `Row failed validation in ${t.name}: ${check.error.issues[0]?.message ?? "invalid"}`,
        );
      }
      out.push(check.data as Row);
    }
    tables[t.name] = out;
  }

  const audio: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith("audio/")) audio[name] = data;
  }

  return { manifest, tables, secretsEncrypted: files["secrets.enc"], audio };
}

/** Decrypt and return provider profiles from an encrypted secrets file. */
export async function extractSecrets(
  secrets: Uint8Array,
  passphrase: string,
): Promise<{ providers: unknown[] }> {
  try {
    const json = await decryptSecrets(secrets, passphrase);
    return JSON.parse(json);
  } catch {
    throw new ImportError("Wrong passphrase or corrupt secrets file");
  }
}

export interface PreviewStats {
  table: string;
  added: number;
  updated: number;
  unchanged: number;
}

type DbLike = {
  table(name: string): { toArray(): Promise<Row[]> };
};

/** Dry-run: compute per-table merge stats without writing. */
export async function previewMerge(
  db: DbLike,
  parsed: ParsedBackup,
): Promise<PreviewStats[]> {
  const stats: PreviewStats[] = [];
  for (const t of EXPORTABLE_TABLES) {
    const incoming = parsed.tables[t.name];
    if (!incoming) continue;
    const local = (await db.table(t.name).toArray()) as Row[];
    const res = mergeTable(local, incoming, t.merge);
    stats.push({
      table: t.name,
      added: res.added,
      updated: res.updated,
      unchanged: res.unchanged,
    });
  }
  return stats;
}

export interface ApplyResult {
  applied: PreviewStats[];
}

/**
 * Apply a parsed backup in ONE transaction (all-or-nothing).
 * mode=merge: merge per registry rules. mode=replace: clear exportable
 * tables first, then bulk-add (caller should have exported a snapshot).
 */
export async function applyBackup(
  db: {
    transaction<T>(
      mode: string,
      tables: readonly (string | Table)[],
      fn: () => Promise<T> | T,
    ): Promise<T>;
    table(name: string): {
      toArray(): Promise<Row[]>;
      clear(): Promise<void>;
      bulkPut(rows: Row[]): Promise<unknown>;
    };
  },
  tableObjects: readonly Table[],
  parsed: ParsedBackup,
  mode: "merge" | "replace",
): Promise<ApplyResult> {
  return db.transaction("rw", tableObjects, async () => {
    const applied: PreviewStats[] = [];
    for (const t of EXPORTABLE_TABLES) {
      const incoming = parsed.tables[t.name];
      if (!incoming) continue;
      const tbl = db.table(t.name);
      if (mode === "replace") {
        await tbl.clear();
        await tbl.bulkPut(incoming);
        applied.push({ table: t.name, added: incoming.length, updated: 0, unchanged: 0 });
      } else {
        const local = await tbl.toArray();
        const res = mergeTable(local as Row[], incoming, t.merge);
        await tbl.bulkPut(res.rows);
        applied.push({
          table: t.name,
          added: res.added,
          updated: res.updated,
          unchanged: res.unchanged,
        });
      }
    }
    return { applied };
  });
}
