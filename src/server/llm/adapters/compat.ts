import { GatewayError } from "../errors";

/** Sampling/output params a picky model or proxy may reject outright —
 *  safe to drop and retry without (the provider applies its own default). */
const COMPAT_PARAMS = [
  "temperature",
  "top_p",
  "top_k",
  "stream_options",
  "max_completion_tokens",
  "presence_penalty",
  "frequency_penalty",
  "max_tokens",
] as const;
const COMPAT_SET = new Set<string>(COMPAT_PARAMS);

const REJECT_HINT =
  /deprecated|not supported|unsupported|unknown|unexpected|does not support|not allowed|must be removed|not permitted/i;

/**
 * If `err` is an upstream rejection that names a droppable body param,
 * return its name. e.g. "`temperature` is deprecated for this model",
 * "Unsupported parameter: 'top_p'".
 */
export function rejectedParam(err: unknown): string | undefined {
  if (!(err instanceof GatewayError)) return undefined;
  if (
    err.code === "invalid_key" ||
    err.code === "model_not_found" ||
    err.code === "rate_limited"
  ) {
    return undefined;
  }
  if (!REJECT_HINT.test(err.message)) return undefined;
  for (const m of err.message.matchAll(/[`'"]([a-z_]+)[`'"]/g)) {
    if (COMPAT_SET.has(m[1])) return m[1];
  }
  return COMPAT_PARAMS.find((p) => err.message.includes(p));
}

/**
 * Run `run` and, when the upstream rejects a sampling param, drop it and
 * retry — up to 3 params. Some proxied models (e.g. reasoning-only models)
 * hard-reject `temperature`/`top_p` instead of ignoring them.
 */
export async function chatWithCompat<T>(
  run: (omit: ReadonlySet<string>) => Promise<T>,
): Promise<T> {
  const omit = new Set<string>();
  for (;;) {
    try {
      return await run(omit);
    } catch (err) {
      const param = rejectedParam(err);
      if (!param || omit.has(param) || omit.size >= 3) throw err;
      omit.add(param);
    }
  }
}
