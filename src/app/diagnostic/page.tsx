"use client";

import { useState } from "react";
import type { ReadingPassage } from "@/shared/schemas/reading";
import type { WritingFeedback } from "@/shared/schemas/writing";
import { useProfile, useSettings, NoProviderError } from "@/core/settings";
import { generateReading, generateTask2, makeGenCtx } from "@/features/content";
import { gradeWriting, harvestCorrections, recordAttempt } from "@/features/grading";
import { buildTask2GradePrompt } from "@/prompts/writing";
import { getDb, SINGLETON_PROFILE_ID } from "@/core/db/db";
import { pickTopic } from "@/core/planner/topics";
import { Badge, Button, Card, Input, Spinner, Textarea } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";

type Phase = "intro" | "working" | "reading" | "writing" | "grading" | "done";

const SELF_LEVELS = [4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

export default function DiagnosticPage() {
  const settings = useSettings();
  const profile = useProfile();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<ReadingPassage | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [essayPrompt, setEssayPrompt] = useState("");
  const [essay, setEssay] = useState("");
  const [selfLevel, setSelfLevel] = useState(5.5);

  async function runWithLlm() {
    setPhase("working");
    setError("");
    try {
      const ctx = makeGenCtx(settings, profile);
      const seen = await getDb().topicsSeen.toArray();
      const topic = pickTopic(seen);
      const { data } = await generateReading(topic, ctx);
      // short version: first 8 questions
      setReading({ ...data, questions: data.questions.slice(0, 8) });
      setPhase("reading");
    } catch (e) {
      setError(e instanceof NoProviderError ? e.message : (e as Error).message);
      setPhase("intro");
    }
  }

  async function readingDone() {
    setPhase("working");
    if (!reading) return;
    const correct = reading.questions.filter(
      (q, i) => (answers[i] ?? "").trim().toLowerCase() === q.answer.trim().toLowerCase(),
    ).length;
    const readingBand = correct / reading.questions.length >= 0.75 ? 7 : correct / reading.questions.length >= 0.5 ? 6 : correct / reading.questions.length >= 0.35 ? 5.5 : 5;
    await recordAttempt({
      skill: "reading",
      taskType: "diagnostic",
      promptSnapshot: reading.title,
      input: JSON.stringify(answers),
      result: { correct, total: reading.questions.length },
      band: readingBand,
    });
    try {
      const ctx = makeGenCtx(settings, profile);
      const { data } = await generateTask2(reading.topic, ctx);
      setEssayPrompt(data.prompt);
      setPhase("writing");
    } catch (e) {
      setError((e as Error).message);
      setPhase("intro");
    }
  }

  async function writingDone() {
    setPhase("grading");
    try {
      const ctx = makeGenCtx(settings, profile);
      const fb: WritingFeedback = await gradeWriting(
        "writing.feedback",
        buildTask2GradePrompt(essayPrompt, "opinion", essay, ctx),
        ctx,
      );
      const attempt = await recordAttempt({
        skill: "writing",
        taskType: "diagnostic_task2",
        promptSnapshot: essayPrompt,
        input: essay,
        result: fb,
        band: fb.overall,
        bandRange: fb.overallRange,
      });
      await harvestCorrections(fb.corrections, attempt.id);
      // update profile
      const db = getDb();
      const attempts = await db.attempts.orderBy("createdAt").toArray();
      const lastBySkill = (s: string) =>
        [...attempts].reverse().find((a) => a.skill === s && a.band != null)?.band;
      await db.profile.update(SINGLETON_PROFILE_ID, {
        skillLevels: {
          listening: lastBySkill("listening") ?? selfLevel,
          reading: lastBySkill("reading") ?? selfLevel,
          writing: lastBySkill("writing") ?? selfLevel,
          speaking: lastBySkill("speaking") ?? selfLevel,
        },
        weakAreas: fb.topPriorities.slice(0, 4),
        onboardingDone: true,
        updatedAt: Date.now(),
      });
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("writing");
    }
  }

  async function selfPlace() {
    await getDb().profile.update(SINGLETON_PROFILE_ID, {
      skillLevels: { listening: selfLevel, reading: selfLevel, writing: selfLevel, speaking: selfLevel },
      onboardingDone: true,
      updatedAt: Date.now(),
    });
    router.push("/today");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quick Diagnostic</h1>

      {phase === "intro" && (
        <Card>
          <p className="text-sm text-zinc-500">
            A short placement: a trimmed reading set (8 questions) + a short Task 2
            essay. ~15 minutes. Produces your starting band estimate per skill.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={runWithLlm}>Start diagnostic (uses LLM)</Button>
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="text-sm font-medium">Or self-select your level:</p>
            <div className="mt-2 flex items-center gap-2">
              {SELF_LEVELS.map((l) => (
                <Button key={l} size="sm" variant={selfLevel === l ? "default" : "outline"} onClick={() => setSelfLevel(l)}>
                  {l}
                </Button>
              ))}
            </div>
            <Button className="mt-3" variant="secondary" onClick={selfPlace}>
              I&apos;m around band {selfLevel} — skip test
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {phase === "working" && <Card><Spinner className="mr-2" />Generating…</Card>}

      {phase === "reading" && reading && (
        <Card className="max-h-[75vh] overflow-auto">
          <h2 className="font-semibold">{reading.title}</h2>
          <div className="mt-2 space-y-3 text-sm">
            {reading.passage.split(/\n+/).slice(0, 4).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <ol className="mt-4 space-y-3">
            {reading.questions.map((q, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium">{i + 1}. {q.question}</div>
                {q.type === "mcq" || q.type === "matching" ? (
                  <div className="mt-1 space-y-1">
                    {q.options.map((o, j) => (
                      <label key={j} className="flex items-center gap-2">
                        <input type="radio" name={`dq${i}`} value={o} checked={answers[i] === o}
                          onChange={() => setAnswers({ ...answers, [i]: o })} />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : q.type === "tfng" ? (
                  <div className="mt-1 flex gap-3">
                    {["TRUE", "FALSE", "NOT_GIVEN"].map((o) => (
                      <label key={o} className="flex items-center gap-1">
                        <input type="radio" name={`dq${i}`} value={o} checked={answers[i] === o}
                          onChange={() => setAnswers({ ...answers, [i]: o })} />
                        {o.replace("_", " ")}
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input className="mt-1" value={answers[i] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                )}
              </li>
            ))}
          </ol>
          <Button className="mt-4" onClick={readingDone}>Continue to writing</Button>
        </Card>
      )}

      {(phase === "writing" || phase === "grading") && (
        <Card>
          <Badge tone="blue">Task 2 (diagnostic)</Badge>
          <p className="mt-3 font-medium whitespace-pre-wrap">{essayPrompt}</p>
          <p className="mt-1 text-xs text-zinc-500">Write ~200+ words for a useful estimate.</p>
          <Textarea className="mt-3" rows={12} value={essay} onChange={(e) => setEssay(e.target.value)} disabled={phase === "grading"} />
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={writingDone} disabled={essay.trim().split(/\s+/).length < 50 || phase === "grading"}>
              {phase === "grading" ? <Spinner className="mr-2" /> : null}Submit
            </Button>
            <span className="text-sm text-zinc-500">{essay.trim() ? essay.trim().split(/\s+/).length : 0} words</span>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {phase === "done" && (
        <Card>
          <p className="font-medium">Diagnostic complete — your profile is set.</p>
          <Button className="mt-3" onClick={() => router.push("/today")}>Go to Today&apos;s session</Button>
        </Card>
      )}
    </div>
  );
}
