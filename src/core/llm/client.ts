import type {
  ChatMessage,
  ChatRequest,
  GatewayErrorBody,
  GatewayErrorCode,
  GenParams,
  ModelsResult,
  ProviderConfig,
  SseEvent,
  TestResult,
  UsageInfo,
} from "@/shared/llm";
import type { SchemaId } from "@/shared/schemas";
import { getSchema } from "@/shared/schemas";

export class LlmClientError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmClientError";
  }
}

async function throwOnError(res: Response): Promise<void> {
  if (res.ok) return;
  let body: GatewayErrorBody | undefined;
  try {
    body = await res.json();
  } catch {
    /* fall through */
  }
  const code = body?.error?.code ?? "upstream_error";
  throw new LlmClientError(
    code,
    body?.error?.message ?? `Request failed (${res.status})`,
    body?.error?.retryAfterMs,
  );
}

function headers(apiKey: string, passcode?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) h["x-llm-api-key"] = apiKey;
  if (passcode) h["x-access-passcode"] = passcode;
  return h;
}

export interface LlmClientOpts {
  apiKey: string;
  passcode?: string;
  signal?: AbortSignal;
}

/** Non-streaming chat. */
export async function chat(
  provider: ProviderConfig,
  messages: ChatMessage[],
  params: GenParams | undefined,
  opts: LlmClientOpts,
): Promise<{ text: string; usage?: UsageInfo }> {
  const body: ChatRequest = { provider, messages, params, stream: false };
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: headers(opts.apiKey, opts.passcode),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  await throwOnError(res);
  return res.json();
}

/** Streaming chat: yields normalized SSE events. */
export async function* chatStream(
  provider: ProviderConfig,
  messages: ChatMessage[],
  params: GenParams | undefined,
  opts: LlmClientOpts,
): AsyncGenerator<SseEvent> {
  const body: ChatRequest = { provider, messages, params, stream: true };
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: headers(opts.apiKey, opts.passcode),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  await throwOnError(res);
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const rawEvent = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            yield JSON.parse(line.slice(5).trim()) as SseEvent;
          } catch {
            /* ignore malformed */
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Structured output with browser-side re-validation. */
export async function json<T>(
  provider: ProviderConfig,
  schemaId: SchemaId,
  messages: ChatMessage[],
  params: GenParams | undefined,
  opts: LlmClientOpts,
): Promise<{ data: T; usage?: UsageInfo }> {
  const res = await fetch("/api/llm/json", {
    method: "POST",
    headers: headers(opts.apiKey, opts.passcode),
    body: JSON.stringify({ provider, messages, params, schemaId }),
    signal: opts.signal,
  });
  await throwOnError(res);
  const body = (await res.json()) as { data: unknown; usage?: UsageInfo };
  // Defense in depth: re-validate in the browser with the same schema.
  const schema = getSchema(schemaId);
  if (schema) {
    const check = schema.safeParse(body.data);
    if (!check.success) {
      throw new LlmClientError(
        "invalid_json_after_retry",
        "Response failed local schema validation",
      );
    }
    return { data: check.data as T, usage: body.usage };
  }
  return { data: body.data as T, usage: body.usage };
}

export async function testConnection(
  provider: ProviderConfig,
  opts: LlmClientOpts,
): Promise<TestResult> {
  const res = await fetch("/api/llm/test", {
    method: "POST",
    headers: headers(opts.apiKey, opts.passcode),
    body: JSON.stringify({ provider }),
    signal: opts.signal,
  });
  await throwOnError(res);
  return res.json();
}

export async function listModels(
  provider: ProviderConfig,
  opts: LlmClientOpts,
): Promise<ModelsResult> {
  const res = await fetch("/api/llm/models", {
    method: "POST",
    headers: headers(opts.apiKey, opts.passcode),
    body: JSON.stringify({ provider }),
    signal: opts.signal,
  });
  await throwOnError(res);
  return res.json();
}

export async function healthz(): Promise<boolean> {
  try {
    const res = await fetch("/api/healthz", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
