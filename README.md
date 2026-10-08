# FluentBand

AI-powered English fluency + IELTS practice. **Local-first**: your data and API
keys live in your browser (IndexedDB). The server is a thin, stateless LLM
gateway — nothing else.

## What it does

- **Daily Session** — a ~40 min auto-built plan (reviews → input → fluency →
  output → feedback) with one IELTS theme running through the day
- **Vocabulary & collocations** — FSRS spaced repetition; cards auto-harvested
  from your mistakes and generated vocab packs
- **Speaking** — full IELTS simulation (Parts 1/2/3 with TTS examiner), 4/3/2
  fluency drill, shadowing; in-browser Whisper STT with fluency metrics
  (WPM, pause ratio, fillers, lexical variety)
- **Writing** — Task 1 (generated charts rendered as SVG) + Task 2, rubric
  grading with band *ranges*, corrections → error notebook → SRS cards
- **Reading** — generated 700–900 word passages + IELTS question types with
  programmatic evidence verification
- **Listening** — generated scripts → multi-voice local TTS
- **Progress** — band trend per skill, weak-area heatmap, streaks
- **Backup** — one `.fluentband` file moves everything between devices;
  merge or replace; optional AES-encrypted keys + recordings

## Setup

```bash
npm ci
npm run dev        # http://localhost:3000
npm test           # unit tests (mock upstream — no API key needed)
npm run typecheck  # strict TS
npm run build && npm run start
```

Then open the app → **Settings** → add a provider:

| Provider kind | Example base URL | Notes |
|---|---|---|
| `openai` | `https://api.openai.com/v1` | also OpenRouter, Moonshot, Groq, etc. |
| `anthropic` | `https://api.anthropic.com/v1` | uses `/messages` + `x-api-key` |
| local models | `http://localhost:11434/v1` | only in self-host mode (below) |

## How the LLM gateway works (trust note)

All LLM calls go **browser → this app's backend → your provider**. Your key is
sent in the `x-llm-api-key` header per request and held in server memory only
for that request — never persisted, never logged. Anyone hosting this app can
see keys in transit, so prefer budget-capped keys, or self-host.

The gateway is **not** a generic proxy: it builds provider requests from
normalized parameters, validates base URLs (HTTPS-only, DNS-pinned, private-IP
rejection, no redirects), rate-limits, and checks same-origin. Structured
output is Zod-validated on the server with one repair retry, then re-validated
in the browser.

## Self-host mode (local models like Ollama / LM Studio)

A hosted deployment cannot reach your `localhost` models. To use them, run the
app locally with:

```bash
ALLOW_PRIVATE_HOSTS=true npm run dev
```

Or keep keys entirely server-side:

```bash
DEFAULT_PROVIDER_KIND=openai
DEFAULT_PROVIDER_BASE_URL=https://api.openai.com/v1
DEFAULT_PROVIDER_API_KEY=sk-...
DEFAULT_PROVIDER_MODEL=gpt-4o-mini
```

Private deployments can require a passcode: `ACCESS_PASSCODE=...` (send it via
the `x-access-passcode` header from your own client config).

## Optional local speech server

In-browser Whisper (`tiny.en`/`base.en`) and Kokoro-82M run everywhere, but are
faster on a real machine. `docker/speech-server/` provides a faster-whisper +
Piper container exposing OpenAI-style `/v1/audio/*` — then set Speech provider
to `local-server` in Settings. Note: called directly from the browser (CORS
must allow the app origin); browsers block plain-http LAN calls from HTTPS
pages, so this works best when the app itself runs on localhost.

## Deploy (Render free tier)

`render.yaml` is included: `npm ci && npm run build` → `npm run start` with
`output: 'standalone'`. The server only serves the app + `/api/llm/*` — no
database needed. Free tier sleeps when idle; the app pings `/api/healthz` on
load and shows a "waking up" indicator.

## Honest limitations

- **Band scores are estimates** — shown as ranges, sampled twice and merged.
  Anchor essays for calibration live in `evals/`.
- **Pronunciation** feedback is a transcript-based *proxy* (flagged in the UI).
- **Accents**: Kokoro covers US + UK English; IELTS uses more accents — use the
  local speech server if you need them.
- **Filler counts** are approximate — Whisper normalizes disfluencies; pause
  timing is the primary fluency signal.
- **Browser storage** can be evicted (esp. Safari/iOS) — export backups
  regularly; the app reminds you.

## Repo layout

See `docs/PLAN.md` for the full build plan, `docs/DECISIONS.md` for choices,
`AGENTS.md` for agent rules, `docker/` for the speech server, `e2e/` for
Playwright smoke tests, `evals/` for anchor essays.
