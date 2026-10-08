/**
 * Kokoro TTS worker — kokoro-js, WASM backend. Lazy-loaded in worker.
 */

type LoadMsg = { type: "load" };
type SpeakMsg = { type: "speak"; id: number; text: string; voice: string; speed: number };
type VoicesMsg = { type: "voices" };
type InMsg = LoadMsg | SpeakMsg | VoicesMsg;

export type OutMsg =
  | { type: "progress"; loaded: number; total: number; file?: string }
  | { type: "ready" }
  | { type: "audio"; id: number; wav: ArrayBuffer }
  | { type: "voices"; voices: string[] }
  | { type: "error"; id?: number; message: string };

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tts: any;

function post(m: OutMsg, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(m, transfer ?? []);
}

async function load() {
  const { KokoroTTS } = await import("kokoro-js");
  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: {
      status?: string;
      loaded?: number;
      total?: number;
      file?: string;
    }) => {
      if (p.status === "progress") {
        post({ type: "progress", loaded: p.loaded ?? 0, total: p.total ?? 0, file: p.file });
      }
    },
  });
  post({ type: "ready" });
}

async function speak(id: number, text: string, voice: string, speed: number) {
  if (!tts) throw new Error("Model not loaded");
  const audio = await tts.generate(text, { voice, speed });
  const wav: ArrayBuffer = audio.toWav();
  post({ type: "audio", id, wav }, [wav]);
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  try {
    const d = e.data;
    if (d.type === "load") await load();
    else if (d.type === "speak") await speak(d.id, d.text, d.voice, d.speed);
    else if (d.type === "voices") {
      const v = tts?.voices ? Object.keys(tts.voices) : [];
      post({ type: "voices", voices: v });
    }
  } catch (err) {
    const d = e.data;
    post({ type: "error", id: d.type === "speak" ? d.id : undefined, message: (err as Error).message });
  }
};
