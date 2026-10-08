import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade, Rating, type RecordLogItem } from "ts-fsrs";
import type { FsrsState } from "../db/types";

const scheduler = fsrs();

export function newFsrsState(nowMs = Date.now()): FsrsState {
  const c = createEmptyCard(new Date(nowMs));
  return toState(c);
}

export function toState(c: FsrsCard): FsrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review?.getTime(),
  };
}

export function fromState(s: FsrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
    learning_steps: 0,
  } as FsrsCard;
}

export type ReviewRating = "again" | "hard" | "good" | "easy";

const RATING_MAP: Record<ReviewRating, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function ratingToNumber(r: ReviewRating): number {
  return RATING_MAP[r] as number;
}

/** Schedule a review: returns next state + the raw log item. */
export function schedule(
  state: FsrsState,
  rating: ReviewRating,
  nowMs = Date.now(),
): { next: FsrsState; log: RecordLogItem } {
  const card = fromState(state);
  const res = scheduler.next(card, new Date(nowMs), RATING_MAP[rating] as Grade);
  return { next: toState(res.card), log: res };
}

export function isDue(state: FsrsState, nowMs = Date.now()): boolean {
  return state.due <= nowMs;
}
