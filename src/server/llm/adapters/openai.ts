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

function buildBody(
  req: AdapterRequest,
  stream: boolean,
  omit: ReadonlySet<string>,
): string {
  const p = req.params ?? {};
  const body: Record<string, unknown> = {
    model: req.provider.model,
    messages: req.messages,
    stream,
  };
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.topP !== undefined) body.top_p = p.topP;
  // Newer OpenAI models want max_completion_tokens; most compatible
  // providers still accept max_tokens. Send both only if needed — prefer
  // max_tokens for widest compatibility.
  if (p.maxTokens !== undefined) body.max_tokens = p.maxTokens;
  if (stream) body.stream_options = { include_usage: true };
  for (const k of omit) delete body[k];
  return JSON.stringify(body);
}

async function* streamEvents(
  stream: NodeJS.ReadableStream,
): AsyncIterable<NormalizedEvent> {
  const parser = new SseLineParser();
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  let doneEmitted = false;
  const done = () => {
    doneEmitted = true;
    return { type: "done", usage } as NormalizedEvent;
  };
  for await (const chunk of stream) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    for (const ev of parser.feed(text)) {
      const data = ev.data.trim();
      if (data === "[DONE]") {
        yield done();
        return;
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error && typeof json.error === "object") {
        const e = json.error as { message?: string };
        yield { type: "error", code: "upstream_error", message: e.message ?? "upstream error" };
        continue;
      }
      const choices = json.choices as { delta?: { content?: string } }[] | undefined;
      const delta = choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield { type: "delta", text: delta };
      }
      const u = json.usage as
        | { prompt_tokens?: number; completion_tokens?: number }
        | undefined;
      if (u) {
        usage = {
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
        };
      }
    }
  }
  if (!doneEmitted) yield done();
}

/** Normalize message content: plain string or OpenAI-style text parts. */
function contentText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && (p as Record<string, unknown>).type === "text"
          ? String((p as Record<string, unknown>).text ?? "")
          : "",
      )
      .join("");
  }
  return undefined;
}

async function chatOnce(
  req: AdapterRequest,
  omit: ReadonlySet<string>,
  boosted = false,
): Promise<AdapterResult> {
  const res = await upstreamRequest({
    validated: req.validated,
    url: upstreamUrl(req.validated.url, "/chat/completions"),
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
      accept: req.stream ? "text/event-stream" : "application/json",
      ...allowedExtraHeaders(req.provider.extraHeaders),
    },
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
      /* keep default msg */
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
  const choice = (
    json.choices as
      | {
          message?: { content?: unknown; refusal?: unknown; reasoning_content?: unknown };
          finish_reason?: string;
        }[]
      | undefined
  )?.[0];
  const msg = choice?.message;
  const refusal = msg?.refusal;
  if (typeof refusal === "string" && refusal) {
    throw new GatewayError("upstream_error", `Provider refused: ${refusal.slice(0, 300)}`, 502);
  }
  const content = contentText(msg?.content);
  if (!content) {
    const finish = choice?.finish_reason;
    // Reasoning models (mimo, o-series, deepseek-r1) burn max_tokens on
    // thinking and return empty content with finish_reason "length" —
    // retry once with a bigger budget.
    const sent = req.params?.maxTokens;
    if (finish === "length" && !boosted && typeof sent === "number" && sent < 16384) {
      return chatOnce(
        { ...req, params: { ...req.params, maxTokens: Math.min(sent * 2, 16384) } },
        omit,
        true,
      );
    }
    const details: string[] = [];
    if (finish) details.push(`finish_reason=${finish}`);
    if (typeof msg?.reasoning_content === "string" && msg.reasoning_content) {
      details.push("reasoning_content only");
    }
    if (!choice) details.push(`body: ${body.slice(0, 160)}`);
    throw new GatewayError(
      "upstream_error",
      `Provider response missing content${details.length ? ` (${details.join("; ")})` : ""}`,
      502,
    );
  }
  const usage = json.usage as
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;
  return {
    kind: "complete",
    text: stripReasoning(content),
    usage: usage
      ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
      : undefined,
  };
}

export const openaiAdapter: Adapter = {
  chat: (req) => chatWithCompat((omit) => chatOnce(req, omit)),

  async listModels({ provider, apiKey, validated, signal }) {
    const res = await upstreamRequest({
      validated,
      url: upstreamUrl(validated.url, "/models"),
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
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
