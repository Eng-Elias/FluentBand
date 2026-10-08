<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

- Stack: Next.js 16 (App Router, Turbopack, cacheComponents) + React 19 + TS strict, Tailwind 4, local UI primitives, Zustand, Dexie, Zod v4, fflate, Vitest.
- Local-first: feature pages are client components. Never import Dexie/browser APIs in server code. Server code lives only in `src/server` and `src/app/api`.
- `cacheComponents` is ON: do NOT export `runtime`/`dynamic` segment config; wrap `useSearchParams` in `<Suspense>`; no impure calls (`Date.now()`, `Math.random()`) in component scope — use helpers from `core/db/db`.
- Every Dexie table MUST have UUIDv7 `id` + `createdAt`/`updatedAt`/`deletedAt` and be registered in `core/backup/registry.ts`. The export/import round-trip test must stay green.
- LLM calls happen ONLY on the server (`src/server/llm`, reached via `/api/llm/*`). Never call a provider from browser code. Everything else (storage, SRS, speech, scoring math, verification, backup) runs in the browser.
- All structured LLM output is Zod-validated on the server (`schemaId` from `src/shared`) and re-validated in the browser. Never trust raw model text.
- All prompts live in `src/prompts/*.ts` with a `PROMPT_VERSION` bump on changes.
- Never store or log API keys, prompts, or completions on the server (keys live in memory for one request only).
- Never forward arbitrary bodies/paths to providers; build requests from normalized params. Every user-supplied URL goes through the SSRF guard (`server/guards/url.ts`).
- No feature without: types, a happy-path test, and loading + error states.
- Speech runs in Web Workers; never block the main thread. transformers.js/kokoro-js are imported dynamically inside workers only.
- Prefer small files (<300 lines). Keep functions pure where possible.
- Run `npm run typecheck && npm test` before declaring a task done.
- Commit per task with conventional commit messages.
