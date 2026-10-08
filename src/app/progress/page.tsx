"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/core/db/db";
import { useProfile } from "@/core/settings";
import { Card, Badge } from "@/components/ui/primitives";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const SKILL_COLORS: Record<string, string> = {
  listening: "#2563eb",
  reading: "#16a34a",
  writing: "#dc2626",
  speaking: "#7c3aed",
};

export default function ProgressPage() {
  const profile = useProfile();
  const attempts = useLiveQuery(
    () => getDb().attempts.orderBy("createdAt").toArray(),
    [],
  );
  const errors = useLiveQuery(
    () => getDb().errors.filter((e) => !e.deletedAt).toArray(),
    [],
  );
  const sessions = useLiveQuery(
    () => getDb().sessions.orderBy("date").toArray(),
    [],
  );

  const chartData = (() => {
    const rows = new Map<string, Record<string, number | string>>();
    for (const a of attempts ?? []) {
      if (a.band == null || a.deletedAt) continue;
      const day = new Date(a.createdAt).toISOString().slice(0, 10);
      const row = rows.get(day) ?? { date: day };
      row[a.skill] = a.band;
      rows.set(day, row);
    }
    return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  })();

  const errorCounts = (() => {
    const m = new Map<string, number>();
    for (const e of errors ?? []) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const maxErr = Math.max(1, ...errorCounts.map(([, n]) => n));

  const totalMinutes = (sessions ?? []).reduce((a, s) => a + s.minutes, 0);
  const wpmTrend = (attempts ?? [])
    .filter((a) => a.skill === "speaking" && a.metrics?.wpm)
    .map((a) => ({ date: new Date(a.createdAt).toISOString().slice(0, 10), wpm: a.metrics!.wpm }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Progress</h1>

      {profile && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.entries(profile.skillLevels) as [string, number][]).map(([k, v]) => (
            <Card key={k} className="text-center">
              <div className="text-xs uppercase text-zinc-500">{k}</div>
              <div className="text-2xl font-bold">{v.toFixed(1)}</div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="font-semibold">Band trend (estimates)</h2>
        {chartData.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No graded attempts yet.</p>
        ) : (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[3, 9]} fontSize={11} />
                <Tooltip />
                <Legend />
                {Object.keys(SKILL_COLORS).map((s) => (
                  <Line key={s} dataKey={s} stroke={SKILL_COLORS[s]} dot={false} connectNulls strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Weak areas</h2>
          {errorCounts.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No errors recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {errorCounts.slice(0, 10).map(([cat, n]) => (
                <div key={cat} className="text-sm">
                  <div className="flex justify-between">
                    <span>{cat}</span><span>{n}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                    <div className="h-2 rounded bg-red-500" style={{ width: `${(n / maxErr) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Fluency trend (WPM)</h2>
          {wpmTrend.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No speaking attempts yet.</p>
          ) : (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={wpmTrend}>
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line dataKey="wpm" stroke="#2563eb" dot strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-4 text-sm text-zinc-500">
            Total planned study time: <Badge>{totalMinutes} min</Badge>
          </p>
        </Card>
      </div>
    </div>
  );
}
