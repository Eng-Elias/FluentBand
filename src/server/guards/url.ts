import dns from "node:dns/promises";
import net from "node:net";
import { GatewayError } from "../llm/errors";

// Read dynamically so tests/deployments can toggle per-process.
function allowPrivate(): boolean {
  return process.env.ALLOW_PRIVATE_HOSTS === "true";
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast / reserved
  );
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(s)) return true; // ULA fc00::/7
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

export type ValidatedUrl = {
  url: URL;
  pinnedAddress: string;
  family: 4 | 6;
};

/**
 * Validates a user-supplied provider base URL and resolves DNS once,
 * returning a pinned IP that the transport must connect to (anti
 * DNS-rebinding). Throws GatewayError('blocked_url' | 'bad_base_url').
 */
export async function validateBaseUrl(raw: string): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GatewayError("bad_base_url", "Base URL is not a valid URL");
  }

  if (url.username || url.password) {
    throw new GatewayError("bad_base_url", "Base URL must not contain credentials");
  }

  const isHttp = url.protocol === "http:";
  const isHttps = url.protocol === "https:";
  if (!isHttps && !(isHttp && allowPrivate())) {
    throw new GatewayError(
      "bad_base_url",
      isHttp
        ? "http:// base URLs require ALLOW_PRIVATE_HOSTS=true (self-host mode)"
        : "Only https:// base URLs are allowed",
    );
  }

  if (isHttp && !allowPrivate()) {
    throw new GatewayError("bad_base_url", "Only https:// base URLs are allowed");
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new GatewayError("bad_base_url", `Cannot resolve host: ${url.hostname}`);
  }
  if (addresses.length === 0) {
    throw new GatewayError("bad_base_url", `Cannot resolve host: ${url.hostname}`);
  }

  const bad = addresses.filter((a) => isPrivateAddress(a.address));
  if (!allowPrivate() && bad.length > 0) {
    throw new GatewayError(
      "blocked_url",
      "Base URL resolves to a private or reserved address",
    );
  }

  const chosen = allowPrivate()
    ? addresses[0]
    : addresses.find((a) => !isPrivateAddress(a.address));
  if (!chosen) {
    throw new GatewayError("blocked_url", "No usable address for base URL host");
  }
  return {
    url,
    pinnedAddress: chosen.address,
    family: chosen.family === 6 ? 6 : 4,
  };
}

/** Fixed upstream paths — the only paths the gateway will ever request. */
export function upstreamUrl(base: URL, path: string): string {
  const prefix = base.pathname.replace(/\/+$/, "");
  return `${base.origin}${prefix}${path}`;
}
