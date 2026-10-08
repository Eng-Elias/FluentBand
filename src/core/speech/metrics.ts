/** Fluency metrics computed from a transcript with word timestamps. */

export interface TimedWord {
  text: string;
  start: number; // seconds
  end: number;
}

export interface FluencyMetrics {
  durationSec: number;
  wordCount: number;
  wpm: number;
  pauseCount: number; // pauses > 0.5s
  longPausesPerMin: number; // pauses > 1s per minute
  meanPauseSec: number;
  pauseRatio: number; // pause time / total time
  fillerCount: number;
  fillersPerMin: number;
  typeTokenRatio: number; // lexical variety
}

const FILLERS = new Set([
  "um", "uh", "er", "ah", "eh", "hmm", "mm", "erm", "uhh", "umm",
]);

const PAUSE_THRESHOLD = 0.5;
const LONG_PAUSE_THRESHOLD = 1.0;

export function computeFluency(
  words: TimedWord[],
  transcriptText?: string,
): FluencyMetrics {
  const tokens = (
    transcriptText ?? words.map((w) => w.text).join(" ")
  )
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const wordCount = tokens.length;
  let durationSec = 0;
  let pauseCount = 0;
  let longPauses = 0;
  let pauseTotal = 0;

  if (words.length >= 2) {
    durationSec = Math.max(0, words[words.length - 1].end - words[0].start);
    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start - words[i - 1].end;
      if (gap > PAUSE_THRESHOLD) {
        pauseCount++;
        pauseTotal += gap;
        if (gap > LONG_PAUSE_THRESHOLD) longPauses++;
      }
    }
  } else if (words.length === 1) {
    durationSec = Math.max(0.1, words[0].end - words[0].start);
  }

  const fillerCount = tokens.filter((t) => FILLERS.has(t)).length;
  const unique = new Set(tokens).size;
  const minutes = durationSec / 60;

  return {
    durationSec,
    wordCount,
    wpm: minutes > 0 ? wordCount / minutes : 0,
    pauseCount,
    longPausesPerMin: minutes > 0 ? longPauses / minutes : 0,
    meanPauseSec: pauseCount > 0 ? pauseTotal / pauseCount : 0,
    pauseRatio: durationSec > 0 ? pauseTotal / durationSec : 0,
    fillerCount,
    fillersPerMin: minutes > 0 ? fillerCount / minutes : 0,
    typeTokenRatio: wordCount > 0 ? unique / wordCount : 0,
  };
}

/** Simple word-level diff for shadowing: % of reference words matched in order. */
export function shadowingScore(reference: string, attempt: string): {
  score: number;
  matched: number;
  total: number;
  missed: string[];
} {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, "").split(/\s+/).filter(Boolean);
  const ref = norm(reference);
  const att = norm(attempt);
  // LCS alignment
  const m = ref.length;
  const n = att.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = ref[i] === att[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = dp[0][0];
  // collect missed ref words
  const missed: string[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (ref[i] === att[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { missed.push(ref[i]); i++; }
    else j++;
  }
  while (i < m) missed.push(ref[i++]);
  return {
    score: m > 0 ? matched / m : 0,
    matched,
    total: m,
    missed,
  };
}
