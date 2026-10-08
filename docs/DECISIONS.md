# Decisions

- **Next.js 16 + Turbopack + cacheComponents**: route handlers must NOT export
  `runtime`/`dynamic` segment config (incompatible). Node runtime is the
  default — that's what the gateway needs for DNS/SSRF work.
- **Upstream transport**: `node:https` (not `fetch`) so we can pin the
  DNS-resolved IP via `lookup` (anti-rebinding) and never follow redirects.
- **zod v4**: `z.looseObject` for DB row schemas (forward-compatible imports),
  `z.toJSONSchema` for schemaId → prompt schema text.
- **ts-fsrs v5**: `Rating` must be cast to `Grade` for `scheduler.next`.
- **Speech workers**: transformers.js and kokoro-js are imported *dynamically
  inside workers* so the main bundle never contains onnxruntime.
- **`useSearchParams` pages** (writing, speaking) wrapped in `<Suspense>` —
  required for prerendering under cacheComponents.
- **React Compiler lint rules**: no `Date.now()` in component scope — use the
  `now()` helper from `core/db/db`; no setState directly in effect bodies —
  defer via `Promise.resolve().then()`.
- **uuid v14** provides `v7` — used for all row IDs (time-sortable, safe to
  merge across devices).
- **No `next/font/google`** — system fonts, one less build-time dependency.
- **shadcn-style primitives**: minimal local `components/ui/primitives.tsx`
  instead of the full shadcn CLI (fewer deps, same conventions).
- **`vitest.config.mts`** (`.mts`) because package.json has no `"type": "module"`.
