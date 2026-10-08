import type { GatewayErrorBody, GatewayErrorCode } from "@/shared/llm";

export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
    public status = 400,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }

  toResponse(): Response {
    const body: GatewayErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        retryAfterMs: this.retryAfterMs,
      },
    };
    return Response.json(body, {
      status: this.status,
      headers: this.retryAfterMs
        ? { "Retry-After": String(Math.ceil(this.retryAfterMs / 1000)) }
        : undefined,
    });
  }
}

export function statusToCode(status: number): GatewayErrorCode {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}
