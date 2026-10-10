"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/core/db/db";
import type { ContentItem } from "@/core/db/types";
import { deleteContent } from "@/features/content";
import { buildBackup } from "@/core/backup/export";
import { playBlob } from "@/core/speech/tts";
import { Badge, Button, Card, Input, Select, Spinner } from "@/components/ui/primitives";
import { KIND_LABELS, titleOf } from "@/components/SavedContent";

const KIND_ROUTES: Record<string, (id: string) => string> = {
  "reading.passage": (id) => `/reading?content=${id}`,
  "listening.script": (id) => `/listening?content=${id}`,
  "writing.task1.chart": (id) => `/writing?task=1&content=${id}`,
  "writing.task2.prompt": (id) => `/writing?content=${id}`,
  "vocab.pack": (id) => `/vocab?content=${id}`,
  "speaking.part2.cuecard": (id) => `/speaking?content=${id}`,
  "speaking.part1": (id) => `/speaking?content=${id}`,
};

function searchText(item: ContentItem): string {
  return `${item.kind} ${item.topic} ${titleOf(item)} ${JSON.stringify(item.payload)}`.toLowerCase();
}

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const items = useLiveQuery(
    () =>
      getDb()
        .content.orderBy("createdAt")
        .reverse()
        .filter((c) => !c.deletedAt)
        .toArray(),
    [],
  );

  const kinds = useMemo(
    () => [...new Set((items ?? []).map((i) => i.kind))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!q || searchText(i).includes(q)),
    );
  }, [items, kind, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map((i) => i.id)));
  }

  async function remove(ids: string[], label: string) {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await deleteContent(ids);
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setStatus(`Deleted ${ids.length} item(s).`);
  }

  async function exportSelected() {
    if (!selected.size) return;
    setBusy(true);
    setStatus("Building export…");
    try {
      const bytes = await buildBackup(getDb(), {
        includeAudio: true,
        includeKeys: false,
        categories: ["content"],
        contentIds: [...selected],
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }));
      a.download = `fluentband-content-${new Date().toISOString().slice(0, 10)}.fluentband`;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(`Exported ${selected.size} item(s).`);
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function play(item: ContentItem) {
    const blob = item.audioBlob ?? item.audioBlobs?.[0];
    if (!blob || playingId) return;
    setPlayingId(item.id);
    try {
      await playBlob(blob);
    } catch {
      /* ignore */
    } finally {
      setPlayingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <Badge>{filtered.length} items</Badge>
      </div>
      <p className="text-sm text-zinc-500">
        Everything the app has generated for you — reopen any test to practice
        it again, or export/delete it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search topic, title, text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-44">
          <option value="all">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm" variant="outline"
            disabled={!selected.size}
            onClick={exportSelected}
          >
            Export selected
          </Button>
          <Button
            size="sm" variant="destructive"
            disabled={!selected.size}
            onClick={() => remove([...selected], `${selected.size} selected item(s)`)}
          >
            Delete selected
          </Button>
          <Button
            size="sm" variant="destructive"
            disabled={kind === "all" || !filtered.length}
            onClick={() =>
              remove(filtered.map((i) => i.id), `all ${filtered.length} "${KIND_LABELS[kind] ?? kind}" item(s)`)
            }
          >
            Delete all of this type
          </Button>
          <Button
            size="sm" variant="destructive"
            disabled={!items?.length}
            onClick={() => remove((items ?? []).map((i) => i.id), `ALL ${items?.length} library items`)}
          >
            Delete everything
          </Button>
        </div>
      </div>

      {busy && <Card><Spinner className="mr-2" />{status || "Working…"}</Card>}

      {!items && <Card><Spinner className="mr-2" />Loading…</Card>}
      {items && !filtered.length && (
        <Card>
          <p className="text-sm text-zinc-500">
            {items.length ? "No items match your filters." : "Nothing generated yet — create a test from Reading, Listening, Writing, Speaking, or Vocab."}
          </p>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            Select all ({filtered.length})
          </label>
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((item) => {
              const route = KIND_ROUTES[item.kind];
              const hasAudio = !!(item.audioBlob ?? item.audioBlobs?.length);
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                      {item.topic && <Badge>{item.topic}</Badge>}
                      {item.level && <Badge>L{item.level}</Badge>}
                      {hasAudio && <Badge tone="green">audio</Badge>}
                    </div>
                    <div className="mt-1 text-sm font-medium">{titleOf(item)}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(item.createdAt).toLocaleString()}
                      {item.usedAt ? ` · last used ${new Date(item.usedAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {item.kind === "recording" && hasAudio && (
                      <Button size="sm" variant="outline" disabled={!!playingId} onClick={() => void play(item)}>
                        {playingId === item.id ? "Playing…" : "Play"}
                      </Button>
                    )}
                    {route && (
                      <Link href={route(item.id)}>
                        <Button size="sm">Practice</Button>
                      </Link>
                    )}
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => remove([item.id], `"${titleOf(item)}"`)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {status && !busy && <p className="text-sm text-zinc-600 dark:text-zinc-400">{status}</p>}
    </div>
  );
}
