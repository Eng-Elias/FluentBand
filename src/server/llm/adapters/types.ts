import type {
  ChatMessage,
  GatewayErrorCode,
  GenParams,
  ProviderConfig,
  UsageInfo,
} from "@/shared/llm";
import type { ValidatedUrl } from "../../guards/url";

export type AdapterRequest = {
  provider: ProviderConfig;
  apiKey: string;
  messages: ChatMessage[];
  params?: GenParams;
  stream: boolean;
  validated: ValidatedUrl;
  signal?: AbortSignal;
};

export type AdapterResult =
  | { kind: "stream"; events: AsyncIterable<NormalizedEvent> }
  | { kind: "complete"; text: string; usage?: UsageInfo };

export type NormalizedEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage?: UsageInfo }
  | { type: "error"; code: GatewayErrorCode; message: string };

export interface Adapter {
  chat(req: AdapterRequest): Promise<AdapterResult>;
  listModels(req: {
    provider: ProviderConfig;
    apiKey: string;
    validated: ValidatedUrl;
    signal?: AbortSignal;
  }): Promise<string[]>;
}

/** Strip reasoning blocks that some models emit inside content. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

const EXTRA_HEADER_ALLOWLIST = new Set([
  "http-referer",
  "x-title",
  "x-openrouter-provider",
]);

export function allowedExtraHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!extra) return out;
  for (const [k, v] of Object.entries(extra)) {
    const key = k.toLowerCase();
    if (
      allowedExtraHeader(key) &&
      typeof v === "string" &&
      v.length < 500 &&
      !/[\r\n]/.test(v)
    ) {
      out[k] = v;
    }
  }
  return out;
}

function allowedExtraHeader(key: string): boolean {
  if (EXTRA_HEADER_ALLOWLIST.has(key)) return true;
  // never allow auth/host overrides
  if (
    key === "host" ||
    key === "authorization" ||
    key === "x-api-key" ||
    key === "content-length" ||
    key === "connection" ||
    key === "transfer-encoding"
  ) {
    return false;
  }
  return key.startsWith("x-") && !key.includes("key") && !key.includes("auth");
}
