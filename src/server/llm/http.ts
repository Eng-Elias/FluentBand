import http from "node:http";
import https from "node:https";
import type { ValidatedUrl } from "../guards/url";
import { GatewayError } from "./errors";

export type UpstreamResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  stream: NodeJS.ReadableStream;
};

/**
 * HTTPS request to a pre-validated upstream. The hostname is resolved once by
 * the SSRF guard and the connection is pinned to that exact IP via a custom
 * `lookup` (anti DNS-rebinding). Redirects are never followed.
 */
export function upstreamRequest(opts: {
  validated: ValidatedUrl;
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<UpstreamResponse> {
  const { validated, url, method, headers, body, signal, timeoutMs } = opts;
  const isHttps = validated.url.protocol === "https:";
  const mod = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method,
        headers,
        servername: isHttps ? validated.url.hostname : undefined,
        lookup: (
          _hostname: string,
          _opts: object,
          cb: (err: Error | null, address: string, family: number) => void,
        ) => cb(null, validated.pinnedAddress, validated.family),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      (res) => {
        clearTimeout(timer);
        // Redirects are never followed — re-validation per hop would be
        // required, and a legit provider endpoint should not redirect POSTs.
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          reject(
            new GatewayError(
              "bad_base_url",
              `Upstream attempted a redirect (${res.statusCode}) — check the base URL`,
            ),
          );
          return;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error("timeout"));
    }, timeoutMs);

    const onAbort = () => req.destroy(new Error("aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });

    req.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (err.message === "timeout") {
        reject(new GatewayError("upstream_timeout", "Provider request timed out", 504));
      } else if (err.message === "aborted") {
        reject(err);
      } else {
        reject(
          new GatewayError("bad_base_url", `Cannot reach provider: ${err.message}`, 502),
        );
      }
    });
    req.on("close", () => signal?.removeEventListener("abort", onAbort));

    if (body) req.write(body);
    req.end();
  });
}

export async function readBody(
  stream: NodeJS.ReadableStream,
  maxBytes = 4 * 1024 * 1024,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new GatewayError("upstream_error", "Upstream response too large", 502);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Incremental SSE line parser shared by both adapters. */
export class SseLineParser {
  private buf = "";
  private handlers: { event?: string; data: string[] } = this.fresh();

  private fresh() {
    return { event: undefined as string | undefined, data: [] as string[] };
  }

  /** Feed a chunk; returns completed events. */
  feed(chunk: string): { event?: string; data: string }[] {
    this.buf += chunk;
    const out: { event?: string; data: string }[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      let line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        if (this.handlers.data.length > 0) {
          out.push({ event: this.handlers.event, data: this.handlers.data.join("\n") });
        }
        this.handlers = this.fresh();
        continue;
      }
      if (line.startsWith(":")) continue; // comment / keep-alive
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") this.handlers.event = value;
      else if (field === "data") this.handlers.data.push(value);
    }
    return out;
  }

  flush(): { event?: string; data: string }[] {
    const out: { event?: string; data: string }[] = [];
    if (this.handlers.data.length > 0) {
      out.push({ event: this.handlers.event, data: this.handlers.data.join("\n") });
    }
    this.handlers = this.fresh();
    return out;
  }
}
