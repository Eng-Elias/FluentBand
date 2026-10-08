import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-3xl font-bold">FluentBand</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        AI-powered English fluency + IELTS practice. Local-first: your data and
        API keys stay in your browser. Bring your own LLM key (OpenAI-compatible
        or Anthropic-compatible) and every exercise is generated fresh for you.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/settings"
          className="rounded-lg border border-zinc-200 p-4 hover:border-blue-400 dark:border-zinc-800"
        >
          <h2 className="font-semibold">1. Set up your provider</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Connect an OpenAI-compatible or Anthropic-compatible API key.
          </p>
        </Link>
        <Link
          href="/diagnostic"
          className="rounded-lg border border-zinc-200 p-4 hover:border-blue-400 dark:border-zinc-800"
        >
          <h2 className="font-semibold">2. Quick diagnostic</h2>
          <p className="mt-1 text-sm text-zinc-500">
            ~15 min placement to estimate your starting band per skill.
          </p>
        </Link>
        <Link
          href="/today"
          className="rounded-lg border border-zinc-200 p-4 hover:border-blue-400 dark:border-zinc-800"
        >
          <h2 className="font-semibold">3. Today&apos;s session</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A ~40 min auto-built plan: reviews → input → fluency → output →
            feedback.
          </p>
        </Link>
        <Link
          href="/progress"
          className="rounded-lg border border-zinc-200 p-4 hover:border-blue-400 dark:border-zinc-800"
        >
          <h2 className="font-semibold">4. Track progress</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Band trends, weak-area heatmap, and streaks.
          </p>
        </Link>
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        Tip: your API key is sent per-request to this app&apos;s own backend
        which relays it to your provider — it is never stored or logged on the
        server. Prefer a budget-capped key. See Settings → Backup to move your
        progress between devices.
      </p>
    </div>
  );
}
