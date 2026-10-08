"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, now, stamp, SINGLETON_SETTINGS_ID } from "@/core/db/db";
import type { Session, SessionBlock } from "@/core/db/types";
import { buildDailyPlan } from "@/core/planner/planner";
import { dueCount } from "@/core/srs/cards";
import { weakAreasFromErrors } from "@/core/planner/weak";
import { ensureSingletons, useProfile } from "@/core/settings";
import { Badge, Button, Card, Progress } from "@/components/ui/primitives";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TodayPage() {
  const profile = useProfile();
  const [session, setSession] = useState<Session | null>(null);
  const [topic, setTopic] = useState("");
  const [ready, setReady] = useState(false);

  const recentSessions = useLiveQuery(
    () => getDb().sessions.orderBy("date").reverse().limit(30).toArray(),
    [],
  );

  useEffect(() => {
    (async () => {
      const { settings: s, profile: p } = await ensureSingletons();
      const db = getDb();
      const existing = await db.sessions.where("date").equals(todayKey()).first();
      if (existing) {
        setSession(existing);
        setTopic(existing.plan.find((b) => b.topic)?.topic ?? "");
        setReady(true);
        return;
      }
      const due = await dueCount();
      const errs = await db.errors.toArray();
      const topics = await db.topicsSeen.toArray();
      const firstSession = await db.sessions.orderBy("date").first();
      const dayIndex = firstSession
        ? Math.floor((now() - new Date(firstSession.date).getTime()) / 86400000)
        : 0;
      const { blocks, topic } = buildDailyPlan({
        dueCardCount: due,
        weakAreas: weakAreasFromErrors(errs),
        skillLevels: p.skillLevels,
        targetBand: s.targetBand,
        topicsSeen: topics,
        dayIndex,
        cheaperMode: s.cheaperMode,
      });
      const session = stamp<Session>({
        date: todayKey(),
        plan: blocks,
        completedBlocks: [],
        minutes: blocks.reduce((a, b) => a + b.minutes, 0),
      });
      await db.sessions.add(session);
      await db.settings.update(SINGLETON_SETTINGS_ID, {
        sessionsSinceExport: (s.sessionsSinceExport ?? 0) + 1,
      });
      setSession(session);
      setTopic(topic);
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  async function toggleBlock(blockId: string) {
    if (!session) return;
    const done = session.completedBlocks.includes(blockId)
      ? session.completedBlocks.filter((b) => b !== blockId)
      : [...session.completedBlocks, blockId];
    await getDb().sessions.update(session.id, { completedBlocks: done, updatedAt: now() });
    setSession({ ...session, completedBlocks: done });
  }

  // streak: consecutive days ending today/yesterday with a session
  const streak = (() => {
    if (!recentSessions?.length) return 0;
    const days = new Set(recentSessions.map((s) => s.date));
    let n = 0;
    const d = new Date();
    if (!days.has(todayKey())) d.setDate(d.getDate() - 1); // today may be unfinished
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!days.has(key)) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  })();

  const doneCount = session?.completedBlocks.length ?? 0;
  const total = session?.plan.length ?? 0;
  const totalMin = session?.plan
    .filter((b) => session.completedBlocks.includes(b.id))
    .reduce((a, b) => a + b.minutes, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Today&apos;s Session</h1>
        <div className="flex gap-2">
          <Badge tone="blue">streak {streak}d</Badge>
          {topic && <Badge>theme: {topic}</Badge>}
        </div>
      </div>

      {!ready && <Card>Loading…</Card>}

      {ready && session && (
        <>
          <Card>
            <div className="flex items-center justify-between text-sm">
              <span>{doneCount}/{total} blocks · {totalMin} min done</span>
              <span>{session.minutes} min planned</span>
            </div>
            <Progress className="mt-2" value={total ? (doneCount / total) * 100 : 0} />
            {profile && !profile.onboardingDone && (
              <p className="mt-2 text-sm text-amber-600">
                Tip: take the <Link href="/diagnostic" className="underline">quick diagnostic</Link> to calibrate levels.
              </p>
            )}
          </Card>

          <div className="space-y-3">
            {session.plan.map((b: SessionBlock, i: number) => {
              const done = session.completedBlocks.includes(b.id);
              return (
                <Card key={b.id} className={done ? "opacity-60" : ""}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-zinc-400">{i + 1}.</span>{" "}
                      <span className="font-medium">{b.label}</span>{" "}
                      <Badge>{b.minutes} min</Badge>
                      {b.topic && <Badge tone="blue" className="ml-1">{b.topic}</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={b.payload?.topic ? `${b.route}${b.route.includes("?") ? "&" : "?"}topic=${encodeURIComponent(b.payload.topic)}` : b.route}>
                        <Button size="sm" variant="outline">Go</Button>
                      </Link>
                      <Button size="sm" variant={done ? "secondary" : "default"} onClick={() => toggleBlock(b.id)}>
                        {done ? "Done ✓" : "Mark done"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {ready && !session && <Card>Could not build a session. Check Settings.</Card>}
    </div>
  );
}
