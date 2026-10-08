/**
 * Whisper STT worker. Loads @huggingface/transformers lazily inside the
 * worker so the main bundle never includes onnxruntime.
 */

type LoadMsg = { type: "load"; model: "tiny.en" | "base.en" };
type TranscribeMsg = { type: "transcribe"; audio: Float32Array };
type InMsg = LoadMsg | TranscribeMsg;

export type OutMsg =
  | { type: "progress"; loaded: number; total: number; file?: string }
  | { type: "ready" }
  | {
      type: "result";
      text: string;
      words: { text: string; start: number; end: number }[];
    }
  | { type: "error"; message: string };

const MODELS: Record<string, string> = {
  "tiny.en": "onnx-community/whisper-tiny.en",
  "base.en": "onnx-community/whisper-base.en",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any;

function post(m: OutMsg) {
  (self as unknown as Worker).postMessage(m);
}

async function load(model: "tiny.en" | "base.en") {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  transcriber = await pipeline(
    "automatic-speech-recognition",
    MODELS[model],
    {
      dtype: "q4",
      device: "wasm",
      progress_callback: (p: {
        status?: string;
        loaded?: number;
        total?: number;
        file?: string;
      }) => {
        if (p.status === "progress") {
          post({
            type: "progress",
            loaded: p.loaded ?? 0,
            total: p.total ?? 0,
            file: p.file,
          });
        }
      },
    },
  );
  post({ type: "ready" });
}

async function transcribe(audio: Float32Array) {
  if (!transcriber) throw new Error("Model not loaded");
  const out = await transcriber(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    language: "en",
    task: "transcribe",
  });
  const chunks = (out.chunks ?? []) as {
    text: string;
    timestamp: [number, number | null];
  }[];
  const words = chunks
    .map((c) => ({
      text: c.text.trim(),
      start: c.timestamp[0],
      end: c.timestamp[1] ?? c.timestamp[0],
    }))
    .filter((w) => w.text.length > 0);
  post({ type: "result", text: (out.text ?? "").trim(), words });
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  try {
    if (e.data.type === "load") await load(e.data.model);
    else if (e.data.type === "transcribe") await transcribe(e.data.audio);
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};
