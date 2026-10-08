import { zipSync } from "fflate";
import { APP_ID, BACKUP_FORMAT, SCHEMA_VERSION } from "../db/db";
import { EXPORTABLE_TABLES } from "./registry";
import { encryptSecrets, sha256Hex, toBytes } from "./crypto";
import type { Row } from "../db/types";

export interface Manifest {
  app: string;
  format: string;
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  deviceLabel: string;
  options: { includeAudio: boolean; includeKeys: boolean };
  counts: Record<string, number>;
  sha256: Record<string, string>;
}

export interface ExportOptions {
  includeAudio: boolean;
  includeKeys: boolean;
  passphrase?: string;
  deviceLabel?: string;
  appVersion?: string;
}

type DbLike = {
  table(name: string): { toArray(): Promise<Row[]> };
};

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

  for (const t of EXPORTABLE_TABLES) {
    let rows = (await db.table(t.name).toArray()) as unknown as Record<
      string,
      unknown
    >[];
    // Never export deleted rows.
    rows = rows.filter((r) => !r.deletedAt);
    // Strip API keys unless explicitly included.
    if (t.name === "settings" && !opts.includeKeys) {
      rows = rows.map((r) => ({
        ...r,
        providers: (r.providers as { apiKey: string }[] | undefined)?.map(
          (p) => ({ ...p, apiKey: "" }),
        ),
      }));
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

  // Optional audio recordings (attempts.audioRef → content blobs)
  if (opts.includeAudio) {
    const content = (await db.table("content").toArray()) as {
      id: string;
      audioBlob?: Blob;
      deletedAt?: number;
    }[];
    for (const c of content) {
      if (c.audioBlob && !c.deletedAt) {
        const buf = new Uint8Array(await c.audioBlob.arrayBuffer());
        files[`audio/${c.id}.webm`] = buf;
        hashes[`audio/${c.id}.webm`] = await sha256Hex(buf);
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
    options: { includeAudio: opts.includeAudio, includeKeys: opts.includeKeys },
    counts,
    sha256: hashes,
  };
  files["manifest.json"] = toBytes(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}
