"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadingPassage, ReadingQuestion } from "@/shared/schemas/reading";
import { useProfile, useSettings, NoProviderError } from "@/core/settings";
import { generateReading, makeGenCtx } from "@/features/content";
import { recordAttempt } from "@/features/grading";
import { pickTopic } from "@/core/planner/topics";
import { getDb } from "@/core/db/db";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui/primitives";

type Phase = "idle" | "loading" | "reading" | "review";

function isCorrect(q: ReadingQuestion, a: string): boolean {
  const n = (s: string) => s.toLowerCase().trim();
  if (q.type === "mcq" || q.type === "matching") return n(a) === n(q.answer);
  if (q.type === "tfng") return n(a) === n(q.answer);
  return n(a) === n(q.answer);
}

function bandFromScore(correct: number, total: number): number {
  // Approximate Academic Reading raw → band (public conversion tables).
  const p = total ? correct / total : 0;
  if (p >= 0.9) return 8.5;
  if (p >= 0.8) return 7.5;
  if (p >= 0.7) return 7;
  if (p >= 0.6) return 6.5;
  if (p >= 0.5) return 6;
  if (p >= 0.4) return 5.5;
  if (p >= 0.3) return 5;
  return 4.5;
}

function Highlight({ text, evidence }: { text: string; evidence?: string }) {
  if (!evidence) return <>{text}</>;
  const i = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 dark:bg-yellow-800">{text.slice(i, i + evidence.length)}</mark>
      {text.slice(i + evidence.length)}
    </>
  );
}

export default function ReadingPage() {
  const settings = useSettings();
  const profile = useProfile();
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<ReadingPassage | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(18 * 60);
  const [dropped] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function start() {
    setPhase("loading");
    setError("");
    setAnswers({});
    try {
      const ctx = makeGenCtx(settings, profile);
      const seen = await getDb().topicsSeen.toArray();
      const { data } = await generateReading(pickTopic(seen), ctx);
      setData(data);
      setSecondsLeft(18 * 60);
      setPhase("reading");
      timerRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    } catch (e) {
      setError(e instanceof NoProviderError ? e.message : (e as Error).message);
      setPhase("idle");
    }
  }

  async function submit() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!data) return;
    const correct = data.questions.filter((q, i) => isCorrect(q, answers[i] ?? "")).length;
    const band = bandFromScore(correct, data.questions.length);
    await recordAttempt({
      skill: "reading",
      taskType: "academic_passage",
      promptSnapshot: `${data.title} (${data.topic})`,
      input: JSON.stringify(answers),
      result: { correct, total: data.questions.length },
      band,
      durationMs: (18 * 60 - secondsLeft) * 1000,
    });
    setPhase("review");
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const score = data
    ? data.questions.filter((q, i) => isCorrect(q, answers[i] ?? "")).length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reading Practice</h1>
        {phase === "reading" && <Badge tone={secondsLeft < 120 ? "red" : "default"}>{fmt(secondsLeft)}</Badge>}
      </div>

      {phase === "idle" && (
        <Card>
          <p className="text-sm text-zinc-500">
            Generates a fresh academic passage (700–900 words) with 10–13 IELTS
            questions. Evidence quotes are verified programmatically; questions
            that fail are dropped.
          </p>
          <Button className="mt-4" onClick={start}>Generate passage</Button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {phase === "loading" && <Card><Spinner className="mr-2" />Writing your passage…</Card>}

      {(phase === "reading" || phase === "review") && data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="max-h-[75vh] overflow-auto">
            <h2 className="text-lg font-semibold">{data.title}</h2>
            <p className="text-xs text-zinc-500">{data.topic} · {data.wordCount} words</p>
            <div className="mt-3 space-y-3 text-sm leading-6">
              {data.passage.split(/\n+/).map((p, i) => (
                <p key={i}>
                  {phase === "review" && i === 0 && data.questions[0]
                    ? <Highlight text={p} evidence={data.questions[0].evidence} />
                    : p}
                </p>
              ))}
            </div>
            {phase === "review" && data.targetChunks.length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                Target chunks: {data.targetChunks.join(" · ")}
              </p>
            )}
          </Card>

          <Card className="max-h-[75vh] overflow-auto">
            {phase === "review" && (
              <div className="mb-3">
                <Badge tone="green">{score}/{data.questions.length}</Badge>{" "}
                <Badge tone="amber">≈ band {bandFromScore(score, data.questions.length)}</Badge>
                {dropped > 0 && <Badge tone="red">{dropped} dropped</Badge>}
              </div>
            )}
            <ol className="space-y-4">
              {data.questions.map((q, i) => {
                const a = answers[i] ?? "";
                const correct = isCorrect(q, a);
                return (
                  <li key={i} className="text-sm">
                    <div className="font-medium">
                      {i + 1}. {q.question}
                      <Badge className="ml-2">{q.type}</Badge>
                    </div>
                    {q.type === "mcq" || q.type === "matching" ? (
                      <div className="mt-1 space-y-1">
                        {q.options.map((o, j) => (
                          <label key={j} className="flex items-center gap-2">
                            <input
                              type="radio" name={`q${i}`} value={o}
                              checked={a === o} disabled={phase === "review"}
                              onChange={() => setAnswers({ ...answers, [i]: o })}
                            />
                            {o}
                          </label>
                        ))}
                      </div>
                    ) : q.type === "tfng" ? (
                      <div className="mt-1 flex gap-3">
                        {["TRUE", "FALSE", "NOT_GIVEN"].map((o) => (
                          <label key={o} className="flex items-center gap-1">
                            <input
                              type="radio" name={`q${i}`} value={o}
                              checked={a === o} disabled={phase === "review"}
                              onChange={() => setAnswers({ ...answers, [i]: o })}
                            />
                            {o.replace("_", " ")}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Input
                        className="mt-1" value={a} disabled={phase === "review"}
                        onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                        placeholder="Your answer"
                      />
                    )}
                    {phase === "review" && (
                      <div className="mt-1 text-xs">
                        {correct ? (
                          <Badge tone="green">correct</Badge>
                        ) : (
                          <>
                            <Badge tone="red">incorrect</Badge>{" "}
                            <span className="text-zinc-500">answer: {q.answer}</span>
                          </>
                        )}
                        <div className="mt-1 text-zinc-500">Evidence: “{q.evidence}”</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {phase === "reading" ? (
              <Button className="mt-4" onClick={submit}>Submit answers</Button>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => { setPhase("idle"); setData(null); }}>
                New passage
              </Button>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
