"use client";

import { useEffect, useRef, useState } from "react";
import { getDb } from "@/core/db/db";
import { buildBackup } from "@/core/backup/export";
import {
  applyBackup,
  extractSecrets,
  parseBackup,
  previewMerge,
  type ParsedBackup,
  type PreviewStats,
} from "@/core/backup/import";
import { EXPORTABLE_TABLES } from "@/core/backup/registry";
import { now, SINGLETON_SETTINGS_ID } from "@/core/db/db";
import { Button, Card, Input, Badge, Spinner } from "@/components/ui/primitives";

export default function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [preview, setPreview] = useState<PreviewStats[] | null>(null);
  const [importPass, setImportPass] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
    navigator.storage?.persist?.().catch(() => undefined);
    void getDb().settings.get(SINGLETON_SETTINGS_ID).then((s) => {
      if (s?.lastExportAt) {
        const days = (now() - s.lastExportAt) / 86400000;
        if (days > 7 || (s.sessionsSinceExport ?? 0) >= 5) {
          setStatus(
            `Reminder: your last export was ${Math.floor(days)} days ago. ` +
              "Export regularly — browser storage can be evicted.",
          );
        }
      }
    });
  }, []);

  async function doExport() {
    setBusy(true);
    setStatus("Building backup…");
    try {
      const bytes = await buildBackup(getDb(), {
        includeAudio,
        includeKeys,
        passphrase: includeKeys ? passphrase : undefined,
        deviceLabel: navigator.platform || "browser",
      });
      const date = new Date().toISOString().slice(0, 10);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/zip",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fluentband-backup-${date}.fluentband`;
      a.click();
      URL.revokeObjectURL(a.href);
      await getDb().settings.update(SINGLETON_SETTINGS_ID, {
        lastExportAt: now(),
        sessionsSinceExport: 0,
      });
      setStatus("Backup downloaded.");
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File) {
    setBusy(true);
    setStatus("Validating…");
    setParsed(null);
    setPreview(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const p = await parseBackup(bytes);
      setParsed(p);
      const stats = await previewMerge(getDb(), p);
      setPreview(stats);
      setStatus(
        `Backup OK — schema v${p.manifest.schemaVersion}, exported ${new Date(p.manifest.exportedAt).toLocaleDateString()}`,
      );
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doImport(mode: "merge" | "replace") {
    if (!parsed) return;
    setBusy(true);
    setStatus("Importing…");
    try {
      if (mode === "replace") {
        // safety snapshot before wiping
        const snap = await buildBackup(getDb(), {
          includeAudio: false,
          includeKeys: false,
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([snap.buffer as ArrayBuffer]));
        a.download = `fluentband-pre-import-snapshot.fluentband`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      const tableObjs = EXPORTABLE_TABLES.map((t) => getDb().table(t.name));
      const res = await applyBackup(getDb(), tableObjs, parsed, mode);

      // Apply encrypted secrets if present
      if (parsed.secretsEncrypted) {
        if (!importPass) {
          setStatus("Data imported. Secrets file present — enter passphrase to import keys.");
        } else {
          const secrets = await extractSecrets(parsed.secretsEncrypted, importPass);
          const db = getDb();
          const s = await db.settings.get(SINGLETON_SETTINGS_ID);
          if (s) {
            const incoming = (secrets.providers ?? []) as {
              id: string;
              apiKey: string;
            }[];
            const merged = s.providers.map((p) => {
              const inc = incoming.find((i) => i.id === p.id);
              // never overwrite an existing key with an empty one
              return inc && inc.apiKey ? { ...p, ...inc } : p;
            });
            const have = new Set(s.providers.map((p) => p.id));
            for (const inc of incoming) {
              if (!have.has(inc.id)) merged.push(inc as never);
            }
            await db.settings.update(SINGLETON_SETTINGS_ID, {
              providers: merged,
              updatedAt: now(),
            });
          }
        }
      }

      // Restore audio blobs into content rows
      for (const [name, bytes] of Object.entries(parsed.audio)) {
        const id = name.replace("audio/", "").replace(".webm", "");
        const row = await getDb().content.get(id);
        if (row) {
          await getDb().content.update(id, {
            audioBlob: new Blob([bytes.buffer as ArrayBuffer], { type: "audio/webm" }),
          });
        }
      }

      setStatus(
        `Import complete (${mode}). ` +
          res.applied.map((a) => `${a.table}: +${a.added} ~${a.updated}`).join(", "),
      );
      setParsed(null);
      setPreview(null);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>
      {persisted === false && (
        <Card className="border-amber-400">
          <Badge tone="amber">Storage not persisted</Badge>
          <p className="mt-1 text-sm text-zinc-500">
            Your browser may evict this site&apos;s data if unused. Export
            regularly; on iOS/Safari, use &quot;Add to Home Screen&quot;.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Export</h2>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} />
            Include speaking recordings (larger file)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeKeys} onChange={(e) => setIncludeKeys(e.target.checked)} />
            Include API keys (AES-encrypted with passphrase)
          </label>
          {includeKeys && (
            <Input
              type="password"
              placeholder="Passphrase for key encryption"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          )}
        </div>
        <Button className="mt-3" onClick={doExport} disabled={busy || (includeKeys && !passphrase)}>
          {busy ? <Spinner className="mr-2" /> : null}Download backup file
        </Button>
      </Card>

      <Card>
        <h2 className="font-semibold">Import</h2>
        <div
          className="mt-3 rounded border-2 border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void onFile(f);
          }}
        >
          Drag &amp; drop a .fluentband file, or{" "}
          <button className="text-blue-600 underline" onClick={() => fileRef.current?.click()}>
            browse
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".fluentband,.zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
        </div>

        {preview && (
          <div className="mt-3">
            <h3 className="text-sm font-medium">Preview (dry-run)</h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th>Table</th><th>New</th><th>Updated</th><th>Unchanged</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s) => (
                  <tr key={s.table}>
                    <td>{s.table}</td><td>{s.added}</td><td>{s.updated}</td><td>{s.unchanged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed?.secretsEncrypted && (
              <div className="mt-2">
                <Input
                  type="password"
                  placeholder="Passphrase for API keys in file"
                  value={importPass}
                  onChange={(e) => setImportPass(e.target.value)}
                />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => doImport("merge")} disabled={busy}>
                Merge (recommended)
              </Button>
              <Button variant="destructive" onClick={() => doImport("replace")} disabled={busy}>
                Replace all data
              </Button>
              <Button variant="ghost" onClick={() => { setParsed(null); setPreview(null); }}>
                Cancel
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Replace mode downloads a snapshot of your current data first.
            </p>
          </div>
        )}
      </Card>

      {status && (
        <Card>
          <p className="text-sm">{status}</p>
        </Card>
      )}
    </div>
  );
}
