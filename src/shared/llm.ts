import { z } from "zod";

// ---- Provider + request envelope (shared by browser client and server) ----

export const providerKindSchema = z.enum(["openai", "anthropic"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerConfigSchema = z.object({
  kind: providerKindSchema,
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const genParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(32000).optional(),
  topP: z.number().min(0).max(1).optional(),
});
export type GenParams = z.infer<typeof genParamsSchema>;

export const chatRequestSchema = z.object({
  provider: providerConfigSchema,
  params: genParamsSchema.optional(),
  messages: z.array(chatMessageSchema).min(1),
  stream: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const jsonRequestSchema = z.object({
  provider: providerConfigSchema,
  params: genParamsSchema.optional(),
  messages: z.array(chatMessageSchema).min(1),
  schemaId: z.string().min(1),
});
export type JsonRequest = z.infer<typeof jsonRequestSchema>;

export const testRequestSchema = z.object({
  provider: providerConfigSchema,
});
export type TestRequest = z.infer<typeof testRequestSchema>;

export const modelsRequestSchema = z.object({
  provider: providerConfigSchema,
});
export type ModelsRequest = z.infer<typeof modelsRequestSchema>;

// ---- Normalized SSE events emitted by every adapter ----

export type UsageInfo = {
  inputTokens?: number;
  outputTokens?: number;
};

export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage?: UsageInfo }
  | { type: "error"; code: GatewayErrorCode; message: string };

// ---- Typed gateway errors ----

export const gatewayErrorCodes = [
  "invalid_key",
  "rate_limited",
  "model_not_found",
  "bad_base_url",
  "blocked_url",
  "upstream_timeout",
  "invalid_json_after_retry",
  "gateway_busy",
  "bad_request",
  "passcode_required",
  "upstream_error",
] as const;
export type GatewayErrorCode = (typeof gatewayErrorCodes)[number];

export type GatewayErrorBody = {
  error: { code: GatewayErrorCode; message: string; retryAfterMs?: number };
};

export type TestResult = {
  ok: boolean;
  latencyMs: number;
  model?: string;
  jsonModeReliable?: boolean;
  error?: { code: GatewayErrorCode; message: string };
};

export type ModelsResult = { models: string[] };
