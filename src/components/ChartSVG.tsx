"use client";

import type { ChartData } from "@/shared/schemas/writing";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export function ChartSVG({ chart }: { chart: ChartData }) {
  if (chart.chartType === "table") return <TableView chart={chart} />;
  if (chart.chartType === "pie") return <PieView chart={chart} />;
  return <LineBarView chart={chart} />;
}

function LineBarView({ chart }: { chart: ChartData }) {
  const W = 640;
  const H = 320;
  const PAD = 48;
  const labels = chart.xLabels ?? chart.series[0]?.values.map((_, i) => String(i + 1)) ?? [];
  const allVals = chart.series.flatMap((s) => s.values);
  const max = Math.max(...allVals, 1) * 1.1;
  const n = labels.length || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, n - (chart.chartType === "line" ? 1 : 0));
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" strokeWidth={1} />
        {labels.map((l, i) => (
          <text key={i} x={chart.chartType === "bar" ? PAD + (i + 0.5) * ((W - 2 * PAD) / n) : x(i)} y={H - PAD + 16}
            textAnchor="middle" fontSize={10} fill="currentColor">{l}</text>
        ))}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD} y1={y(max * f / 1.1)} x2={W - PAD} y2={y(max * f / 1.1)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={PAD - 6} y={y(max * f / 1.1) + 3} textAnchor="end" fontSize={9} fill="currentColor">
              {Math.round(max * f / 1.1)}
            </text>
          </g>
        ))}
        {chart.chartType === "line"
          ? chart.series.map((s, si) => (
              <g key={si}>
                <polyline
                  fill="none"
                  stroke={s.color ?? COLORS[si % COLORS.length]}
                  strokeWidth={2}
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color ?? COLORS[si % COLORS.length]} />
                ))}
              </g>
            ))
          : chart.series.map((s, si) => {
              const bw = (W - 2 * PAD) / n / chart.series.length - 4;
              return s.values.map((v, i) => (
                <rect
                  key={`${si}-${i}`}
                  x={PAD + (i * (W - 2 * PAD)) / n + si * (bw + 4) + 2}
                  y={y(v)}
                  width={bw}
                  height={H - PAD - y(v)}
                  fill={s.color ?? COLORS[si % COLORS.length]}
                />
              ));
            })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {chart.series.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color ?? COLORS[i % COLORS.length] }} />
            {s.name}
          </span>
        ))}
        {chart.unit && <span className="text-zinc-500">({chart.unit})</span>}
      </div>
    </div>
  );
}

function PieView({ chart }: { chart: ChartData }) {
  const vals = chart.series[0]?.values ?? [];
  const labels = chart.xLabels ?? chart.series.map((s) => s.name);
  // Support either series-as-slices or values-as-slices
  const slices = chart.series.length > 1 && !chart.xLabels
    ? chart.series.map((s) => ({ name: s.name, v: s.values[0] ?? 0 }))
    : vals.map((v, i) => ({ name: labels[i] ?? `Slice ${i + 1}`, v }));
  const total = slices.reduce((a, s) => a + s.v, 0) || 1;
  const R = 110;
  const C = 140;
  // Precompute angle ranges purely (no mutation during render).
  const ranges = slices.reduce<{ a0: number; a1: number; frac: number }[]>(
    (acc, s) => {
      const a0 = acc.length ? acc[acc.length - 1].a1 : -Math.PI / 2;
      const frac = s.v / total;
      acc.push({ a0, a1: a0 + frac * Math.PI * 2, frac });
      return acc;
    },
    [],
  );

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 280 240" className="w-64">
        {slices.map((s, i) => {
          const { a0, a1, frac } = ranges[i];
          const large = frac > 0.5 ? 1 : 0;
          const x0 = C + R * Math.cos(a0), y0 = 120 + R * Math.sin(a0);
          const x1 = C + R * Math.cos(a1), y1 = 120 + R * Math.sin(a1);
          const color = COLORS[i % COLORS.length];
          if (frac >= 0.999) {
            return <circle key={i} cx={C} cy={120} r={R} fill={color} />;
          }
          return (
            <path
              key={i}
              d={`M ${C} 120 L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`}
              fill={color}
            />
          );
        })}
      </svg>
      <div className="text-xs space-y-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {s.name}: {s.v}{chart.unit ? ` ${chart.unit}` : ""} ({Math.round((s.v / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

function TableView({ chart }: { chart: ChartData }) {
  const cols = chart.xLabels ?? chart.series[0]?.values.map((_, i) => `Col ${i + 1}`) ?? [];
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border border-zinc-300 px-2 py-1 text-left dark:border-zinc-700"></th>
          {cols.map((c, i) => (
            <th key={i} className="border border-zinc-300 px-2 py-1 text-left dark:border-zinc-700">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chart.series.map((s, i) => (
          <tr key={i}>
            <td className="border border-zinc-300 px-2 py-1 font-medium dark:border-zinc-700">{s.name}</td>
            {s.values.map((v, j) => (
              <td key={j} className="border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                {v}{chart.unit ? ` ${chart.unit}` : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
