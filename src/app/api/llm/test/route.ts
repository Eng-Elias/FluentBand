import { testRequestSchema } from "@/shared/llm";
import { checkOrigin, checkPasscode, readJsonBody } from "@/server/guards/origin";
import { acquireSlot, rateLimit } from "@/server/guards/ratelimit";
import { testConnection } from "@/server/llm/gateway";
import { GatewayError } from "@/server/llm/errors";

export async function POST(req: Request) {
  const release = acquireSlot();
  try {
    checkOrigin(req);
    checkPasscode(req);
    rateLimit(req);
    const body = testRequestSchema.parse(await readJsonBody(req));
    const apiKey = req.headers.get("x-llm-api-key");
    const result = await testConnection(body, apiKey, req.signal);
    return Response.json(result);
  } catch (e) {
    if (e instanceof GatewayError) return e.toResponse();
    if ((e as Error).name === "ZodError") {
      return new GatewayError("bad_request", "Invalid request shape", 400).toResponse();
    }
    return new GatewayError("upstream_error", "Unexpected gateway error", 502).toResponse();
  } finally {
    release();
  }
}
