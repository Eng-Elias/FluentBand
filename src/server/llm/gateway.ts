import type {
  ChatRequest,
  JsonRequest,
  ModelsRequest,
  SseEvent,
  TestRequest,
  TestResult,
  UsageInfo,
} from "@/shared/llm";
import { getSchema, schemaToJsonSchema, type SchemaId, SCHEMA_REGISTRY } from "@/shared/schemas";
import { validateBaseUrl } from "../guards/url";
import { getAdapter } from "./adapters";
import { GatewayError } from "./errors";
import { extractJson } from "./json-repair";

function defaultProviderFromEnv() {
  const kind = process.env.DEFAULT_PROVIDER_KIND;
  const baseUrl = process.env.DEFAULT_PROVIDER_BASE_URL;
  const apiKey = process.env.DEFAULT_PROVIDER_API_KEY;
  const model = process.env.DEFAULT_PROVIDER_MODEL;
  if (!kind || !baseUrl || !apiKey || !model) return undefined;
  if (kind !== "openai" && kind !== "anthropic") return undefined;
  return { provider: { kind, baseUrl, model }, apiKey };
}

function resolveKey(headerKey: string | null): string {
  if (headerKey && headerKey.length > 0 && headerKey.length <= 512) {
    return headerKey;
  }
  const env = defaultProviderFromEnv();
  if (env) return env.apiKey;
  throw new GatewayError("invalid_key", "Missing x-llm-api-key header", 401);
}

/** Streaming chat: returns normalized SSE events as an async iterable. */
export async function chatCompletion(
  req: ChatRequest,
  apiKeyHeader: string | null,
  signal?: AbortSignal,
) {
  const apiKey = resolveKey(apiKeyHeader);
  const validated = await validateBaseUrl(req.provider.baseUrl);
  const adapter = getAdapter(req.provider);
  return adapter.chat({
    provider: req.provider,
    apiKey,
    messages: req.messages,
    params: req.params,
    stream: req.stream ?? false,
    validated,
    signal,
  });
}

/** Structured output: call → extract → Zod validate → one repair retry. */
export async function jsonCompletion(
  req: JsonRequest,
  apiKeyHeader: string | null,
  signal?: AbortSignal,
): Promise<{ data: unknown; usage?: UsageInfo; attempts: number }> {
  const schema = getSchema(req.schemaId);
  if (!schema) {
    throw new GatewayError("bad_request", `Unknown schemaId: ${req.schemaId}`, 400);
  }
  const apiKey = resolveKey(apiKeyHeader);
  const validated = await validateBaseUrl(req.provider.baseUrl);
  const adapter = getAdapter(req.provider);

  const jsonSchemaText = JSON.stringify(
    schemaToJsonSchema(req.schemaId as SchemaId),
  );
  const schemaInstruction = {
    role: "user" as const,
    content:
      "Respond with ONLY a JSON object matching this JSON Schema. " +
      "No markdown fences, no commentary, no reasoning outside the JSON.\n\n" +
      jsonSchemaText,
  };

  const messages = [...req.messages, schemaInstruction];
  const params = { temperature: 0.3, ...req.params };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await adapter.chat({
      provider: req.provider,
      apiKey,
      messages,
      params,
      stream: false,
      validated,
      signal,
    });
    if (res.kind !== "complete") {
      throw new GatewayError("upstream_error", "Unexpected stream result", 502);
    }
    const parsed = extractJson(res.text);
    if (parsed !== undefined) {
      const check = schema.safeParse(parsed);
      if (check.success) {
        return { data: check.data, usage: res.usage, attempts: attempt };
      }
      if (attempt === 1) {
        messages.push({
          role: "user",
          content:
            "Your previous response failed validation. Return corrected JSON " +
            "matching the schema exactly. Errors: " +
            check.error.issues
              .slice(0, 8)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
        });
        continue;
      }
      throw new GatewayError(
        "invalid_json_after_retry",
        "Model output did not match schema after retry",
        502,
      );
    }
    if (attempt === 1) {
      messages.push({
        role: "user",
        content:
          "Your previous response was not valid JSON. Respond with ONLY the JSON object, no other text.",
      });
      continue;
    }
    throw new GatewayError(
      "invalid_json_after_retry",
      "Model did not return parseable JSON after retry",
      502,
    );
  }
  throw new GatewayError("invalid_json_after_retry", "Unreachable", 500);
}

/** Test connection: reachability + latency + model check + JSON reliability. */
export async function testConnection(
  req: TestRequest,
  apiKeyHeader: string | null,
  signal?: AbortSignal,
): Promise<TestResult> {
  const started = Date.now();
  const apiKey = resolveKey(apiKeyHeader);
  try {
    const validated = await validateBaseUrl(req.provider.baseUrl);
    const adapter = getAdapter(req.provider);

    // 1. simple completion
    const res = await adapter.chat({
      provider: req.provider,
      apiKey,
      messages: [
        { role: "user", content: "Reply with exactly: ok" },
      ],
      params: { maxTokens: 8, temperature: 0 },
      stream: false,
      validated,
      signal,
    });
    if (res.kind !== "complete") throw new Error("unexpected");
    const latencyMs = Date.now() - started;

    // 2. JSON reliability probe
    let jsonModeReliable = false;
    try {
      const probe = await adapter.chat({
        provider: req.provider,
        apiKey,
        messages: [
          {
            role: "user",
            content: 'Respond with ONLY this JSON: {"ok":true}',
          },
        ],
        params: { maxTokens: 30, temperature: 0 },
        stream: false,
        validated,
        signal,
      });
      if (probe.kind === "complete") {
        const parsed = extractJson(probe.text);
        jsonModeReliable =
          !!parsed && typeof parsed === "object" && (parsed as { ok?: boolean }).ok === true;
      }
    } catch {
      jsonModeReliable = false;
    }

    return {
      ok: true,
      latencyMs,
      model: req.provider.model,
      jsonModeReliable,
    };
  } catch (e) {
    if (e instanceof GatewayError) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: { code: e.code, message: e.message },
      };
    }
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: { code: "upstream_error", message: (e as Error).message },
    };
  }
}

export async function listModels(
  req: ModelsRequest,
  apiKeyHeader: string | null,
  signal?: AbortSignal,
) {
  const apiKey = resolveKey(apiKeyHeader);
  const validated = await validateBaseUrl(req.provider.baseUrl);
  const adapter = getAdapter(req.provider);
  return adapter.listModels({
    provider: req.provider,
    apiKey,
    validated,
    signal,
  });
}

/** Encode normalized events as an SSE ReadableStream with keep-alives. */
export function sseResponse(
  events: AsyncIterable<SseEvent>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: SseEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          /* closed */
        }
      }, 15_000);
      const onAbort = () => {
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          /* noop */
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        for await (const ev of events) {
          send(ev as SseEvent);
          if (ev.type === "done" || ev.type === "error") break;
        }
      } catch (e) {
        const err =
          e instanceof GatewayError
            ? e
            : new GatewayError("upstream_error", (e as Error).message, 502);
        send({ type: "error", code: err.code, message: err.message });
      } finally {
        clearInterval(keepAlive);
        signal?.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      }
    },
    cancel() {
      clearInterval(keepAlive);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export function listSchemaIds(): string[] {
  return Object.keys(SCHEMA_REGISTRY);
}
