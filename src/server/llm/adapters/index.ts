import type { ProviderConfig } from "@/shared/llm";
import type { Adapter } from "./types";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";

export function getAdapter(provider: ProviderConfig): Adapter {
  return provider.kind === "anthropic" ? anthropicAdapter : openaiAdapter;
}
