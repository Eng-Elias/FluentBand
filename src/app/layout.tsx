import type { Metadata } from "next";
import Link from "next/link";
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
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <WakePing />
        <ThemeSync />
      </body>
    </html>
  );
}
