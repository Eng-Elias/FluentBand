import { beforeEach, describe, expect, it } from "vitest";
import { FluentBandDB, defaultProfile, defaultSettings, stamp } from "@/core/db/db";
import { buildBackup } from "@/core/backup/export";
import {
  applyBackup,
  extractSecrets,
  parseBackup,
  previewMerge,
} from "@/core/backup/import";
import { EXPORTABLE_TABLES, TABLE_REGISTRY } from "@/core/backup/registry";
import { mergeTable } from "@/core/backup/merge";
import { encryptSecrets, decryptSecrets } from "@/core/backup/crypto";
import type { Card } from "@/core/db/types";
import { newFsrsState } from "@/core/srs/fsrs";
import { zipSync, strToU8 } from "fflate";

function freshDb(name: string) {
  return new FluentBandDB(name);
}

async function seed(db: FluentBandDB) {
  await db.settings.put(defaultSettings());
  await db.profile.put(defaultProfile());
  await db.cards.add(
    stamp<Card>({
      type: "collocation",
      front: "take into account",
      back: "to consider",
      source: "vocab-pack",
      fsrs: newFsrsState(),
    }),
  );
  await db.reviews.add(stamp({ cardId: "x", rating: 3, durationMs: 1000 }));
  await db.attempts.add(
    stamp({
      skill: "writing",
      taskType: "task2",
      promptSnapshot: "Some prompt",
      input: "my essay",
      band: 6.5,
    }),
  );
  await db.sessions.add(
    stamp({ date: "2026-01-01", plan: [], completedBlocks: [], minutes: 30 }),
  );
}

function tableObjs(db: FluentBandDB) {
  return EXPORTABLE_TABLES.map((t) => db.table(t.name));
}

describe("backup", () => {
  beforeEach(async () => {
    // each test uses a fresh db name implicitly
  });

  it("export → wipe → import = data restored", async () => {
    const db = freshDb("rt1");
    await seed(db);
    const bytes = await buildBackup(db, { includeAudio: false, includeKeys: false });
    const parsed = await parseBackup(bytes);

    // wipe exportable tables
    for (const t of EXPORTABLE_TABLES) await db.table(t.name).clear();

    await applyBackup(db, tableObjs(db), parsed, "merge");
    const cards = await db.cards.toArray();
    expect(cards.length).toBe(1);
    expect(cards[0].front).toBe("take into account");
    const reviews = await db.reviews.toArray();
    expect(reviews.length).toBe(1);
    db.close();
  });

  it("double import is a no-op", async () => {
    const db = freshDb("rt2");
    await seed(db);
    const bytes = await buildBackup(db, { includeAudio: false, includeKeys: false });
    const parsed = await parseBackup(bytes);
    await applyBackup(db, tableObjs(db), parsed, "merge");
    const stats = await previewMerge(db, parsed);
    expect(stats.every((s) => s.added === 0 && s.updated === 0)).toBe(true);
    db.close();
  });

  it("strips API keys by default", async () => {
    const db = freshDb("rt3");
    const s = defaultSettings();
    s.providers = [
      { id: "p1", label: "x", kind: "openai", baseUrl: "https://a", model: "m", apiKey: "secret-key" },
    ];
    await db.settings.put(s);
    const bytes = await buildBackup(db, { includeAudio: false, includeKeys: false });
    const parsed = await parseBackup(bytes);
    const settingsRows = parsed.tables.settings as unknown as {
      providers: { apiKey: string }[];
    }[];
    expect(settingsRows[0].providers[0].apiKey).toBe("");
    db.close();
  });

  it("encrypts/decrypts secrets with passphrase", async () => {
    const enc = await encryptSecrets('{"providers":[]}', "hunter2");
    const dec = await decryptSecrets(enc, "hunter2");
    expect(dec).toBe('{"providers":[]}');
    await expect(decryptSecrets(enc, "wrong")).rejects.toThrow();
  });

  it("rejects tampered files", async () => {
    const db = freshDb("rt4");
    await seed(db);
    const bytes = await buildBackup(db, { includeAudio: false, includeKeys: false });
    const parsed = await parseBackup(bytes);
    // rebuild a tampered zip: modify a data file but keep manifest
    const files: Record<string, Uint8Array> = {
      "manifest.json": strToU8(JSON.stringify(parsed.manifest)),
      "data/cards.json": strToU8('[{"id":"evil"}]'),
    };
    const tampered = zipSync(files);
    await expect(parseBackup(tampered)).rejects.toThrow();
    db.close();
  });

  it("rejects non-zip garbage", async () => {
    await expect(parseBackup(strToU8("not a zip"))).rejects.toThrow();
  });

  it("merge: newer updatedAt wins; append tables union", async () => {
    const a = { id: "1", createdAt: 1, updatedAt: 100, v: "old" };
    const b = { id: "1", createdAt: 1, updatedAt: 200, v: "new" };
    const res = mergeTable([a], [b], "lww");
    expect(res.rows[0]).toEqual(b);
    expect(res.updated).toBe(1);

    const app = mergeTable([a], [a], "append");
    expect(app.rows.length).toBe(1);
    const app2 = mergeTable([a], [{ ...a, id: "2" }], "append");
    expect(app2.rows.length).toBe(2);
  });

  it("tombstones win if newer", async () => {
    const local = { id: "1", createdAt: 1, updatedAt: 100 };
    const inc = { id: "1", createdAt: 1, updatedAt: 90, deletedAt: 300 };
    const res = mergeTable<{ id: string; createdAt: number; updatedAt: number; deletedAt?: number }>([local], [inc], "lww");
    expect(res.rows[0].deletedAt).toBe(300);
  });

  it("every Dexie table is in the registry", () => {
    const db = freshDb("rt5");
    const dbTables = db.tables.map((t) => t.name).sort();
    const regTables = TABLE_REGISTRY.map((t) => t.name).sort();
    expect(regTables).toEqual(dbTables);
    db.close();
  });

  it("secrets round-trip via extractSecrets", async () => {
    const db = freshDb("rt6");
    const s = defaultSettings();
    s.providers = [
      { id: "p1", label: "x", kind: "openai", baseUrl: "https://a", model: "m", apiKey: "sk-live" },
    ];
    await db.settings.put(s);
    const bytes = await buildBackup(db, {
      includeAudio: false,
      includeKeys: true,
      passphrase: "pw",
    });
    const parsed = await parseBackup(bytes);
    expect(parsed.secretsEncrypted).toBeDefined();
    const secrets = await extractSecrets(parsed.secretsEncrypted!, "pw");
    expect((secrets.providers[0] as { apiKey: string }).apiKey).toBe("sk-live");
    db.close();
  });
});
