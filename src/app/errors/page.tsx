"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/core/db/db";
import { cardFromError } from "@/core/srs/cards";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useState } from "react";

export default function ErrorsPage() {
  const errors = useLiveQuery(
    () => getDb().errors.orderBy("createdAt").reverse().filter((e) => !e.deletedAt).toArray(),
    [],
  );
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");

  const categories = [...new Set((errors ?? []).map((e) => e.category))];
  const shown = (errors ?? []).filter((e) => filter === "all" || e.category === filter);

  async function makeCard(id: string) {
    const err = await getDb().errors.get(id);
    if (!err) return;
    await cardFromError(err);
    setMsg("Card created (or already existed).");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Error Notebook</h1>
      <p className="text-sm text-zinc-500">
        Every correction from Writing and Speaking lands here. Turn them into
        SRS cards so the same mistake never repeats.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          all
        </Button>
        {categories.map((c) => (
          <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} onClick={() => setFilter(c)}>
            {c}
          </Button>
        ))}
      </div>

      {shown.length === 0 && (
        <Card><p className="text-sm text-zinc-500">No errors yet — go write or speak something.</p></Card>
      )}

      <div className="space-y-3">
        {shown.map((e) => (
          <Card key={e.id}>
            <Badge tone="red">{e.category}</Badge>{" "}
            <span className="text-xs text-zinc-400">{new Date(e.createdAt).toLocaleDateString()}</span>
            <div className="mt-2 text-sm">
              <s className="text-red-600">{e.original}</s>
            </div>
            <div className="text-sm text-green-700 dark:text-green-400">{e.corrected}</div>
            <div className="mt-1 text-xs text-zinc-500">{e.explanation}</div>
            <div className="mt-2">
              {e.cardId ? (
                <Badge tone="green">SRS card linked</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => makeCard(e.id)}>
                  Make SRS card
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {msg && <p className="text-sm text-zinc-500">{msg}</p>}
    </div>
  );
}
