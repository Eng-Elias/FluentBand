import { GatewayError } from "../llm/errors";

type Bucket = { tokens: number; ts: number };

const buckets = new Map<string, Bucket>();
const RATE = 30; // requests
const WINDOW_MS = 60_000;
const MAX_CONCURRENT = 8;
let inFlight = 0;

// Periodic cleanup so the map doesn't grow forever on a long-lived server.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now - b.ts > WINDOW_MS * 5) buckets.delete(k);
  }
}, 60_000).unref?.();

export function rateLimit(req: Request): void {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: RATE, ts: now };
  const refill = ((now - b.ts) / WINDOW_MS) * RATE;
  b.tokens = Math.min(RATE, b.tokens + refill);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    throw new GatewayError("rate_limited", "Too many requests", 429, 10_000);
  }
  b.tokens -= 1;
  buckets.set(ip, b);
}

export function acquireSlot(): () => void {
  if (inFlight >= MAX_CONCURRENT) {
    throw new GatewayError("gateway_busy", "Server is busy, retry shortly", 503, 5000);
  }
  inFlight += 1;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      inFlight -= 1;
    }
  };
}
