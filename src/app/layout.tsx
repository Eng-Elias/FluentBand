import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { WakePing } from "@/components/WakePing";
import { ThemeSync } from "@/components/ThemeSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluentBand — IELTS Fluency Practice",
  description:
    "Local-first AI-powered English fluency + IELTS practice. Bring your own LLM key.",
};

const NAV = [
  ["Today", "/today"],
  ["Vocab", "/vocab"],
  ["Speaking", "/speaking"],
  ["Writing", "/writing"],
  ["Reading", "/reading"],
  ["Listening", "/listening"],
  ["Library", "/library"],
  ["Errors", "/errors"],
  ["Progress", "/progress"],
  ["Mock Test", "/mock-test"],
  ["Settings", "/settings"],
] as const;

// Opt page content out of prerendering → dynamic routes aren't held in the
// client router cache, so revisiting a practice page remounts fresh state
// (a finished test can't resurrect). This app renders client-side anyway.
async function RequestBoundary({ children }: { children: React.ReactNode }) {
  await connection();
  return <>{children}</>;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              FluentBand
            </Link>
            <NavLinks items={NAV} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Suspense fallback={null}>
            <RequestBoundary>{children}</RequestBoundary>
          </Suspense>
        </main>
        <WakePing />
        <ThemeSync />
      </body>
    </html>
  );
}
