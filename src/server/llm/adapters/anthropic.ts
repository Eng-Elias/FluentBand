import { upstreamRequest, readBody, SseLineParser } from "../http";
import { upstreamUrl } from "../../guards/url";
import { GatewayError, statusToCode } from "../errors";
import {
  allowedExtraHeaders,
  stripReasoning,
  type Adapter,
  type AdapterRequest,
  type AdapterResult,
  type NormalizedEvent,
} from "./types";
import { chatWithCompat } from "./compat";

const DEFAULT_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";

function buildBody(
  req: AdapterRequest,
  stream: boolean,
  omit: ReadonlySet<string>,
): string {
  const p = req.params ?? {};
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const body: Record<string, unknown> = {
    model: req.provider.model,
    max_tokens: p.maxTokens ?? 4096, // required by Anthropic
    messages,
    stream,
  };
  if (system) body.system = system;
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.topP !== undefined) body.top_p = p.topP;
  for (const k of omit) delete body[k];
  return JSON.stringify(body);
}

function headers(req: AdapterRequest): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": req.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    accept: req.stream ? "text/event-stream" : "application/json",
    ...allowedExtraHeaders(req.provider.extraHeaders),
  };
}

async function* streamEvents(
  stream: NodeJS.ReadableStream,
): AsyncIterable<NormalizedEvent> {
  const parser = new SseLineParser();
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for await (const chunk of stream) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    for (const ev of parser.feed(text)) {
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(ev.data);
      } catch {
        continue;
      }
      const t = json.type as string | undefined;
      if (t === "content_block_delta") {
        const delta = json.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "delta", text: delta.text };
        }
      } else if (t === "message_start") {
        const msg = json.message as { usage?: { input_tokens?: number } } | undefined;
        inputTokens = msg?.usage?.input_tokens ?? inputTokens;
      } else if (t === "message_delta") {
        const usage = json.usage as { output_tokens?: number } | undefined;
        outputTokens = usage?.output_tokens ?? outputTokens;
      } else if (t === "message_stop") {
        yield { type: "done", usage: { inputTokens, outputTokens } };
      } else if (t === "error") {
        const e = json.error as { message?: string } | undefined;
        yield { type: "error", code: "upstream_error", message: e?.message ?? "upstream error" };
      }
    }
  }
}

async function chatOnce(
  req: AdapterRequest,
  omit: ReadonlySet<string>,
  boosted = false,
): Promise<AdapterResult> {
  const res = await upstreamRequest({
    validated: req.validated,
    url: upstreamUrl(req.validated.url, "/messages"),
    method: "POST",
    headers: headers(req),
    body: buildBody(req, req.stream, omit),
    signal: req.signal,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  if (res.status < 200 || res.status >= 300) {
    const body = await readBody(res.stream, 512 * 1024).catch(() => "");
    let msg = `Provider returned HTTP ${res.status}`;
    try {
      const j = JSON.parse(body);
      msg = j?.error?.message ?? msg;
    } catch {
      /* keep default */
    }
    const retryAfter = Number(res.headers["retry-after"]) * 1000 || undefined;
    throw new GatewayError(statusToCode(res.status), msg, res.status === 429 ? 429 : 502, retryAfter);
  }

  if (req.stream) {
    return { kind: "stream", events: streamEvents(res.stream) };
  }
  const body = await readBody(res.stream);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    throw new GatewayError("upstream_error", "Provider returned non-JSON", 502);
  }
  const content = json.content as { type?: string; text?: string }[] | undefined;
  const text = (content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("");
  if (!text) {
    const stop = json.stop_reason as string | undefined;
    // If the model exhausted max_tokens (e.g. thinking models), retry once
    // with a bigger budget.
    const sent = req.params?.maxTokens ?? 4096;
    if (stop === "max_tokens" && !boosted && sent < 16384) {
      return chatOnce(
        { ...req, params: { ...req.params, maxTokens: Math.min(sent * 2, 16384) } },
        omit,
        true,
      );
    }
    throw new GatewayError(
      "upstream_error",
      `Provider response missing content${stop ? ` (stop_reason=${stop})` : ""}`,
      502,
    );
  }
  const usage = json.usage as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  return {
    kind: "complete",
    text: stripReasoning(text),
    usage: usage
      ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
      : undefined,
  };
}

export const anthropicAdapter: Adapter = {
  chat: (req) => chatWithCompat((omit) => chatOnce(req, omit)),

  async listModels({ provider, apiKey, validated, signal }) {
    const res = await upstreamRequest({
      validated,
      url: upstreamUrl(validated.url, "/models"),
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        accept: "application/json",
        ...allowedExtraHeaders(provider.extraHeaders),
      },
      signal,
      timeoutMs: 30_000,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new GatewayError(statusToCode(res.status), `Models list failed (${res.status})`, 502);
    }
    const body = await readBody(res.stream);
    try {
      const json = JSON.parse(body);
      const data = json.data as { id?: string }[] | undefined;
      return (data ?? []).map((m) => m.id).filter((x): x is string => !!x);
    } catch {
      return [];
    }
  },
};
