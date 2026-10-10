"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, now } from "@/core/db/db";
import type { Card } from "@/core/db/types";
import { addCard, dueCards, recordReview } from "@/core/srs/cards";
import { useProfile, useSettings } from "@/core/settings";
import { generateVocabPack, loadContent, makeGenCtx, type GenCtx } from "@/features/content";
import type { VocabPack } from "@/shared/schemas/vocab";
import { pickTopic } from "@/core/planner/topics";
import { Button, Card as CardUI, Input, Badge, Spinner } from "@/components/ui/primitives";
import { SavedContent } from "@/components/SavedContent";
import type { ReviewRating } from "@/core/srs/fsrs";
import { NoProviderError } from "@/core/settings";

type Phase = "idle" | "reviewing" | "done";

export default function VocabPage() {
  return (
    <Suspense fallback={<CardUI><Spinner className="mr-2" />Loading…</CardUI>}>
      <VocabInner />
    </Suspense>
  );
}

function VocabInner() {
  const settings = useSettings();
  const profile = useProfile();
  const params = useSearchParams();
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reviewStart, setReviewStart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [manualFront, setManualFront] = useState("");
  const [manualBack, setManualBack] = useState("");
  const [savedPack, setSavedPack] = useState<VocabPack | null>(null);
  const contentParam = params.get("content");
  const cardCount = useLiveQuery(
    () => getDb().cards.filter((c) => !c.deletedAt).count(),
    [],
  );

  const loadQueue = useCallback(async () => {
    const cards = await dueCards(30);
    setQueue(cards);
    setIdx(0);
    setRevealed(false);
    setPhase(cards.length ? "reviewing" : "done");
    setReviewStart(now());
  }, []);

  useEffect(() => {
    // defer to a microtask — setState happens after the await, not in-effect
    void Promise.resolve().then(() => loadQueue());
  }, [loadQueue]);

  // Deep link from the library / saved list: show a previously generated pack.
  useEffect(() => {
    if (!contentParam) return;
    let cancelled = false;
    void loadContent(contentParam).then((item) => {
      if (cancelled) return;
      if (item?.kind === "vocab.pack") {
        setSavedPack(item.payload as VocabPack);
      } else {
        setMsg("Saved pack not found.");
      }
    });
    return () => { cancelled = true; };
  }, [contentParam]);

  // Clicking the "Vocab" nav link while on this page → close the open pack.
  useEffect(() => {
    const h = () => setSavedPack(null);
    window.addEventListener("fluentband:reset-page", h);
    return () => window.removeEventListener("fluentband:reset-page", h);
  }, []);

  async function addPackItems(pack: VocabPack) {
    let added = 0;
    for (const item of pack.items) {
      const card = await addCard({
        type: "collocation",
        front: item.chunk,
        back: `${item.meaning}\n\n${item.example}`,
        example: item.example,
        source: "vocab-pack",
      });
      if (card.createdAt > now() - 5000) added++;
    }
    return added;
  }

  async function addSavedPack() {
    if (!savedPack) return;
    setBusy(true);
    const added = await addPackItems(savedPack);
    setMsg(`Added ${added} new cards from "${savedPack.topic}".`);
    setBusy(false);
    await loadQueue();
  }

  async function rate(r: ReviewRating) {
    const card = queue[idx];
    if (!card) return;
    await recordReview(card.id, r, now() - reviewStart);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setRevealed(false);
      setReviewStart(now());
    } else {
      setPhase("done");
      setMsg("Session complete — nice work.");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "reviewing") return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        const map: Record<string, ReviewRating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
        void rate(map[e.key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealed, idx, queue]);

  async function genPack() {
    setBusy(true);
    setMsg("");
    try {
      const seen = await getDb().topicsSeen.toArray();
      const topic = pickTopic(seen);
      const ctx: GenCtx = makeGenCtx(settings, profile);
      const { data } = await generateVocabPack(topic, ctx);
      const added = await addPackItems(data);
      setMsg(`Generated "${data.topic}" pack — ${data.items.length} items (${added} new cards).`);
      await loadQueue();
    } catch (e) {
      setMsg(
        e instanceof NoProviderError
          ? e.message
          : `Generation failed: ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    if (!manualFront.trim() || !manualBack.trim()) return;
    await addCard({
      type: "vocab",
      front: manualFront.trim(),
      back: manualBack.trim(),
      source: "manual",
    });
    setManualFront("");
    setManualBack("");
    setMsg("Card added.");
    await loadQueue();
  }

  const card = queue[idx];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vocabulary &amp; SRS</h1>
        <Badge>{cardCount ?? "…"} cards total</Badge>
      </div>

      {phase === "reviewing" && card && (
        <CardUI className="mx-auto max-w-xl text-center">
          <Badge tone="blue">{card.type}</Badge>{" "}
          <Badge>{card.source}</Badge>
          <div className="mt-4 min-h-24 whitespace-pre-wrap text-lg">{card.front}</div>
          {revealed ? (
            <>
              <div className="mt-4 whitespace-pre-wrap border-t border-zinc-200 pt-4 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                {card.back}
              </div>
              <div className="mt-6 flex justify-center gap-2">
                <Button variant="destructive" onClick={() => rate("again")}>Again (1)</Button>
                <Button variant="secondary" onClick={() => rate("hard")}>Hard (2)</Button>
                <Button onClick={() => rate("good")}>Good (3)</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => rate("easy")}>Easy (4)</Button>
              </div>
            </>
          ) : (
            <Button className="mt-6" onClick={() => setRevealed(true)}>
              Show answer (Space)
            </Button>
          )}
          <div className="mt-4 text-xs text-zinc-400">
            Card {idx + 1} of {queue.length}
          </div>
        </CardUI>
      )}

      {phase === "done" && (
        <CardUI className="mx-auto max-w-xl text-center">
          <p className="text-lg">No cards due right now.</p>
          <p className="mt-1 text-sm text-zinc-500">
            New cards arrive automatically from corrections and generated vocab
            packs.
          </p>
          <Button className="mt-4" variant="outline" onClick={loadQueue}>
            Re-check
          </Button>
        </CardUI>
      )}

      {savedPack && (
        <CardUI>
          <h2 className="font-semibold">Saved pack: {savedPack.topic}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {savedPack.items.map((item, i) => (
              <li key={i} className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
                <div className="font-medium">{item.chunk}</div>
                <div className="text-zinc-600 dark:text-zinc-400">{item.meaning}</div>
                <div className="text-xs text-zinc-500 italic">{item.example}</div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={addSavedPack} disabled={busy}>
              Add to SRS cards
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSavedPack(null)}>
              Close
            </Button>
          </div>
        </CardUI>
      )}

      <SavedContent
        kinds={["vocab.pack"]}
        title="Your vocab packs"
        onOpen={(item) => setSavedPack(item.payload as VocabPack)}
      />

      <CardUI>
        <h2 className="font-semibold">Generate a vocab pack</h2>
        <p className="mt-1 text-sm text-zinc-500">
          LLM generates 8–12 collocations/chunks on a fresh IELTS topic, added
          as SRS cards.
        </p>
        <Button className="mt-3" onClick={genPack} disabled={busy}>
          {busy ? <Spinner className="mr-2" /> : null}Generate pack
        </Button>
      </CardUI>

      <CardUI>
        <h2 className="font-semibold">Add a card manually</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input placeholder="Front (e.g. a word/phrase or 'Fix this: …')" value={manualFront} onChange={(e) => setManualFront(e.target.value)} />
          <Input placeholder="Back (meaning / correction)" value={manualBack} onChange={(e) => setManualBack(e.target.value)} />
        </div>
        <Button className="mt-3" variant="outline" onClick={addManual}>Add card</Button>
      </CardUI>

      {msg && <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>}
    </div>
  );
}
