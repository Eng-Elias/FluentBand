"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ChartData, Task2Prompt, WritingFeedback } from "@/shared/schemas/writing";
import { useProfile, useSettings, NoProviderError } from "@/core/settings";
import { generateTask1, generateTask2, makeGenCtx } from "@/features/content";
import { gradeWriting, harvestCorrections, recordAttempt } from "@/features/grading";
import { buildTask1GradePrompt, buildTask2GradePrompt } from "@/prompts/writing";
import { pickTopic } from "@/core/planner/topics";
import { getDb } from "@/core/db/db";
import { ChartSVG } from "@/components/ChartSVG";
import { Badge, Button, Card, Spinner, Textarea } from "@/components/ui/primitives";

type TaskKind = "t1" | "t2";
type Phase = "pick" | "loading" | "writing" | "grading" | "feedback";

export default function WritingPage() {
  return (
    <Suspense fallback={<Card><Spinner className="mr-2" />Loading…</Card>}>
      <WritingInner />
    </Suspense>
  );
}

function WritingInner() {
  const settings = useSettings();
  const profile = useProfile();
  const params = useSearchParams();
  const [task, setTask] = useState<TaskKind>(params.get("task") === "1" ? "t1" : "t2");
  const [phase, setPhase] = useState<Phase>("pick");
  const [t1, setT1] = useState<ChartData | null>(null);
  const [t2, setT2] = useState<Task2Prompt | null>(null);
  const [essay, setEssay] = useState("");
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [attempts, setAttempts] = useState<{ text: string; band?: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wordCount = essay.trim() ? essay.trim().split(/\s+/).length : 0;
  const minWords = task === "t1" ? 150 : 250;
  const timeLimit = task === "t1" ? 20 * 60 : 40 * 60;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    setPhase("loading");
    setError("");
    setFeedback(null);
    setEssay("");
    setAttempts([]);
    try {
      const ctx = makeGenCtx(settings, profile);
      const seen = await getDb().topicsSeen.toArray();
      const topic = pickTopic(seen);
      if (task === "t1") {
        const { data } = await generateTask1(topic, ctx);
        setT1(data);
      } else {
        const { data } = await generateTask2(topic, ctx);
        setT2(data);
      }
      setSecondsLeft(timeLimit);
      setPhase("writing");
      timerRef.current = setInterval(
        () => setSecondsLeft((s) => Math.max(0, s - 1)),
        1000,
      );
    } catch (e) {
      setError(e instanceof NoProviderError ? e.message : (e as Error).message);
      setPhase("pick");
    }
  }

  async function submit() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wordCount < 30) {
      setError(`Too short — aim for at least ${minWords} words.`);
      return;
    }
    setPhase("grading");
    setError("");
    try {
      const ctx = makeGenCtx(settings, profile);
      const messages =
        task === "t1"
          ? buildTask1GradePrompt(t1!.description, essay, ctx)
          : buildTask2GradePrompt(t2!.prompt, t2!.essayType, essay, ctx);
      const fb = await gradeWriting("writing.feedback", messages, ctx);
      setFeedback(fb);
      const attempt = await recordAttempt({
        skill: "writing",
        taskType: task === "t1" ? "task1" : "task2",
        promptSnapshot: task === "t1" ? t1!.description : t2!.prompt,
        input: essay,
        result: fb,
        band: fb.overall,
        bandRange: fb.overallRange,
        durationMs: (timeLimit - secondsLeft) * 1000,
      });
      await harvestCorrections(fb.corrections, attempt.id);
      setAttempts((a) => [...a, { text: essay, band: fb.overall }]);
      setPhase("feedback");
    } catch (e) {
      setError((e as Error).message);
      setPhase("writing");
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Writing Practice</h1>

      {phase === "pick" && (
        <Card>
          <div className="flex gap-3">
            <Button variant={task === "t1" ? "default" : "outline"} onClick={() => setTask("t1")}>
              Task 1 — Academic report
            </Button>
            <Button variant={task === "t2" ? "default" : "outline"} onClick={() => setTask("t2")}>
              Task 2 — Essay
            </Button>
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {task === "t1"
              ? "Describe a generated chart in ≥150 words (20 min recommended)."
              : "Write a ≥250-word essay (40 min recommended). Grading uses the official 4-criteria rubric and returns a band range."}
          </p>
          <Button className="mt-4" onClick={start}>Generate task</Button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {phase === "loading" && (
        <Card><Spinner className="mr-2" /> Generating task…</Card>
      )}

      {(phase === "writing" || phase === "grading" || phase === "feedback") && (
        <>
          <Card>
            {task === "t1" && t1 && (
              <>
                <p className="font-medium">{t1.description}</p>
                <p className="mt-1 text-xs text-zinc-500">Write at least 150 words. ~20 minutes.</p>
                <div className="mt-3"><ChartSVG chart={t1} /></div>
              </>
            )}
            {task === "t2" && t2 && (
              <>
                <Badge tone="blue">{t2.essayType.replace(/_/g, " ")}</Badge>
                <Badge className="ml-2">{t2.topic}</Badge>
                <p className="mt-3 font-medium whitespace-pre-wrap">{t2.prompt}</p>
                <p className="mt-1 text-xs text-zinc-500">Write at least 250 words. ~40 minutes.</p>
              </>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{wordCount} / {minWords} words</span>
              <span className={secondsLeft < 120 ? "text-red-600 font-medium" : ""}>
                {fmt(secondsLeft)}
              </span>
            </div>
            <Textarea
              rows={14}
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              placeholder="Write your answer here…"
              disabled={phase !== "writing"}
            />
            {phase === "writing" && (
              <div className="mt-3 flex gap-2">
                <Button onClick={submit}>Submit for grading</Button>
                <Button variant="ghost" onClick={() => { setPhase("pick"); if (timerRef.current) clearInterval(timerRef.current); }}>
                  Abandon
                </Button>
              </div>
            )}
            {phase === "grading" && <p className="mt-3 text-sm"><Spinner className="mr-2" />Grading (two samples for stability)…</p>}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </Card>

          {phase === "feedback" && feedback && (
            <Card>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold">{feedback.overall.toFixed(1)}</div>
                <div>
                  <Badge tone="amber">estimate</Badge>
                  <div className="text-sm text-zinc-500">
                    range {feedback.overallRange.low}–{feedback.overallRange.high}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>Task: <b>{feedback.taskAchievement}</b></div>
                <div>Coherence: <b>{feedback.coherenceCohesion}</b></div>
                <div>Lexical: <b>{feedback.lexicalResource}</b></div>
                <div>Grammar: <b>{feedback.grammaticalRange}</b></div>
              </div>
              <p className="mt-3 text-sm">{feedback.summary}</p>

              <h3 className="mt-4 font-semibold">Corrections</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {feedback.corrections.map((c, i) => (
                  <li key={i} className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
                    <Badge tone="red">{c.category}</Badge>
                    <div className="mt-1"><s className="text-red-600">{c.original}</s></div>
                    <div className="text-green-700 dark:text-green-400">{c.corrected}</div>
                    <div className="text-xs text-zinc-500">{c.explanation}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-500">
                Corrections were added to your Error Notebook and became SRS cards.
              </p>

              {feedback.upgradedSentences.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">Sentence upgrades</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {feedback.upgradedSentences.map((u, i) => (
                      <li key={i}>
                        <span className="text-zinc-500">{u.original}</span> →{" "}
                        <span className="text-green-700 dark:text-green-400">{u.upgraded}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className="mt-4 font-semibold">Top priorities</h3>
              <ol className="mt-1 list-decimal pl-5 text-sm">
                {feedback.topPriorities.map((p, i) => <li key={i}>{p}</li>)}
              </ol>

              {attempts.length > 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Attempts this task: {attempts.map((a, i) => `#${i + 1}: ${a.band ?? "?"} (${a.text.split(/\s+/).length}w)`).join(" · ")}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <Button onClick={() => { setPhase("writing"); setSecondsLeft(timeLimit); }}>
                  Revise &amp; resubmit
                </Button>
                <Button variant="outline" onClick={() => setPhase("pick")}>New task</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
