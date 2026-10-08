import { GatewayError } from "../llm/errors";

/** Same-origin check for mutating API calls. */
export function checkOrigin(req: Request): void {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site" && secFetchSite !== "none") {
    throw new GatewayError("bad_request", "Cross-site request rejected", 403);
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const reqHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (reqHost && originHost !== reqHost) {
        throw new GatewayError("bad_request", "Origin mismatch", 403);
      }
    } catch (e) {
      if (e instanceof GatewayError) throw e;
      throw new GatewayError("bad_request", "Invalid Origin header", 403);
    }
  }
}

/** Optional deployment passcode (ACCESS_PASSCODE env). */
export function checkPasscode(req: Request): void {
  const required = process.env.ACCESS_PASSCODE;
  if (!required) return;
  const given = req.headers.get("x-access-passcode");
  if (given !== required) {
    throw new GatewayError("passcode_required", "Valid passcode required", 401);
  }
}

const MAX_BODY_BYTES = 200 * 1024;

export function checkBodySize(req: Request): void {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    throw new GatewayError("bad_request", "Request body too large", 413);
  }
}

export async function readJsonBody(req: Request): Promise<unknown> {
  checkBodySize(req);
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES + 1024) {
    throw new GatewayError("bad_request", "Request body too large", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayError("bad_request", "Body must be valid JSON", 400);
  }
}
