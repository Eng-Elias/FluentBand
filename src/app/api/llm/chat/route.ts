import { chatRequestSchema } from "@/shared/llm";
import { checkOrigin, checkPasscode, readJsonBody } from "@/server/guards/origin";
import { acquireSlot, rateLimit } from "@/server/guards/ratelimit";
import { chatCompletion, sseResponse } from "@/server/llm/gateway";
import { GatewayError } from "@/server/llm/errors";

export async function POST(req: Request) {
  const release = acquireSlot();
  try {
    checkOrigin(req);
    checkPasscode(req);
    rateLimit(req);
    const body = chatRequestSchema.parse(await readJsonBody(req));
    const apiKey = req.headers.get("x-llm-api-key");
    const result = await chatCompletion(body, apiKey, req.signal);
    if (result.kind === "stream") {
      return sseResponse(result.events, req.signal);
    }
    return Response.json({ text: result.text, usage: result.usage });
  } catch (e) {
    if (e instanceof GatewayError) return e.toResponse();
    if ((e as Error).name === "ZodError") {
      return new GatewayError("bad_request", "Invalid request shape", 400).toResponse();
    }
    if ((e as Error).message === "aborted") {
      return new Response(null, { status: 499 });
    }
    return new GatewayError("upstream_error", "Unexpected gateway error", 502).toResponse();
  } finally {
    release();
  }
}
