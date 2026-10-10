"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CueCard, SpeakingFeedback, SpeakingPart1 } from "@/shared/schemas/speaking";
import { useProfile, useSettings, NoProviderError } from "@/core/settings";
import { generateCueCard, generatePart1, generatePart3, loadContent, makeGenCtx } from "@/features/content";
import { gradeSpeaking, harvestCorrections, recordAttempt } from "@/features/grading";
import { buildSpeakingGradePrompt } from "@/prompts/speaking";
import { pickTopic } from "@/core/planner/topics";
import { getDb, stamp } from "@/core/db/db";
import type { ContentItem } from "@/core/db/types";
import { Recorder } from "@/core/speech/recorder";
import { makeSTT, type Transcript } from "@/core/speech/stt";
import { getTTS, playBlob, stopPlayback } from "@/core/speech/tts";
import { computeFluency, shadowingScore, type FluencyMetrics } from "@/core/speech/metrics";
import { Badge, Button, Card, Spinner, Textarea } from "@/components/ui/primitives";
import { SavedContent } from "@/components/SavedContent";

type Mode = "full" | "part23" | "drill" | "shadowing";
type Phase =
  | "pick" | "loading" | "model" | "p1" | "p2prep" | "p2talk" | "p3"
  | "drill" | "shadow" | "grading" | "feedback";

const ROUND_SECONDS = [240, 180, 120];

export default function SpeakingPage() {
  return (
    <Suspense fallback={<Card><Spinner className="mr-2" />Loading…</Card>}>
      <SpeakingInner />
    </Suspense>
  );
}

function SpeakingInner() {
  const settings = useSettings();
  const profile = useProfile();
  const params = useSearchParams();
  const initialMode = (params.get("mode") as Mode) || "full";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const [part1, setPart1] = useState<string[]>([]);
  const [cue, setCue] = useState<CueCard | null>(null);
  const [part3, setPart3] = useState<string[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [drillRound, setDrillRound] = useState(0);
  const [shadowText, setShadowText] = useState("");
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [roundMetrics, setRoundMetrics] = useState<FluencyMetrics[]>([]);
  const [shadowResult, setShadowResult] = useState<{ score: number; missed: string[] } | null>(null);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [p1Only, setP1Only] = useState(false);
  const [contentId, setContentId] = useState<string | undefined>();

  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      stopTimer();
      stopPlayback();
      try {
        void recorderRef.current?.stop();
      } catch {
        /* wasn't recording */
      }
    },
    [],
  );

  // Clicking the "Speaking" nav link while on this page → back to the list.
  useEffect(() => {
    const h = () => {
      stopTimer();
      stopPlayback();
      setPhase("pick");
    };
    window.addEventListener("fluentband:reset-page", h);
    return () => window.removeEventListener("fluentband:reset-page", h);
  }, []);

  function startTimer(secs: number, onDone?: () => void) {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(secs);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onDone?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function ttsSpeak(text: string) {
    if (!settings || ttsBusy) return;
    setTtsBusy(true);
    try {
      const tts = getTTS(settings.speech);
      const blob = await tts.speak(text, { voice: settings.speech.voice, speed: settings.speech.speed });
      await playBlob(blob);
    } catch {
      /* TTS optional — question text is always visible */
    } finally {
      setTtsBusy(false);
    }
  }

  const lastBlobRef = useRef<Blob | null>(null);
  const lastAudioIdRef = useRef<string | undefined>(undefined);

  async function startRecording() {
    const rec = new Recorder();
    recorderRef.current = rec;
    await rec.start();
    setRecording(true);
  }

  async function stopRecording(): Promise<Blob | null> {
    stopTimer();
    const rec = recorderRef.current;
    if (!rec) return null;
    setRecording(false);
    recorderRef.current = null;
    const blob = await rec.stop();
    lastBlobRef.current = blob;
    // Persist the recording so it can be included in backups (optional) and replayed.
    try {
      const item = stamp<ContentItem>({
        kind: "recording",
        topic: "",
        level: "",
        payload: null,
        audioBlob: blob,
      });
      await getDb().content.add(item);
      lastAudioIdRef.current = item.id;
    } catch {
      lastAudioIdRef.current = undefined;
    }
    return blob;
  }

  async function transcribe(blob: Blob): Promise<Transcript> {
    setProgress("Transcribing…");
    const stt = makeSTT(settings!.speech);
    await stt.ensureReady((p) =>
      setProgress(p.total ? `Downloading Whisper… ${Math.round((p.loaded / p.total) * 100)}%` : "Loading Whisper…"),
    );
    const t = await stt.transcribe(blob);
    setProgress("");
    return t;
  }

  async function startTest() {
    setPhase("loading");
    setError("");
    setTranscripts([]);
    setFeedback(null);
    try {
      const ctx = makeGenCtx(settings, profile);
      const seen = await getDb().topicsSeen.toArray();
      const topic = pickTopic(seen);
      let p1Questions: string[] = [];
      if (mode === "full" || mode === "part23") {
        const [c, p1] = await Promise.all([
          generateCueCard(topic, ctx),
          mode === "full" ? generatePart1(topic, ctx) : Promise.resolve(undefined),
        ]);
        setCue(c.data);
        setContentId(c.content.id);
        p1Questions = p1?.data.questions ?? [];
        setPart1(p1Questions);
      }
      if (mode === "full") {
        setQIdx(0);
        setPhase("p1");
        if (p1Questions[0]) void ttsSpeak(p1Questions[0]);
      } else if (mode === "part23") {
        setPhase("p2prep");
        startTimer(60, () => { setPhase("p2talk"); });
      } else if (mode === "drill") {
        setDrillRound(0);
        setRoundMetrics([]);
        setPhase("drill");
      } else {
        // shadowing — generate a short text via vocab topic sentence
        const { data: pack } = await generatePart1(topic, ctx);
        setShadowText(pack.questions.slice(0, 3).join(" "));
        setPhase("shadow");
      }
    } catch (e) {
      setError(e instanceof NoProviderError ? e.message : (e as Error).message);
      setPhase("pick");
    }
  }

  // Deep link from the library / saved-tests list: reopen a saved cue card or Part 1 set.
  const contentParam = params.get("content");
  useEffect(() => {
    if (!contentParam) return;
    let cancelled = false;
    void loadContent(contentParam).then((item) => {
      if (cancelled) return;
      if (!item) {
        setError("Saved exercise not found.");
        return;
      }
      openItem(item);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentParam]);

  function openItem(item: ContentItem) {
    setContentId(item.id);
    setError("");
    setTranscripts([]);
    setFeedback(null);
    if (item.kind === "speaking.part2.cuecard") {
      setMode("part23");
      setP1Only(false);
      setCue(item.payload as CueCard);
      setPhase("p2prep");
      startTimer(60, () => setPhase("p2talk"));
    } else if (item.kind === "speaking.part1") {
      setMode("full");
      setP1Only(true);
      setPart1((item.payload as SpeakingPart1).questions);
      setQIdx(0);
      setPhase("p1");
    } else {
      setError("Saved exercise not found.");
    }
  }

  async function answerPart1() {
    const blob = await stopRecording();
    if (!blob) return;
    const t = await transcribe(blob);
    setTranscripts((x) => [...x, t]);
    if (qIdx + 1 < part1.length) {
      setQIdx(qIdx + 1);
      void ttsSpeak(part1[qIdx + 1]);
    } else if (p1Only || !cue) {
      await finishGrade([...transcripts, t]);
    } else {
      setPhase("p2prep");
      startTimer(60, () => { setPhase("p2talk"); });
      void ttsSpeak(cue.description);
    }
  }

  async function answerPart2() {
    const blob = await stopRecording();
    if (!blob) return;
    const t = await transcribe(blob);
    setTranscripts((x) => [...x, t]);
    // generate part 3 adaptively
    setPhase("loading");
    try {
      const ctx = makeGenCtx(settings, profile);
      const p3 = await generatePart3(cue?.topic ?? "the topic", t.text, ctx);
      setPart3(p3.questions);
      setQIdx(0);
      setPhase("p3");
      void ttsSpeak(p3.questions[0]);
    } catch (e) {
      setError((e as Error).message);
      void finishGrade();
    }
  }

  async function answerPart3() {
    const blob = await stopRecording();
    if (!blob) return;
    const t = await transcribe(blob);
    const all = [...transcripts, t];
    setTranscripts(all);
    if (qIdx + 1 < part3.length) {
      setQIdx(qIdx + 1);
      void ttsSpeak(part3[qIdx + 1]);
    } else {
      await finishGrade(all);
    }
  }

  async function finishGrade(ts?: Transcript[]) {
    const all = ts ?? transcripts;
    setPhase("grading");
    try {
      const ctx = makeGenCtx(settings, profile);
      const words = all.flatMap((t) => t.words);
      const text = all.map((t) => t.text).join("\n");
      const metrics = computeFluency(words, text);
      const fb = await gradeSpeaking(
        buildSpeakingGradePrompt(text, metrics as unknown as Record<string, number>, ctx),
        ctx,
      );
      setFeedback(fb);
      const attempt = await recordAttempt({
        skill: "speaking",
        taskType: p1Only ? "part1" : `part${mode === "full" ? "123" : "23"}`,
        promptId: contentId,
        promptSnapshot: cue ? `${cue.topic}: ${cue.description}` : "speaking test",
        input: text,
        result: fb,
        band: fb.overall,
        bandRange: fb.overallRange,
        metrics: metrics as unknown as Record<string, number>,
        audioRef: lastAudioIdRef.current,
      });
      await harvestCorrections(fb.corrections, attempt.id);
      setPhase("feedback");
    } catch (e) {
      setError((e as Error).message);
      setPhase("pick");
    }
  }

  async function runDrillRound() {
    const blob = await stopRecording();
    if (!blob) return;
    const t = await transcribe(blob);
    const m = computeFluency(t.words, t.text);
    setRoundMetrics((r) => [...r, m]);
    setTranscripts((x) => [...x, t]);
    if (drillRound + 1 < 3) {
      setDrillRound(drillRound + 1);
    } else {
      await recordAttempt({
        skill: "speaking",
        taskType: "drill_432",
        promptSnapshot: "4/3/2 drill",
        input: transcripts.map((x) => x.text).join("\n---\n"),
        metrics: m as unknown as Record<string, number>,
      });
      setPhase("feedback");
    }
  }

  async function runShadow() {
    const blob = await stopRecording();
    if (!blob) return;
    const t = await transcribe(blob);
    const res = shadowingScore(shadowText, t.text);
    setShadowResult(res);
    await recordAttempt({
      skill: "speaking",
      taskType: "shadowing",
      promptSnapshot: shadowText,
      input: t.text,
      result: res,
      metrics: { score: res.score },
    });
    setPhase("feedback");
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const metricRows = (m: FluencyMetrics) => (
    <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
      <div>WPM: <b>{m.wpm.toFixed(0)}</b></div>
      <div>Pause ratio: <b>{(m.pauseRatio * 100).toFixed(0)}%</b></div>
      <div>Long pauses/min: <b>{m.longPausesPerMin.toFixed(1)}</b></div>
      <div>Fillers: <b>{m.fillerCount}</b></div>
      <div>Words: <b>{m.wordCount}</b></div>
      <div>Lexical variety: <b>{(m.typeTokenRatio * 100).toFixed(0)}%</b></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Speaking Practice</h1>
        {phase !== "pick" && phase !== "loading" && (
          <Button
            size="sm" variant="ghost"
            onClick={() => {
              stopTimer();
              stopPlayback();
              setPhase("pick");
            }}
          >
            ← Exercises
          </Button>
        )}
      </div>

      {phase === "pick" && (
        <Card>
          <div className="flex flex-wrap gap-2">
            {([["full", "Full test (P1+2+3)"], ["part23", "Part 2 + 3"], ["drill", "4/3/2 drill"], ["shadowing", "Shadowing"]] as [Mode, string][]).map(([m, l]) => (
              <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{l}</Button>
            ))}
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {mode === "full" && "11–14 min simulated test. Examiner speaks via TTS; you answer via mic; transcript is graded with computed fluency metrics."}
            {mode === "part23" && "Cue card (60s prep) then adaptive Part 3 follow-ups."}
            {mode === "drill" && "Tell the same story for 4 → 3 → 2 minutes. WPM and pause ratio across rounds show fluency gains."}
            {mode === "shadowing" && "Listen to a sentence, then repeat it. Transcript diff shows accuracy."}
          </p>
          <Button className="mt-4" onClick={startTest}>Start</Button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {phase === "pick" && (
        <SavedContent
          kinds={["speaking.part2.cuecard", "speaking.part1"]}
          title="Your speaking exercises"
          onOpen={openItem}
        />
      )}

      {(phase === "loading" || phase === "model" || phase === "grading") && (
        <Card><Spinner className="mr-2" />{progress || (phase === "grading" ? "Grading…" : "Working…")}</Card>
      )}

      {phase === "p1" && (
        <Card>
          <Badge tone="blue">Part 1</Badge>
          <p className="mt-3 text-lg font-medium">{part1[qIdx]}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={ttsBusy} onClick={() => void ttsSpeak(part1[qIdx])}>
              {ttsBusy ? "…" : "Replay question"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Question {qIdx + 1} of {part1.length} — answer in 2–4 sentences.</p>
          <RecordControls recording={recording} onStart={() => { void startRecording(); startTimer(60, () => void answerPart1()); }} onStop={answerPart1} seconds={secondsLeft} />
        </Card>
      )}

      {phase === "p2prep" && cue && (
        <Card>
          <Badge tone="blue">Part 2 — preparation ({fmt(secondsLeft)})</Badge>
          <p className="mt-3 font-medium">{cue.description}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {cue.bulletPoints.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <Textarea className="mt-3" rows={5} placeholder="Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button className="mt-3" variant="outline" onClick={() => { stopTimer(); setPhase("p2talk"); }}>Start talking now</Button>
        </Card>
      )}

      {phase === "p2talk" && cue && (
        <Card>
          <Badge tone="blue">Part 2 — speak for up to 2 minutes ({fmt(secondsLeft)})</Badge>
          <p className="mt-3 font-medium">{cue.description}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{cue.bulletPoints.map((b, i) => <li key={i}>{b}</li>)}</ul>
          {notes && <p className="mt-2 text-xs text-zinc-500">Notes: {notes}</p>}
          <RecordControls recording={recording} onStart={() => { void startRecording(); startTimer(120, () => void answerPart2()); }} onStop={answerPart2} seconds={secondsLeft} />
        </Card>
      )}

      {phase === "p3" && (
        <Card>
          <Badge tone="blue">Part 3</Badge>
          <p className="mt-3 text-lg font-medium">{part3[qIdx]}</p>
          <div className="mt-2">
            <Button size="sm" variant="ghost" disabled={ttsBusy} onClick={() => void ttsSpeak(part3[qIdx])}>
              {ttsBusy ? "…" : "Replay question"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Question {qIdx + 1} of {part3.length} — give a developed answer.</p>
          <RecordControls recording={recording} onStart={() => { void startRecording(); startTimer(90, () => void answerPart3()); }} onStop={answerPart3} seconds={secondsLeft} />
        </Card>
      )}

      {phase === "drill" && (
        <Card>
          <Badge tone="blue">4/3/2 drill — round {drillRound + 1}/3</Badge>
          <p className="mt-3">
            Tell the same personal story (e.g. a memorable trip) for{" "}
            <b>{ROUND_SECONDS[drillRound] / 60} minutes</b>. Same story each round — get faster and smoother, not shorter content.
          </p>
          {roundMetrics.length > 0 && (
            <div className="mt-3 space-y-2">
              {roundMetrics.map((m, i) => (
                <div key={i}><Badge>Round {i + 1}</Badge> {metricRows(m)}</div>
              ))}
            </div>
          )}
          <RecordControls recording={recording} onStart={() => { void startRecording(); startTimer(ROUND_SECONDS[drillRound], () => void runDrillRound()); }} onStop={runDrillRound} seconds={secondsLeft} />
        </Card>
      )}

      {phase === "shadow" && (
        <Card>
          <Badge tone="blue">Shadowing</Badge>
          <p className="mt-3 text-sm">Listen, then repeat as exactly as you can:</p>
          <p className="mt-2 rounded bg-zinc-100 p-3 text-sm dark:bg-zinc-800">{shadowText}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" disabled={ttsBusy} onClick={() => void ttsSpeak(shadowText)}>
              {ttsBusy ? "Generating…" : "Play"}
            </Button>
          </div>
          <RecordControls recording={recording} onStart={() => { void startRecording(); startTimer(60, () => void runShadow()); }} onStop={runShadow} seconds={secondsLeft} />
        </Card>
      )}

      {phase === "feedback" && (
        <Card>
          {feedback ? (
            <>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold">{feedback.overall.toFixed(1)}</div>
                <div>
                  <Badge tone="amber">estimate</Badge>
                  <div className="text-sm text-zinc-500">range {feedback.overallRange.low}–{feedback.overallRange.high}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>Fluency: <b>{feedback.fluencyCoherence}</b></div>
                <div>Lexical: <b>{feedback.lexicalResource}</b></div>
                <div>Grammar: <b>{feedback.grammaticalRange}</b></div>
                <div>Pronunciation: <b>{feedback.pronunciation}</b> <Badge tone="amber">proxy</Badge></div>
              </div>
              <p className="mt-3 text-sm">{feedback.summary}</p>
              {feedback.betterPhrases.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">Say it better</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {feedback.betterPhrases.map((b, i) => (
                      <li key={i}><span className="text-zinc-500">{b.instead_of}</span> → <span className="text-green-700 dark:text-green-400">{b.say}</span></li>
                    ))}
                  </ul>
                </>
              )}
              <h3 className="mt-4 font-semibold">Top priorities</h3>
              <ol className="mt-1 list-decimal pl-5 text-sm">{feedback.topPriorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </>
          ) : roundMetrics.length > 0 ? (
            <>
              <h3 className="font-semibold">4/3/2 results</h3>
              {roundMetrics.map((m, i) => (
                <div key={i} className="mt-2"><Badge>Round {i + 1} ({ROUND_SECONDS[i] / 60} min)</Badge><div className="mt-1">{metricRows(m)}</div></div>
              ))}
              <p className="mt-3 text-sm text-zinc-500">
                {roundMetrics.length === 3 && roundMetrics[2].wpm > roundMetrics[0].wpm
                  ? "WPM rose across rounds — fluency improving."
                  : "Compare WPM and pause ratio across rounds."}
              </p>
            </>
          ) : shadowResult ? (
            <>
              <h3 className="font-semibold">Shadowing score: {(shadowResult.score * 100).toFixed(0)}%</h3>
              {shadowResult.missed.length > 0 && (
                <p className="mt-2 text-sm">Missed words: {shadowResult.missed.join(", ")}</p>
              )}
            </>
          ) : null}
          {transcripts.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-blue-600">Your transcripts</summary>
              {transcripts.map((t, i) => <p key={i} className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t.text}</p>)}
            </details>
          )}
          <Button className="mt-4" variant="outline" onClick={() => setPhase("pick")}>Done</Button>
        </Card>
      )}

      {progress && phase !== "loading" && <p className="text-sm text-zinc-500">{progress}</p>}
      {error && phase !== "pick" && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function RecordControls({
  recording, onStart, onStop, seconds,
}: { recording: boolean; onStart: () => void; onStop: () => void; seconds: number }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      {recording ? (
        <Button variant="destructive" onClick={onStop}>■ Stop &amp; submit {seconds > 0 ? `(${seconds}s)` : ""}</Button>
      ) : (
        <Button onClick={onStart}>● Record answer</Button>
      )}
      {recording && <span className="animate-pulse text-sm text-red-600">recording…</span>}
    </div>
  );
}
