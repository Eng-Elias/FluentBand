# FluentBand — AI-Powered English Fluency + IELTS Practice App
### 7-Day Build Plan (for AI coding agents: opencode / Devin + Kimi)

---

## 1. Product Summary

A web app that makes you **fluent** (not just test-savvy) while preparing for **IELTS**. Every exercise is generated dynamically by an LLM the user connects with **their own API key**. Speech features (TTS/STT) run **locally in the browser** (or on a user-run local server), so the whole app can sit on **free hosting (Render)**.

**Design principles**
1. **Local-first, private & portable**: user data and API keys live in the browser (IndexedDB). No accounts. One **export file** moves everything to any other browser or device (see §6.1).
2. **BYOK + provider-agnostic**: OpenAI-compatible and Anthropic-compatible, with custom Base URL.
3. **Learning-science first**: every feature maps to a proven method (section 3).
4. **Honest scoring**: LLM band scores are *estimates* with a range, never presented as official.
5. **Ship in a week**: ruthless MVP scope, boring tech, agent-friendly structure.
6. **Thin server**: the backend has exactly one job — relay LLM calls to the user's provider. Storage, SRS, speech, content verification, grading math, and export/import all run in the browser.

---

## 2. Scope

### MVP (Days 1–6)
| # | Feature | Notes |
|---|---------|-------|
| 1 | Settings: BYOK provider setup | OpenAI-compat + Anthropic-compat, base URL, model, "Test connection" |
| 2 | Quick diagnostic (placement) | ~15 min, gives starting band estimate per skill |
| 3 | **Daily Session** (the core loop) | Auto-built 30–45 min plan: reviews → input → output → feedback |
| 4 | Vocabulary & collocations with SRS | FSRS scheduling, items auto-harvested from your mistakes and texts |
| 5 | Speaking practice | IELTS Parts 1/2/3 + 4/3/2 fluency drill + shadowing; in-browser STT |
| 6 | Writing practice | Task 1 (Academic, generated chart data) + Task 2; rubric grading; revise loop |
| 7 | Reading practice | Generated passages + IELTS question types, timed |
| 8 | Listening practice | LLM script → local TTS → IELTS question types |
| 9 | Error Notebook | Every correction becomes a reviewable item |
| 10 | Progress dashboard | Band trend per skill, weak-area heatmap, streak |
| 11 | Full mock test (simplified) | Timed L/R/W (+ speaking simulation) |
| 12 | **Export / import backup file** | Portable between browsers/devices, merge or replace; see §6.1 |

### Explicitly out of scope for v1
User accounts / cloud sync, payments, mobile native apps, pronunciation phoneme scoring, General Training Writing Task 1 letters (add in v1.1), multi-user/teacher features, official-score claims.

---

## 3. Learning Science → Feature Mapping

Based on Paul Nation's **Four Strands** (balanced course) plus well-replicated findings in memory and skill-acquisition research.

| Principle | What it means | How the app implements it |
|-----------|---------------|---------------------------|
| **Spaced repetition** | Reviewing at increasing intervals beats cramming | FSRS (`ts-fsrs`) schedules vocab, collocations, grammar-error cards |
| **Retrieval practice** | Recalling > re-reading | Cards are *produce-it* (cloze, translate-to-English, speak the sentence), not just recognition |
| **Comprehensible input (i+1)** | Learn from material slightly above your level | Reading/Listening difficulty targeted at current level +0.5 band |
| **Pushed output** | Producing language exposes gaps | Daily speaking + writing, always with feedback |
| **Fluency development strand** | Fluency = speed on *known* material, repeated | **4/3/2 drill**, shadowing, repeated-listening, timed re-writes |
| **Deliberate practice + immediate feedback** | Targeted, corrected repetition on weaknesses | Error taxonomy → weak areas → next session emphasizes them |
| **Interleaving** | Mixing skills/question types improves transfer | Daily Session mixes skills and question types |
| **Task repetition** | Re-doing the same task improves fluency/accuracy | "Retry same prompt" with improved version; compare attempts |
| **Collocations / lexical chunks** | Fluent speakers use prefabricated chunks | Vocab focus is chunks ("take into account"), not isolated words |
| **Self-monitoring metrics** | Visible progress sustains motivation | WPM, pause ratio, filler count, lexical variety, band trend |

### The Daily Session (≈ 40 min, auto-generated)
1. **Warm-up — SRS reviews** (5–8 min): due cards (vocab, collocations, past errors)
2. **Input** (10 min): one Listening *or* Reading task (alternates), new target chunks highlighted
3. **Fluency** (8 min): 4/3/2 drill or shadowing on that day's topic
4. **Output** (12 min): Writing Task OR Speaking Part 2+3 (alternates)
5. **Feedback & harvest** (5 min): corrections reviewed → pushed to Error Notebook / SRS
6. **Topic continuity**: the same IELTS theme (e.g., Environment) runs through all blocks → vocabulary reuse inside one day (strengthens encoding)

---

## 4. Tech Stack (chosen for speed + free hosting)

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui** | Agents know it very well; one project for UI + API proxy; shadcn/ui is Next-native |
| State | Zustand + **Dexie (IndexedDB)** | Persistent local data, simple |
| Backup | `fflate` (zip) + WebCrypto + Zod | Portable export file, optional encrypted API keys, validated import |
| Backend | **Next.js Route Handlers** `app/api/llm/*` (Node runtime) | Stateless typed LLM gateway — the only server code in the app |
| LLM gateway (server only) | Thin custom adapters for OpenAI-compatible + Anthropic-compatible APIs *(or Vercel AI SDK used server-side)* | Custom `baseURL`; custom adapters give full control over quirks of third-party "compatible" providers |
| Validation | **Zod** (schemas in `src/shared`, used by server and browser) | LLM output validated on the server, re-validated in the browser |
| SRS | `ts-fsrs` | Modern scheduler, better than SM-2 |
| STT | **Whisper in browser** via `@huggingface/transformers` (`whisper-base.en` / `tiny.en`, quantized, Web Worker) | No server compute; word timestamps for fluency metrics |
| TTS | **Kokoro-82M in browser** (`kokoro-js`) → fallback Piper/Web Speech | High quality, multiple British/American voices, runs on WASM/WebGPU |
| Optional local speech server | Docker: `faster-whisper` + Kokoro/Piper exposing OpenAI-style `/v1/audio/*` | For users with a PC; much faster, same app interface |
| Charts | Recharts (dashboard) + inline SVG (IELTS Task 1 charts) | Simple |
| Tests | Vitest + Playwright (smoke only) | Agents can self-verify |
| Hosting | **Render** (Node web service, free tier) running `next start` | Serves the app + LLM gateway only |

> **Why in-browser speech?** Render's free tier has very small CPU/RAM, sleeps when idle, and has an ephemeral disk — unsuitable for Whisper/TTS inference. Running models in the user's browser makes hosting cost zero, and models are cached after the first download (~100–200 MB total). *Verify current Render free-tier limits before deploying; they change.*

### Speech provider abstraction
```ts
interface TTSProvider { speak(text, {voice, speed}): Promise<Blob>; voices(): Voice[] }
interface STTProvider { transcribe(audio: Blob, {wordTimestamps}): Promise<Transcript> }
// Implementations: BrowserKokoro, BrowserWhisper, OpenAICompatAudio (local server), WebSpeechFallback
```

### Next.js-specific rules (local-first in a server framework)
- **All feature pages are client components** (`"use client"`). Dexie, MediaRecorder, Web Workers, and IndexedDB are browser-only; never import them from server code. Load Dexie-dependent trees with `dynamic(..., { ssr: false })` where needed to avoid hydration errors.
- **No server data fetching / no database** — the server exists only for static assets and the LLM gateway (`/api/llm/*`). Everything else runs in the browser.
- **LLM routes** (`app/api/llm/*`): `export const runtime = 'nodejs'` (DNS resolution for the SSRF guard), `dynamic = 'force-dynamic'`; streaming endpoints return an SSE `ReadableStream` and forward the browser's abort signal to the upstream request.
- **Web Workers**: `new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })`.
- **transformers.js in the Next build**: in `next.config.ts` alias `sharp` and `onnxruntime-node` to `false` for the client bundle; serve ONNX/WASM assets from the CDN or `/public`.
- **CSP**: Next injects inline scripts, so use a nonce-based CSP (middleware) rather than blanket `unsafe-inline`.
- Prefer `output: 'standalone'` for a small Render deploy.

### Known limitations to tell the user (be honest in the UI)
- **Local speech server (optional)**: it is called directly from the browser, not through the backend, so it must allow CORS for the app's origin. From an HTTPS-hosted page, browsers generally allow `http://localhost` but block other plain-http LAN addresses (mixed content).
- **Accents**: Kokoro/Piper cover American + British well; Australian/Canadian/NZ accents are limited. IELTS Listening uses several accents → note it, and let users plug a better TTS via the local-server option.
- **Whisper tends to "clean up" disfluencies** (drops "um", repeats) → filler counts are approximate; use pause timing from word timestamps as the main fluency signal.
- **Pronunciation scoring**: not reliable from a transcript. v1 uses Whisper word confidence + "shadowing diff" as a *proxy*, labeled as such.
- **LLM band scores** are noisy: show as range (e.g., 6.0–6.5), use a rubric, and sample twice and merge.

---

## 5. Architecture

```
┌──────────────────────── Browser (Next.js client) ────────────────────────┐
│ UI (React)                                                               │
│  ├─ Session planner + content pipelines (generate → validate → verify)   │
│  ├─ Exercise players (Speaking / Writing / Reading / Listening / SRS)    │
│  ├─ Speech, fully local: Whisper worker, Kokoro worker                   │
│  ├─ Scoring math, fluency metrics, FSRS, export/import                   │
│  └─ Dexie DB: settings + keys, cards, attempts, errors, content cache    │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │  POST /api/llm/*  (HTTPS; key sent per request in a header)
                                    ▼
┌──────────────────── Next.js server (stateless, no storage) ──────────────┐
│ LLM Gateway: /chat (SSE) · /json · /test · /models                       │
│  ├─ guards: origin check, rate limit, URL/SSRF validation, size/time caps│
│  ├─ adapters: OpenAI-compatible | Anthropic-compatible                   │
│  └─ json(): strip → parse → Zod validate → one repair retry              │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼
                  User's provider (OpenAI-compatible or Anthropic-compatible, custom Base URL)
```

### LLM Gateway (server-side — build first)
**All LLM traffic goes browser → your Next.js backend → provider.** The browser never contacts a provider directly. That removes CORS problems, the Anthropic browser-access header, and any "direct vs proxy" mode: one code path.

**Typed endpoints, not a generic proxy.** The server builds the provider request itself from normalized parameters. It never forwards arbitrary bodies or paths, which shrinks the abuse surface a lot.

| Route | Purpose |
|-------|---------|
| `POST /api/llm/chat` | Chat completion; SSE streaming or single JSON response |
| `POST /api/llm/json` | Structured output: `schemaId` + messages → validated JSON |
| `POST /api/llm/test` | "Test connection": reachability, latency, model check, JSON-mode reliability |
| `POST /api/llm/models` | List models if the provider supports it |
| `GET /api/healthz` | Wake-up ping for free-tier cold starts |

**Request envelope**
```
headers: x-llm-api-key: <key>          (never in the body, never logged)
         x-access-passcode: <optional> (only if the deployment sets ACCESS_PASSCODE)
body:    { provider: { kind: 'openai'|'anthropic', baseUrl, model, extraHeaders? },
           params: { temperature, maxTokens, ... }, messages, schemaId? , stream? }
```

**Adapters**
- *OpenAI-compatible*: `POST {baseUrl}/chat/completions`, `Authorization: Bearer`; handle `max_tokens` vs `max_completion_tokens`; use `response_format: json_object` only if `/test` detected support; strip `reasoning_content` / `<think>` blocks.
- *Anthropic-compatible*: `POST {baseUrl}/messages`, `x-api-key`, `anthropic-version`; `system` sent separately; `max_tokens` always set; parse `content_block_delta` SSE events.
- Both emit the **same normalized SSE events**: `{type:'delta', text}` · `{type:'done', usage}` · `{type:'error', code, message}`.

**`/json` pipeline (server)**: schemas live in `src/shared/schemas` keyed by `schemaId` → include JSON Schema in the prompt → call → strip fences/think blocks → parse → Zod-validate → on failure **one repair retry** with the validation error → return `{ data, usage, attempts }` or a typed error. The browser re-validates with the same schema (cheap defense in depth).

**Where orchestration lives**: the browser. Pipelines call `/json` and then run programmatic checks (e.g., reading-question evidence quotes must appear in the passage), regenerate failed pieces with another call, cache results in Dexie, and prefetch the next task. The server stays dumb and stateless.

**Typed errors** (UI shows friendly messages): `invalid_key`, `rate_limited` (with retry-after), `model_not_found`, `bad_base_url`, `blocked_url`, `upstream_timeout`, `invalid_json_after_retry`, `gateway_busy`.

**Limits**: request body ≤ ~200 KB, output-token cap, upstream timeout (~120 s; streaming idle timeout ~60 s), per-IP rate limit and concurrency cap, abort propagation (browser disconnect → cancel upstream).

**Gateway security (critical — the server fetches user-supplied URLs)**
- Base URL: HTTPS only; reject userinfo; resolve DNS and **reject private, loopback, link-local, and cloud-metadata ranges** (IPv4 + IPv6, incl. `169.254.169.254`); **pin the resolved IP** for the connection (anti DNS-rebinding); **do not follow redirects** (or re-validate each hop).
- Only fixed paths on that host: `/chat/completions`, `/messages`, `/models`.
- `extraHeaders` allowlist (e.g., `HTTP-Referer`, `X-Title` for OpenRouter); never allow overriding `Host`, `Authorization`, or `x-api-key`.
- Same-origin check (`Origin`/`Sec-Fetch-Site`); optional `ACCESS_PASSCODE` env for private deployments.
- **No logging** of headers, prompts, or completions — log only status, latency, provider host, and token counts.
- Self-host switches: `ALLOW_PRIVATE_HOSTS=true` (lets a locally running app reach Ollama/LM Studio) and optional `DEFAULT_PROVIDER_*` env vars so keys can live on the server instead of the browser.

> **Consequence to document**: when the app is hosted on Render, the server **cannot reach a user's `localhost` models** (Ollama, LM Studio). Those work only when the app runs on the user's own machine with `ALLOW_PRIVATE_HOSTS=true`. Cloud providers (OpenAI, Anthropic, OpenRouter, Moonshot, etc.) work everywhere.

### Key handling
- Keys are stored in the browser (IndexedDB), optionally encrypted with a passphrase (WebCrypto AES-GCM).
- Each request sends the key to your backend over HTTPS in a header; the server keeps it **in memory for the duration of that request only** — never persisted, never logged.
- **Trust note** (show in UI + README): the key passes through whichever server hosts the app. Anyone can self-host; users should prefer budget-capped keys.
- Main browser-side risk is XSS → strict CSP, no third-party scripts.
- Keys are excluded from backup files unless the user opts in with a passphrase (§6.1).

---

## 6. Data Model (Dexie / IndexedDB)

```
settings        { id, providers[], activeProviderId, speech{tts,stt,voice,speed}, targetBand, examDate, theme }
profile         { skillLevels{listening,reading,writing,speaking}, vocabLevel, weakAreas[] }
cards           { id, type: vocab|collocation|grammar|pron, front, back, example, source, fsrsState, due }
reviews         { id, cardId, rating, ts, durationMs }
attempts        { id, skill, taskType, promptId, input(text|audioRef), result(json), band, ts }
errors          { id, category, subcategory, original, corrected, explanation, attemptId, cardId? }
content         { id, kind, topic, level, payload(json), audioBlobRef?, createdAt, usedAt? }  // generated-content cache
sessions        { id, date, plan[], completedBlocks[], minutes }
topicsSeen      { topic, count, lastSeen }   // anti-repetition
```

**Conventions for every table (required so export/import/merge works)**
- `id`: **UUIDv7** string (time-sortable, globally unique — never auto-increment integers, they collide across devices)
- `createdAt`, `updatedAt` (epoch ms), optional `deletedAt` (soft delete / tombstone)
- Attempts store a `promptSnapshot` (the actual task text) so history stays readable even though the generated-content cache is not exported
- Every table is registered in `core/backup/registry.ts` (name, Zod schema, merge strategy, include-in-export flag)

**Error taxonomy** (drives weak-area detection): grammar (tense, articles, agreement, prepositions, word order, complex sentences) · lexical (collocation, word choice, repetition, register) · coherence (cohesive devices, paragraphing, task response) · speaking (fillers, long pauses, self-corrections, short answers).

### 6.1 Backup, Export & Import (moving to another browser/device)

**Goals**: no accounts, no cloud; move all progress with one file; safe to import twice; never silently lose data.

**File**: `fluentband-backup-YYYY-MM-DD.fluentband` — a ZIP built with `fflate`:
```
manifest.json      { app, format, schemaVersion, appVersion, exportedAt, deviceLabel,
                     options{includeAudio, includeKeys}, counts{table:n}, sha256{file:hash} }
data/<table>.json  one file per table (arrays of rows)
audio/<id>.webm    OPTIONAL — your speaking recordings (off by default, files get large)
secrets.enc        OPTIONAL — API keys encrypted with a passphrase (off by default)
```

| Data | In the export? |
|------|----------------|
| settings (without keys), profile, cards, reviews, attempts, errors, sessions, topicsSeen | **Always** |
| Speaking recordings | Optional checkbox |
| API keys | Optional checkbox; **AES-GCM encrypted with a user passphrase** (PBKDF2 via WebCrypto). Default: excluded → re-enter keys on the new device |
| Generated-content cache, TTS audio cache, downloaded Whisper/Kokoro models | **Never** (regenerable; keeps the file small) |

**Export flow**: Settings → Backup → choose options → build in a worker (chunked reads; handles 100k+ reviews) → download via `<a download>` (or `showSaveFilePicker` where supported) → store `lastExportAt`.

**Import flow**: pick file or drag-and-drop → validate (zip ok, manifest, `schemaVersion` ≤ app's, SHA-256 per file, Zod per table) → **dry-run preview** ("120 new cards, 14 updated, 300 unchanged") → choose **Merge** (default) or **Replace** → in Replace mode, auto-download a "pre-import snapshot" first → apply in **one Dexie transaction** (all-or-nothing) → run migrations if the file is older → summary + reload.

**Merge rules (deterministic and idempotent)**
- Same `id`: keep the row with the greater `updatedAt` (tie-break: higher `rev`, then lexicographic hash). Tombstones (`deletedAt`) win if newer.
- **Append-only tables** (`reviews`, `attempts`, `sessions`, `errors`): union by `id`.
- **Cards**: last-write-wins by default. Because `reviews` is an append-only log, card scheduling state can be rebuilt by replaying merged reviews through FSRS — do this if time allows (exact merge), otherwise LWW.
- **Settings**: per-provider by `id`; never overwrite an existing API key with an empty one.
- Importing the same file twice must change nothing.

**Versioning**: `schemaVersion` + ordered migrations (`migrations/vN_to_vN+1.ts`). Older files are upgraded on import; newer files are refused with "please update the app".

**Protecting local data**: call `navigator.storage.persist()`; show storage usage; **backup reminder** every 7 days or after 5 sessions without an export; warn that Safari/iOS may evict storage for rarely used sites (recommend Add to Home Screen + regular exports); optional Chrome-only "auto-save backup to a chosen file" via File System Access API.

**Tests (must exist)**: export → wipe DB → import = deep-equal · double import = no change · merge two divergent datasets · old-schema fixture migrates · tampered/corrupt file rejected · wrong passphrase rejected · 50k rows within a few seconds · a test that fails if any Dexie table is missing from the registry · manual check Chrome ↔ Firefox ↔ Safari.

---

## 7. IELTS Content & Grading Specs

### Content generators (all return Zod-validated JSON)
| Generator | Output |
|-----------|--------|
| **Reading** | Passage 700–900 words (academic style, topic + level aware), 10–13 questions across types: T/F/NG, matching headings, sentence completion, MCQ, summary completion. **Each question includes `evidence` = exact quote from passage.** |
| **Listening** | Section 1–4 scripts (speaker roles, natural spoken style with hesitations), questions: form/note completion, MCQ, matching, map-free (skip map labelling in v1). Script → TTS with distinct voices per speaker. |
| **Writing T1 (Academic)** | Structured **chart data JSON** (line/bar/pie/table) → rendered as SVG by the app; model answer + key features list |
| **Writing T2** | Prompt in IELTS types (opinion, discuss both views, problem-solution, two-part), topic-aware |
| **Speaking** | Part 1 question sets by theme, Part 2 cue cards, Part 3 follow-ups that deepen with the user's answers (examiner persona) |
| **Vocab pack** | 8–12 topic collocations/chunks with example sentences, register notes, common mistakes |

### Anti-hallucination & quality checks (programmatic, not prompt-only)
- Reading: verify every `evidence` string actually appears in the passage; drop/regenerate questions that fail. Check word count and question count.
- Listening: verify answers appear in script; cap speaker turns; ensure answer words are speakable.
- Dedupe: store topic + title; reject near-duplicates; rotate through an IELTS topic bank (~40 themes).
- **Prefetch**: generate the next task in the background while the user works on the current one (hides latency).

### Grading prompts (rubrics embedded, per official public band descriptors)
- **Writing**: Task Achievement/Response · Coherence & Cohesion · Lexical Resource · Grammatical Range & Accuracy → sub-scores, overall, **range**, ≥5 concrete corrections with explanations, sentence-level rewrites for upgraded vocabulary, and a "top 3 priorities" list.
- **Speaking**: Fluency & Coherence · Lexical Resource · Grammatical Range & Accuracy · Pronunciation (**proxy, flagged as low-confidence**) + computed metrics: WPM, mean pause length, pauses > 1s per minute, filler count, type-token ratio, answer length per part.
- **Calibration**: grader samples twice (temperature > 0) and averages; ship with 3–5 hand-checked anchor essays in `/evals` to sanity-test grader consistency when users switch models.
- Feedback style: specific, quote the learner's words, explain *why*, give a corrected version, then a **"try again"** task (task repetition).

### Speaking flow specifics
- **IELTS simulation**: Part 1 (4–5 questions) → Part 2 (60s prep timer + notes box, 2 min speaking with countdown) → Part 3 (adaptive follow-ups). Examiner voice via TTS.
- **4/3/2 drill**: same story told to "listener" for 4 → 3 → 2 minutes (shorter each time). Metrics compare WPM and pause ratio across rounds — direct fluency evidence.
- **Shadowing**: listen to a TTS sentence/short paragraph → record → transcript diff + timing comparison.

---

## 8. Suggested Repo Structure

```
fluentband/
├─ AGENTS.md                      # rules for coding agents (see §10)
├─ package.json  next.config.ts  tsconfig.json  postcss/tailwind config
├─ src/
│  ├─ app/                        # Next.js App Router
│  │  ├─ layout.tsx  page.tsx
│  │  ├─ today/ diagnostic/ vocab/ speaking/ writing/ reading/
│  │  │  listening/ errors/ progress/ mock-test/ settings/   (each: page.tsx, "use client")
│  │  └─ api/
│  │     ├─ llm/{chat,json,test,models}/route.ts   # stateless LLM gateway (Node runtime)
│  │     └─ healthz/route.ts
│  ├─ server/                     # server-only: llm/(adapters, gateway, sse, json-repair), guards/(url+ssrf, origin, ratelimit)
│  ├─ core/
│  │  ├─ llm/                     # browser client only: client.ts (fetch + SSE reader + abort), errors.ts
│  │  ├─ speech/                  # tts/, stt/, workers/, providers
│  │  ├─ srs/                     # fsrs wrapper, card factory
│  │  ├─ db/                      # dexie schema, repositories, uuidv7
│  │  ├─ backup/                  # registry.ts, export.ts, import.ts, merge.ts, crypto.ts, migrations/
│  │  └─ planner/                 # session planner, weak-area logic
│  ├─ features/                   # settings, diagnostic, today, vocab, speaking, writing,
│  │                              # reading, listening, errors, progress, mock-test, backup-ui
│  ├─ prompts/                    # versioned prompt builders (pure, browser-side)
│  ├─ shared/                     # Zod schemas + types shared by browser and server (schemaId registry)
│  └─ components/                 # shared UI
├─ evals/                         # anchor essays, schema fixtures
├─ e2e/                           # playwright smoke tests
├─ docker/speech-server/          # optional local faster-whisper + TTS compose
├─ render.yaml
└─ docs/PLAN.md                   # this file
```

---

## 9. 7-Day Schedule

> Each day ends with a **demoable, committed, deployed** increment. Keep tasks small enough that an agent can finish one in a single prompt (≤ ~30–60 min each).

### Day 1 — Foundation + LLM Gateway
- [ ] Scaffold Next.js (App Router, TS strict) + Tailwind + shadcn/ui; ESLint/Prettier; Vitest. Feature pages are `"use client"`; Dexie loaded client-side only.
- [ ] Dexie schema (UUIDv7 `id`, `createdAt/updatedAt/deletedAt` on every table) + repositories + **backup registry and generic exporter/importer skeleton** (§6.1) with the round-trip test.
- [ ] **Server-side LLM Gateway** (`src/server/llm`): OpenAI-compat + Anthropic-compat adapters, normalized SSE streaming, `/json` with Zod + repair retry, typed errors. Thin browser client `core/llm/client.ts` (fetch + SSE reader + abort).
- [ ] Settings page: provider CRUD, base URL, model, key, **Test connection**.
- [ ] Route Handlers `app/api/llm/{chat,json,test,models}` (Node runtime) with URL/SSRF guard, origin check, rate limit, size/time caps, no-logging policy.
- [ ] `render.yaml` (`npm ci && npm run build` → `npm run start`), first deploy to Render; check memory use.
- **Acceptance**: with a real key for each provider kind, chat streams through the backend and a Zod-validated JSON call succeeds; aborting in the browser cancels the upstream request. Unit tests pass for both adapters (mock upstream server), json-repair, and the SSRF guard (private IPs, redirects, DNS-rebinding case).

### Day 2 — Speech Layer (highest technical risk → do early)
- [ ] `next.config.ts` tweaks for transformers.js (alias `sharp` / `onnxruntime-node` to false on the client), worker setup via `new Worker(new URL(...))`.
- [ ] Whisper worker (transformers.js): record via MediaRecorder → decode → transcribe with **word timestamps**; model download progress UI; cache check.
- [ ] Kokoro TTS worker: voice picker (US/UK), speed control, audio cache in IndexedDB.
- [ ] Fallbacks: Web Speech API (TTS) ; OpenAI-compat audio endpoint provider (local server).
- [ ] Fluency metrics utility (WPM, pauses, fillers, TTR) with unit tests.
- [ ] `docker/speech-server` compose (optional, document only if time is short).
- **Acceptance**: record 60s speech → transcript + metrics shown; any text → natural audio in < ~5s for a paragraph on a normal laptop. **If WASM Whisper/Kokoro is too slow, decide today** to default to `tiny.en` + recommend local server.

### Day 3 — Vocabulary/SRS + Writing
- [ ] FSRS wrapper, review UI (cloze, produce-the-sentence, keyboard shortcuts), card creation from any text selection.
- [ ] Vocab pack generator (topic collocations) → cards.
- [ ] Writing: T2 prompt generator, editor with timer + word count, grader (rubric JSON), results UI with inline corrections, "revise & resubmit" comparison.
- [ ] Writing T1: chart-data generator + SVG chart renderer (line/bar/pie/table).
- [ ] Errors → Error Notebook → auto-cards.
- **Acceptance**: write essay → graded with range + corrections → corrections appear as due SRS cards.

### Day 4 — Speaking
- [ ] Examiner engine: Part 1/2/3 state machine, TTS examiner, STT answers, adaptive Part 3 follow-ups.
- [ ] Part 2 prep/talk timers + notes box.
- [ ] Speaking grader (rubric + computed metrics, pronunciation flagged as proxy).
- [ ] 4/3/2 drill with round-over-round metrics chart.
- [ ] Shadowing mode with transcript diff.
- **Acceptance**: full 11–14 min simulated test runs end-to-end, with feedback + new chunks sent to SRS.

### Day 5 — Reading + Listening
- [ ] Reading generator + evidence verification + question-type renderers (T/F/NG, headings, completion, MCQ, summary) + timer + auto-scoring + review mode with evidence highlighting.
- [ ] Listening generator → multi-voice TTS stitching → player (play-once exam mode, replay practice mode, transcript reveal after).
- [ ] Question auto-scoring + per-question-type accuracy stats.
- [ ] Background prefetch of next content.
- **Acceptance**: both modules generate, validate, run, and score; failed-validation content is auto-regenerated without user noticing.

### Day 6 — Daily Session, Diagnostic, Dashboard
- [ ] Planner: builds the session from due cards + weakest skill/error categories + topic continuity + level targeting.
- [ ] "Today" page with block progress and streak.
- [ ] Diagnostic: short mixed test → initial `profile`.
- [ ] Dashboard: band trend per skill (with ranges), error-category heatmap, fluency metric trends, study minutes.
- [ ] **Backup & Restore UI**: export options (audio, encrypted keys), import with drag-and-drop, dry-run preview, merge/replace, pre-import snapshot, backup reminders, `storage.persist()`.
- [ ] Complete backup logic: merge rules, schema migrations, passphrase encryption, tamper/corruption checks, full test list from §6.1.
- [ ] Simplified full mock test (L/R/W timed, Speaking simulated).
- **Acceptance**: a new user can onboard → diagnostic → get a coherent Today session → finish it → see progress update. **Export → open a different browser → import → everything (cards, history, progress, settings) is identical.**

### Day 7 — Hardening, UX, Docs, Ship
- [ ] Error states: invalid key, rate limits, model returns garbage, mic denied, model download failure, offline.
- [ ] Cost/token display; "cheaper mode" (shorter passages, fewer questions).
- [ ] Mobile/responsive pass; keyboard accessibility; dark mode.
- [ ] Security pass: CSP headers, no key/prompt/completion in logs, gateway abuse tests (private IPs, DNS rebinding, redirects, oversized bodies, header injection, rate-limit bypass).
- [ ] Playwright smoke tests (settings → test connection mock → open each module).
- [ ] README: setup, BYOK guide, how the server-side gateway works (and the key-transit trust note), self-host mode for local models, local speech server guide, limitations.
- [ ] Final Render deploy + cold-start check (free tier sleeps → show a friendly "waking up" state).
- **Acceptance**: fresh-browser walkthrough with a real key has zero blockers; README lets a stranger deploy it.

### Buffer / cut list (if behind schedule, cut in this order)
1. Full mock test → ship as v1.1
2. Writing Task 1 charts → text-only data tables first
3. Diagnostic → ask user to self-select level + auto-adjust after first sessions
4. Shadowing mode
5. Encrypted API-key inclusion in backups (keys simply stay excluded) and recordings in backups

**Never cut**: LLM gateway, speech layer, SRS, Writing/Speaking feedback, Daily Session, **backup export/import**.

---

## 10. Working With AI Coding Agents (opencode / Devin + Kimi)

### AGENTS.md (put in repo root on Day 1)
```
# Project rules
- Stack: Next.js App Router + React + TS (strict), Tailwind, shadcn/ui, Zustand, Dexie, Zod, fflate, Vitest.
- Local-first: feature pages are client components. Never import Dexie/browser APIs in server code. Server code lives only in src/server and src/app/api.
- Every Dexie table MUST have UUIDv7 id + createdAt/updatedAt/deletedAt and be registered in core/backup/registry.ts. The export/import round-trip test must stay green.
- LLM calls happen ONLY on the server (`src/server/llm`, reached via `/api/llm/*`). Never call a provider from browser code. Everything else (storage, SRS, speech, scoring math, verification, backup) runs in the browser.
- All structured LLM output is Zod-validated on the server (`schemaId` from `src/shared`) and re-validated in the browser. Never trust raw model text.
- All prompts live in src/prompts/*.ts with their Zod schema next to them.
- Never store or log API keys, prompts, or completions on the server (keys live in memory for one request only).
- Never forward arbitrary bodies/paths to providers; build requests from normalized params. Every user-supplied URL goes through the SSRF guard.
- No feature without: types, a happy-path test, and loading + error states.
- Speech runs in Web Workers; never block the main thread.
- Prefer small files (<300 lines). Keep functions pure where possible.
- Run `npm run typecheck && npm test` before declaring a task done.
- Commit per task with conventional commit messages.
```

### Workflow tips
- **One task = one prompt** from the checklists above; paste acceptance criteria verbatim.
- Ask the agent to **write tests/fixtures first** for the gateway, json-repair, SSRF guard, fluency metrics, FSRS wrapper.
- Use **git worktrees / parallel sessions** after Day 2: e.g., Writing (Day 3) and Speaking (Day 4) share only the gateway + speech APIs, so they can run in parallel.
- Keep a `docs/DECISIONS.md` where the agent logs choices (model sizes, fallbacks) so later sessions don't re-litigate.
- Don't let the agent invent browser APIs: for Whisper/Kokoro, make it read the current official docs/examples of `@huggingface/transformers` and `kokoro-js` first (APIs change quickly).
- Make the agent **test with a mock LLM server** (fixture JSON) so most tests don't burn tokens; use the real key only for 2–3 end-to-end smoke tests.
- Model-agnostic: this plan doesn't depend on a specific agent model; if the model struggles with a hard piece (Web Worker + WASM), give it a minimal working reference from the library's examples.

### Example task prompt
> "Implement the server-side LLM gateway in `src/server/llm` and routes `app/api/llm/chat` and `app/api/llm/json`. Support `kind: 'openai' | 'anthropic'` with custom `baseUrl`; the API key arrives in the `x-llm-api-key` header and must never be logged. `chat` streams normalized SSE events and cancels the upstream request when the client aborts. `json` takes a `schemaId`, strips code fences and `<think>` blocks, Zod-validates, and retries once with the validation error appended. All URLs pass through the SSRF guard. Add Vitest tests with a local mock upstream for both provider formats. Done when `npm test` passes and the Settings 'Test connection' button works against the mock."

---

## 11. Prompt Design Guidelines

- Separate **system persona** (examiner / grader / content writer) from **task**; include the learner profile (level, weak areas, target band, topics seen).
- Always request **JSON only** + schema + 1 short example; set `temperature` low (0.2–0.4) for graders, higher (0.8) for content.
- Version prompts (`v1`, `v2`) and store `promptVersion` with each attempt so score changes can be explained.
- Graders: "quote the learner's exact words," "do not be generous," "give a range," "list uncertainty."
- Content: specify word count, register (academic / conversational), target CEFR/band, required target chunks to embed, and forbidden repeats from `topicsSeen`.

---

## 12. Deployment (Render, free tier)

- One **Web Service** (Node): build `npm ci && npm run build`, start `npm run start` (`next start`), with `output: 'standalone'` to shrink the footprint.
- Serves the app + LLM gateway routes only (no SSR data fetching, no heavy compute). Keep dependencies lean and **verify memory after deploy against the free-tier RAM limit**.
- No database on Render (free Postgres expires; not needed — data is local).
- Headers (via `next.config.ts` `headers()` / middleware nonce): strict CSP (allow `wasm-unsafe-eval` + `worker-src blob:` for the speech models, and connect-src to HuggingFace/jsDelivr CDN for first model download), COOP/COEP only if you enable multithreaded WASM (test; may break CDN loading).
- Free instances sleep when idle → first request is slow; show a "waking up" UI and keep the app shell cacheable (add a simple PWA service worker if time permits).
- **Gateway-specific**: every LLM call needs the server awake. Ping `/api/healthz` when the app loads, show a "waking up the server…" state, and auto-retry the first call. Stream via SSE with periodic keep-alive comments; check Render's request-duration limits against your longest generation (prefer streaming + shorter outputs, e.g., generate listening scripts in parts).
- **CSP bonus**: the browser now only connects to its own origin (plus the model CDN for first-time speech-model downloads) — no provider domains in `connect-src`.
- Optional: make the app fully **self-hostable locally** via `docker compose up` (app + speech server) — document in README.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| In-browser Whisper/Kokoro slow on weak devices | Speaking/Listening feel laggy | `tiny.en` default, quantized models, WebGPU when available, local speech server option, prefetch TTS |
| Free-tier cold start / long generations on the server | First LLM call slow or times out | Wake-up ping on load, "waking up" UI, auto-retry, SSE keep-alive, abort propagation, generate long content in parts |
| LLM returns invalid JSON | Broken exercises | Zod + repair retry + regenerate; mock-tested |
| Hallucinated reading/listening answers | Learner learns wrong things | Evidence-quote verification; drop failing questions |
| Inflated/unstable band scores | Misleading progress | Rubric prompts, ranges, double-sampling, anchor evals, "estimate" labeling |
| Gateway abused as open relay / SSRF | Security incident, bandwidth abuse | Typed endpoints only (no body/path forwarding), HTTPS-only + private-IP block + IP pinning + no redirects, origin check, rate limit + concurrency cap, optional `ACCESS_PASSCODE`, no logging |
| Local models (Ollama/LM Studio) unreachable from hosted server | Users can't use `localhost` endpoints | Document clearly; self-host mode with `ALLOW_PRIVATE_HOSTS=true`; cloud providers work everywhere |
| API key transits the server | Trust concern | Never persisted/logged, in-memory per request, self-host option, recommend budget-capped keys, optional env-configured default provider |
| API key theft via XSS | Key leak | CSP, no third-party scripts, optional encryption, advise using limited-budget keys |
| Token cost surprise | User frustration | Cost estimate, cheaper mode, caching generated content |
| Browser storage cleared/evicted (esp. Safari/iOS) | Lost progress | `storage.persist()`, backup reminders, one-click export, Add-to-Home-Screen advice |
| Import corrupts or duplicates data | Lost trust | Zod + hash validation, dry-run preview, single transaction, pre-import snapshot, idempotent merge tests |
| Next.js memory on free tier | Crashes/slow cold start | `standalone` output, no SSR fetching, lean deps, check after Day 1 deploy |
| Scope creep | Misses 1 week | Cut list in §9; MVP freeze at end of Day 5 |
| Accent coverage in TTS | Listening less realistic | Disclose; allow plugging better TTS via local server |

---

## 14. Definition of Done (v1)

- [ ] New user configures a provider (OpenAI-compat **and** Anthropic-compat tested) in < 2 minutes.
- [ ] Daily Session runs end-to-end covering SRS, input, fluency drill, output, feedback.
- [ ] Each of Speaking / Writing / Reading / Listening generates fresh, validated content every time.
- [ ] Every correction becomes a reviewable SRS item.
- [ ] Dashboard shows band-estimate ranges and fluency metric trends over time.
- [ ] Works on Render free tier; speech models run in-browser with progress UI.
- [ ] **All LLM calls go through the server gateway; the browser never contacts an LLM provider.** No API key, prompt, or completion is ever stored or logged server-side; CSP + SSRF protections are tested.
- [ ] **A backup file exported on one browser imports correctly into a fresh browser/device** (merge and replace modes, tested; API keys optional and encrypted).
- [ ] README explains setup, limitations, and "estimates ≠ official scores."

---

## 15. After v1 (Roadmap)

1. Cloud sync (optional, e.g., Supabase) + accounts
2. General Training modules (letters)
3. Better pronunciation assessment (phoneme-level model, e.g., wav2vec2-based) running locally
4. Real-time conversation partner mode (streaming STT → LLM → TTS)
5. Teacher/exam-date coach: backward-plans study load from exam date and target band
6. PWA/offline mode with downloadable content packs
7. Community-shared topic banks and anchor essays for better calibration
