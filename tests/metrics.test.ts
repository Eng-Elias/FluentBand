import { describe, expect, it } from "vitest";
import { computeFluency, shadowingScore } from "@/core/speech/metrics";

describe("computeFluency", () => {
  it("computes wpm and pauses", () => {
    // 10 words over ~5s = ~120 wpm; one 1.2s pause in the middle
    // (word4 ends at 1.9; word5 starts at 3.1)
    const words = Array.from({ length: 10 }, (_, i) => {
      const start = i < 5 ? i * 0.4 : 1.9 + 1.2 + (i - 5) * 0.4;
      return { text: `w${i}`, start, end: start + 0.3 };
    });
    const m = computeFluency(words);
    expect(m.wordCount).toBe(10);
    expect(m.pauseCount).toBe(1);
    expect(m.longPausesPerMin).toBeGreaterThan(0);
    expect(m.wpm).toBeGreaterThan(100);
  });

  it("counts fillers", () => {
    const words = [
      { text: "um", start: 0, end: 0.3 },
      { text: "I", start: 0.5, end: 0.7 },
      { text: "uh", start: 0.8, end: 1.0 },
    ];
    const m = computeFluency(words);
    expect(m.fillerCount).toBe(2);
  });

  it("handles empty input", () => {
    const m = computeFluency([], "");
    expect(m.wordCount).toBe(0);
    expect(m.wpm).toBe(0);
  });
});

describe("shadowingScore", () => {
  it("perfect match scores 1", () => {
    const r = shadowingScore("the quick brown fox", "the quick brown fox");
    expect(r.score).toBe(1);
    expect(r.missed).toEqual([]);
  });
  it("partial match scores proportionally", () => {
    const r = shadowingScore("the quick brown fox jumps", "the quick fox jumps");
    expect(r.matched).toBe(4);
    expect(r.missed).toEqual(["brown"]);
  });
  it("is case/punctuation insensitive", () => {
    const r = shadowingScore("Hello, World!", "hello world");
    expect(r.score).toBe(1);
  });
});
