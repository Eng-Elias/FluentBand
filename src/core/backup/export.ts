import { zipSync } from "fflate";
import { APP_ID, BACKUP_FORMAT, SCHEMA_VERSION } from "../db/db";
import { EXPORTABLE_TABLES } from "./registry";
import type { BackupCategory } from "./registry";
import { encryptSecrets, sha256Hex, toBytes } from "./crypto";
import type { Row } from "../db/types";

export interface Manifest {
  app: string;
  format: string;
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  deviceLabel: string;
  options: {
    includeAudio: boolean;
    includeKeys: boolean;
    categories?: string[];
  };
  counts: Record<string, number>;
  sha256: Record<string, string>;
}

export interface ExportOptions {
  includeAudio: boolean;
  includeKeys: boolean;
  passphrase?: string;
  deviceLabel?: string;
  appVersion?: string;
  /** Limit which registry categories are exported (default: all). */
  categories?: BackupCategory[];
  /** Limit content-table rows to these ids (applies when 'content' is included). */
  contentIds?: string[];
}

type DbLike = {
  table(name: string): { toArray(): Promise<Row[]> };
};

function blobExt(type: string): string {
  if (type.includes("wav")) return "wav";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Build a .fluentband backup (ZIP). Returns the file bytes.
 * `db` is structural so tests can inject a fake.
 */
export async function buildBackup(
  db: DbLike,
  opts: ExportOptions,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};
  const hashes: Record<string, string> = {};
  const cats = opts.categories ? new Set<string>(opts.categories) : null;

  for (const t of EXPORTABLE_TABLES) {
    if (cats && !cats.has(t.category)) continue;
    let rows = (await db.table(t.name).toArray()) as unknown as Record<
      string,
      unknown
    >[];
    // Never export deleted rows.
    rows = rows.filter((r) => !r.deletedAt);
    if (t.name === "content" && opts.contentIds) {
      const keep = new Set(opts.contentIds);
      rows = rows.filter((r) => keep.has(r.id as string));
    }
    // Strip API keys unless explicitly included.
    if (t.name === "settings" && !opts.includeKeys) {
      rows = rows.map((r) => ({
        ...r,
        providers: (r.providers as { apiKey: string }[] | undefined)?.map(
          (p) => ({ ...p, apiKey: "" }),
        ),
      }));
    }
    // Blob fields are not JSON-serializable — audio ships under audio/.
    if (t.name === "content") {
      rows = rows.map((r) => {
        const rest = { ...r };
        delete rest.audioBlob;
        delete rest.audioBlobs;
        return rest;
      });
    }
    const bytes = toBytes(JSON.stringify(rows));
    files[`data/${t.name}.json`] = bytes;
    counts[t.name] = rows.length;
    hashes[`data/${t.name}.json`] = await sha256Hex(bytes);
  }

  // Optional encrypted secrets
  if (opts.includeKeys && opts.passphrase) {
    const settingsRows = (await db.table("settings").toArray()) as {
      providers?: { apiKey: string }[];
    }[];
    const keys = settingsRows.flatMap((s) => s.providers ?? []);
    const secretBytes = toBytes(JSON.stringify({ providers: keys }));
    const enc = await encryptSecrets(JSON.stringify({ providers: keys }), opts.passphrase);
    files["secrets.enc"] = enc;
    counts["secrets"] = secretBytes.length;
    hashes["secrets.enc"] = await sha256Hex(enc);
  }

  // Optional audio (speaking recordings, synthesized listening audio)
  if (opts.includeAudio) {
    const content = (await db.table("content").toArray()) as {
      id: string;
      audioBlob?: Blob;
      audioBlobs?: Blob[];
      deletedAt?: number;
    }[];
    const idFilter = opts.contentIds ? new Set(opts.contentIds) : null;
    for (const c of content) {
      if (c.deletedAt || (idFilter && !idFilter.has(c.id))) continue;
      if (c.audioBlob && c.audioBlob.size > 0) {
        const buf = new Uint8Array(await c.audioBlob.arrayBuffer());
        const name = `audio/${c.id}.${blobExt(c.audioBlob.type)}`;
        files[name] = buf;
        hashes[name] = await sha256Hex(buf);
      }
      for (const [i, b] of (c.audioBlobs ?? []).entries()) {
        if (!b || b.size === 0) continue;
        const buf = new Uint8Array(await b.arrayBuffer());
        const name = `audio/${c.id}.${i}.${blobExt(b.type)}`;
        files[name] = buf;
        hashes[name] = await sha256Hex(buf);
      }
    }
  }

  const manifest: Manifest = {
    app: APP_ID,
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: opts.appVersion ?? "0.1.0",
    exportedAt: Date.now(),
    deviceLabel: opts.deviceLabel ?? "browser",
    options: {
      includeAudio: opts.includeAudio,
      includeKeys: opts.includeKeys,
      categories: cats ? [...cats] : undefined,
    },
    counts,
    sha256: hashes,
  };
  files["manifest.json"] = toBytes(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}
