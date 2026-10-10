"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/core/db/db";
import type { ContentItem } from "@/core/db/types";
import { deleteContent } from "@/features/content";
import { Badge, Button, Card } from "@/components/ui/primitives";

export const KIND_LABELS: Record<string, string> = {
  "reading.passage": "Reading",
  "listening.script": "Listening",
  "writing.task1.chart": "Writing T1",
  "writing.task2.prompt": "Writing T2",
  "vocab.pack": "Vocab pack",
  "speaking.part2.cuecard": "Speaking P2",
  "speaking.part1": "Speaking P1",
  recording: "Recording",
};

function truncate(s: string, n = 110): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Human-readable title for a saved item's payload. */
export function titleOf(item: ContentItem): string {
  const p = item.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return item.topic || item.kind;
  if (typeof p.title === "string") return p.title;
  if (typeof p.description === "string") return truncate(p.description);
  if (typeof p.prompt === "string") return truncate(p.prompt);
  if (Array.isArray(p.questions)) return `${item.topic} — ${p.questions.length} questions`;
  if (Array.isArray(p.items)) return `${item.topic} — ${p.items.length} items`;
  return item.topic || item.kind;
}

/**
 * Compact list of previously generated content of the given kinds,
 * shown on a practice page's idle screen. `onOpen` loads the item
 * straight into the page (same path as the ?content= deep link).
 */
export function SavedContent({
  kinds,
  title = "Your saved tests",
  onOpen,
}: {
  kinds: string[];
  title?: string;
  onOpen: (item: ContentItem) => void;
}) {
  const kindsKey = kinds.join(",");
  const items = useLiveQuery(
    () =>
      getDb()
        .content.orderBy("createdAt")
        .reverse()
        .filter((c) => !c.deletedAt && kinds.includes(c.kind))
        .toArray(),
     
    [kindsKey],
  );

  if (!items?.length) return null;

  async function remove(item: ContentItem) {
    if (!window.confirm(`Delete "${titleOf(item)}"? This cannot be undone.`)) return;
    await deleteContent([item.id]);
  }

  const shown = items.slice(0, 10);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href="/library" className="text-xs text-blue-600 underline">
          Manage in Library
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{titleOf(item)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                {item.topic && <Badge>{item.topic}</Badge>}
                {(item.audioBlob ?? item.audioBlobs?.length) ? (
                  <Badge tone="green">audio</Badge>
                ) : null}
                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Button size="sm" onClick={() => onOpen(item)}>Open</Button>
            <Button size="sm" variant="ghost" onClick={() => void remove(item)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p className="mt-2 text-xs text-zinc-500">
          {items.length - shown.length} more in the{" "}
          <Link href="/library" className="text-blue-600 underline">Library</Link>.
        </p>
      )}
    </Card>
  );
}
