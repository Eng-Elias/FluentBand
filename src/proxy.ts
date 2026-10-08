import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Content Security Policy.
 *
 * Note: this app's pages are statically prerendered, so a per-request nonce
 * cannot be embedded in the HTML — 'unsafe-inline' on script-src is required
 * for Next's bootstrap scripts. The meaningful protections remain: scripts
 * only from this origin, no objects, no framing, WASM eval only where needed,
 * and connect-src restricted to self + model CDNs + localhost speech servers.
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""};
    worker-src 'self' blob:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    media-src 'self' blob:;
    connect-src 'self' https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co https://*.cdn-lfs.hf.co https://cdn.jsdelivr.net https://*.jsdelivr.net https://cas-bridge.xethub.hf.co https://*.xethub.hf.co http://localhost:* http://127.0.0.1:*${isDev ? " ws:" : ""};
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const response = NextResponse.next({ request });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "microphone=(self)");
  return response;
}

export const config = {
  matcher: [
    // all pages except static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|wasm|onnx|onnx_data)$).*)",
  ],
};
