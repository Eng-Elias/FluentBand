import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { validateBaseUrl } from "@/server/guards/url";
import { openaiAdapter } from "@/server/llm/adapters/openai";
import { anthropicAdapter } from "@/server/llm/adapters/anthropic";

/** Real local HTTP server as mock upstream (http + private IP, exercises the transport). */
let server: http.Server;
let base: string;
let lastBody = "";
let mode: "openai" | "anthropic" | "sse-openai" | "sse-anthropic" = "openai";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      lastBody = Buffer.concat(chunks).toString();
      if (req.url?.endsWith("/models")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }));
        return;
      }
      if (mode === "openai") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "hello back" } }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          }),
        );
      } else if (mode === "anthropic") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            content: [{ type: "text", text: "hi there" }],
            usage: { input_tokens: 4, output_tokens: 2 },
          }),
        );
      } else if (mode === "sse-openai") {
        res.setHeader("content-type", "text/event-stream");
        res.end(
          'data: {"choices":[{"delta":{"content":"he"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n' +
            'data: {"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n' +
            "data: [DONE]\n\n",
        );
      } else {
        res.setHeader("content-type", "text/event-stream");
        res.end(
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}\n\n' +
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const validated = () =>
  Promise.resolve({
    url: new URL(base + "/v1"),
    pinnedAddress: "127.0.0.1",
    family: 4 as const,
  });

describe("adapters", () => {
  it("openai: non-stream completes", async () => {
    mode = "openai";
    const res = await openaiAdapter.chat({
      provider: { kind: "openai", baseUrl: base + "/v1", model: "m" },
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
      params: {},
      stream: false,
      validated: await validated(),
    });
    expect(res.kind).toBe("complete");
    if (res.kind === "complete") {
      expect(res.text).toBe("hello back");
      expect(res.usage?.inputTokens).toBe(3);
    }
    const sent = JSON.parse(lastBody);
    expect(sent.model).toBe("m");
    expect(sent.stream).toBe(false);
  });

  it("openai: stream yields normalized deltas", async () => {
    mode = "sse-openai";
    const res = await openaiAdapter.chat({
      provider: { kind: "openai", baseUrl: base + "/v1", model: "m" },
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
      params: {},
      stream: true,
      validated: await validated(),
    });
    expect(res.kind).toBe("stream");
    let text = "";
    let done = false;
    if (res.kind === "stream") {
      for await (const ev of res.events) {
        if (ev.type === "delta") text += ev.text;
        if (ev.type === "done") {
          done = true;
          expect(ev.usage?.outputTokens).toBe(2);
        }
      }
    }
    expect(text).toBe("hello");
    expect(done).toBe(true);
  });

  it("anthropic: non-stream completes; system extracted; max_tokens set", async () => {
    mode = "anthropic";
    const res = await anthropicAdapter.chat({
      provider: { kind: "anthropic", baseUrl: base + "/v1", model: "claude" },
      apiKey: "k",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
      params: { maxTokens: 100 },
      stream: false,
      validated: await validated(),
    });
    expect(res.kind).toBe("complete");
    if (res.kind === "complete") expect(res.text).toBe("hi there");
    const sent = JSON.parse(lastBody);
    expect(sent.system).toBe("be terse");
    expect(sent.max_tokens).toBe(100);
    expect(sent.messages.every((m: { role: string }) => m.role !== "system")).toBe(true);
  });

  it("anthropic: stream parses content_block_delta", async () => {
    mode = "sse-anthropic";
    const res = await anthropicAdapter.chat({
      provider: { kind: "anthropic", baseUrl: base + "/v1", model: "c" },
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
      params: {},
      stream: true,
      validated: await validated(),
    });
    let text = "";
    if (res.kind === "stream") {
      for await (const ev of res.events) {
        if (ev.type === "delta") text += ev.text;
      }
    }
    expect(text).toBe("yo");
  });

  it("openai: listModels", async () => {
    const models = await openaiAdapter.listModels({
      provider: { kind: "openai", baseUrl: base + "/v1", model: "m" },
      apiKey: "k",
      validated: await validated(),
    });
    expect(models).toEqual(["m1", "m2"]);
  });
});

describe("ssrf guard", () => {
  it("rejects http without ALLOW_PRIVATE_HOSTS", async () => {
    delete process.env.ALLOW_PRIVATE_HOSTS;
    await expect(validateBaseUrl("http://example.com")).rejects.toThrow(
      /https|ALLOW_PRIVATE_HOSTS/,
    );
  });

  it("rejects userinfo", async () => {
    await expect(
      validateBaseUrl("https://user:pass@api.example.com"),
    ).rejects.toThrow();
  });

  it("rejects private-resolving hosts (https://localhost)", async () => {
    delete process.env.ALLOW_PRIVATE_HOSTS;
    await expect(validateBaseUrl("https://localhost")).rejects.toThrow();
  });

  it("allows private hosts in self-host mode", async () => {
    process.env.ALLOW_PRIVATE_HOSTS = "true";
    const v = await validateBaseUrl("http://127.0.0.1:11434/v1");
    expect(v.pinnedAddress).toBe("127.0.0.1");
    delete process.env.ALLOW_PRIVATE_HOSTS;
  });

  it("rejects invalid URL", async () => {
    await expect(validateBaseUrl("not a url")).rejects.toThrow();
  });
});
