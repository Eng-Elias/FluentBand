"use client";

import { useEffect, useState } from "react";
import { healthz } from "@/core/llm/client";

/** Pings /api/healthz on load so a sleeping free-tier server wakes early. */
export function WakePing() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setWaking(true);
    }, 1500);
    healthz().finally(() => {
      clearTimeout(t);
      if (!cancelled) setWaking(false);
    });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!waking) return null;
  return (
    <div className="fixed bottom-3 right-3 rounded-md bg-zinc-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-200 dark:text-zinc-900">
      Waking up the server…
    </div>
  );
}
