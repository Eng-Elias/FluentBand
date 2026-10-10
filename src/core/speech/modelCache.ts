/**
 * Inspect/mutate the transformers.js browser model cache (Cache API,
 * cache name "transformers-cache"). Requests are keyed by full URL like
 * https://huggingface.co/<modelId>/resolve/main/<file>.
 */
export const HF_CACHE_NAME = "transformers-cache";

export const MODEL_IDS = {
  tts: "onnx-community/Kokoro-82M-v1.0-ONNX",
  stt: (whisperModel: "tiny.en" | "base.en") =>
    `onnx-community/whisper-${whisperModel}`,
} as const;

export interface ModelCacheInfo {
  files: number;
  bytes: number;
  /** true when at least one weights file is cached (not just configs) */
  hasWeights: boolean;
}

async function matchingRequests(modelId: string): Promise<Request[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(HF_CACHE_NAME);
  const keys = await cache.keys();
  return keys.filter((r) => r.url.includes(`/${modelId}/`));
}

export async function modelCacheInfo(modelId: string): Promise<ModelCacheInfo> {
  const reqs = await matchingRequests(modelId);
  const cache = await caches.open(HF_CACHE_NAME);
  let bytes = 0;
  let hasWeights = false;
  for (const r of reqs) {
    if (/\.onnx(\?|$)|onnx_data|\.safetensors(\?|$)/i.test(r.url)) hasWeights = true;
    const res = await cache.match(r);
    if (res) bytes += (await res.blob()).size;
  }
  return { files: reqs.length, bytes, hasWeights };
}

/** "Installed" = the weights file(s) are present in the cache. */
export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const info = await modelCacheInfo(modelId);
  return info.hasWeights;
}

/** Remove a model's cached files so the next load re-downloads them. */
export async function clearModelCache(modelId: string): Promise<number> {
  const reqs = await matchingRequests(modelId);
  const cache = await caches.open(HF_CACHE_NAME);
  let n = 0;
  for (const r of reqs) {
    if (await cache.delete(r)) n++;
  }
  return n;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
