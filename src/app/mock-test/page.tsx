"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui/primitives";
import Link from "next/link";

/**
 * Simplified full mock test: timed sequence of Listening → Reading →
 * Writing (+ a link to the speaking simulator). Each stage links to the
 * dedicated module; results are recorded there.
 */
export default function MockTestPage() {
  const [stage, setStage] = useState<"intro" | "done">("intro");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mock Test (simplified)</h1>
      <Card>
        <p className="text-sm text-zinc-500">
          A full IELTS simulation in order: Listening → Reading → Writing →
          Speaking. Complete each section in its module — attempts are scored
          and appear in Progress. Suggested timing:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li><b>Listening</b> — one full section (~10 min)</li>
          <li><b>Reading</b> — one passage with questions (~20 min)</li>
          <li><b>Writing</b> — Task 1 (20 min) + Task 2 (40 min)</li>
          <li><b>Speaking</b> — full P1+2+3 simulation (~14 min)</li>
        </ol>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/listening"><Button className="w-full" variant="outline">1. Listening section</Button></Link>
          <Link href="/reading"><Button className="w-full" variant="outline">2. Reading passage</Button></Link>
          <Link href="/writing"><Button className="w-full" variant="outline">3. Writing tasks</Button></Link>
          <Link href="/speaking?mode=full"><Button className="w-full" variant="outline">4. Speaking simulation</Button></Link>
        </div>
        <Button className="mt-6" variant="secondary" onClick={() => setStage("done")}>
          I finished all four — mark complete
        </Button>
        {stage === "done" && (
          <p className="mt-3 text-sm text-green-600">
            Mock complete — check <Link href="/progress" className="underline">Progress</Link> for band estimates per skill.
          </p>
        )}
      </Card>
    </div>
  );
}
