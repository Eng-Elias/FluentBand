import { describe, expect, it } from "vitest";
import { isDue, newFsrsState, schedule } from "@/core/srs/fsrs";

describe("fsrs wrapper", () => {
  it("new cards are due immediately", () => {
    expect(isDue(newFsrsState())).toBe(true);
  });

  it("'good' schedules into the future", () => {
    const now = Date.now();
    const { next } = schedule(newFsrsState(now), "good", now);
    expect(next.due).toBeGreaterThan(now);
    expect(next.reps).toBe(1);
  });

  it("'easy' schedules further out than 'hard'", () => {
    const now = Date.now();
    const easy = schedule(newFsrsState(now), "easy", now).next;
    const hard = schedule(newFsrsState(now), "hard", now).next;
    expect(easy.due).toBeGreaterThan(hard.due);
  });

  it("'again' reschedules quickly", () => {
    const now = Date.now();
    const { next } = schedule(newFsrsState(now), "again", now);
    // again → relearning, due in minutes not days
    expect(next.due - now).toBeLessThan(24 * 3600 * 1000);
  });
});
