import { getDb, newId, now, stamp } from "../db/db";
import type { Card, CardSource, CardType, ErrorItem, Review } from "../db/types";
import { newFsrsState, schedule, type ReviewRating } from "./fsrs";

export function makeCard(fields: {
  type: CardType;
  front: string;
  back: string;
  example?: string;
  source: CardSource;
  sourceId?: string;
}): Card {
  return stamp<Card>({ ...fields, fsrs: newFsrsState() });
}

/** Persist a card, deduping on front text (case-insensitive). */
export async function addCard(fields: Parameters<typeof makeCard>[0]): Promise<Card> {
  const db = getDb();
  const existing = await db.cards
    .filter((c) => !c.deletedAt && c.front.toLowerCase() === fields.front.toLowerCase())
    .first();
  if (existing) return existing;
  const card = makeCard(fields);
  await db.cards.add(card);
  return card;
}

export async function dueCards(limit = 30, nowMs = Date.now()): Promise<Card[]> {
  const db = getDb();
  const all = await db.cards
    .filter((c) => !c.deletedAt && !c.suspended && c.fsrs.due <= nowMs)
    .toArray();
  // New cards last among due — reviews first.
  return all
    .sort((a, b) => a.fsrs.due - b.fsrs.due)
    .slice(0, limit);
}

export async function dueCount(nowMs = Date.now()): Promise<number> {
  const db = getDb();
  return db.cards
    .filter((c) => !c.deletedAt && !c.suspended && c.fsrs.due <= nowMs)
    .count();
}

/** Record a review and update card scheduling in one transaction. */
export async function recordReview(
  cardId: string,
  rating: ReviewRating,
  durationMs: number,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;
    const { next } = schedule(card.fsrs, rating);
    const t = now();
    await db.cards.update(cardId, { fsrs: next, updatedAt: t });
    const review = stamp<Review>({ cardId, rating: ratingToNumberSafe(rating), durationMs });
    await db.reviews.add(review);
  });
}

function ratingToNumberSafe(r: ReviewRating): number {
  return { again: 1, hard: 2, good: 3, easy: 4 }[r];
}

/** Turn an error-notebook item into a grammar/lexical card. */
export async function cardFromError(err: ErrorItem): Promise<Card> {
  const type: CardType = err.category.startsWith("lexical") ? "collocation" : "grammar";
  const card = await addCard({
    type,
    front: `Fix this: "${err.original}"`,
    back: `${err.corrected}\n\n${err.explanation}`,
    example: err.corrected,
    source: "error",
    sourceId: err.id,
  });
  if (!err.cardId) {
    await getDb().errors.update(err.id, { cardId: card.id });
  }
  return card;
}

export { newId };
