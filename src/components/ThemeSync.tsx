"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, SINGLETON_SETTINGS_ID } from "@/core/db/db";

/** Applies the user's theme setting (light/dark/system) to <html>. */
export function ThemeSync() {
  const theme = useLiveQuery(
    () =>
      getDb()
        .settings.get(SINGLETON_SETTINGS_ID)
        .then((s) => s?.theme ?? "system"),
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.classList.toggle("light", theme === "light");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return null;
}
