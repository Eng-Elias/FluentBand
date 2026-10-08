import type { OutMsg } from "./whisper.worker";

export interface Transcript {
  text: string;
  words: { text: string; start: number; end: number }[];
}

export interface STTProvider {
  id: string;
  label: string;
  ensureReady(onProgress?: (p: { loaded: number; total: number }) => void): Promise<void>;
  transcribe(audio: Blob | Float32Array): Promise<Transcript>;
}

function isFloat32(a: Blob | Float32Array): a is Float32Array {
  return a instanceof Float32Array;
}

/** Whisper running in a Web Worker via transformers.js. */
export class WhisperSTT implements STTProvider {
  id = "whisper";
  label = "Whisper (in-browser)";
  private worker?: Worker;
  private ready = false;
  private pending?: {
    resolve: (t: Transcript) => void;
    reject: (e: Error) => void;
  };
  private readyWaiter?: { resolve: () => void; reject: (e: Error) => void };
  private model: "tiny.en" | "base.en";

  constructor(model: "tiny.en" | "base.en" = "tiny.en") {
    this.model = model;
  }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent<OutMsg>) => {
      const m = e.data;
      if (m.type === "ready") {
        this.ready = true;
        this.readyWaiter?.resolve();
        this.readyWaiter = undefined;
      } else if (m.type === "result") {
        this.pending?.resolve({ text: m.text, words: m.words });
        this.pending = undefined;
      } else if (m.type === "error") {
        this.pending?.reject(new Error(m.message));
        this.pending = undefined;
        this.readyWaiter?.reject(new Error(m.message));
        this.readyWaiter = undefined;
      } else if (m.type === "progress") {
        this.onProgress?.({ loaded: m.loaded, total: m.total });
      }
    };
  }

  private onProgress?: (p: { loaded: number; total: number }) => void;

  ensureReady(onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    this.onProgress = onProgress;
    this.ensureWorker();
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.readyWaiter = { resolve, reject };
      this.worker!.postMessage({ type: "load", model: this.model });
    });
  }

  async transcribe(audio: Blob | Float32Array): Promise<Transcript> {
    await this.ensureReady();
    let pcm = audio as Float32Array;
    if (!isFloat32(audio)) {
      const { decodeTo16k } = await import("./recorder");
      pcm = await decodeTo16k(audio);
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker!.postMessage({ type: "transcribe", audio: pcm });
    });
  }
}

/** Local faster-whisper server exposing OpenAI-style /v1/audio/transcriptions. */
export class LocalServerSTT implements STTProvider {
  id = "local-server";
  label = "Local speech server";
  constructor(private baseUrl: string) {}
  ensureReady(): Promise<void> {
    return Promise.resolve();
  }
  async transcribe(audio: Blob | Float32Array): Promise<Transcript> {
    let blob = audio as Blob;
    if (isFloat32(audio)) {
      blob = floatToWavBlob(audio, 16000);
    }
    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const res = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Local STT failed (${res.status})`);
    const j = await res.json();
    const words = (j.words ?? []).map(
      (w: { word: string; start: number; end: number }) => ({
        text: w.word.trim(),
        start: w.start,
        end: w.end,
      }),
    );
    return { text: j.text ?? "", words };
  }
}

/** Web Speech API fallback (recognition without timestamps). */
export class WebSpeechSTT implements STTProvider {
  id = "webspeech";
  label = "Web Speech API";
  ensureReady(): Promise<void> {
    return Promise.resolve();
  }
  transcribe(): Promise<Transcript> {
    return Promise.reject(
      new Error("Web Speech STT needs push-to-talk UI; use whisper provider"),
    );
  }
}

export function floatToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export function makeSTT(cfg: {
  sttProvider: string;
  whisperModel: "tiny.en" | "base.en";
  localServerUrl?: string;
}): STTProvider {
  if (cfg.sttProvider === "local-server" && cfg.localServerUrl) {
    return new LocalServerSTT(cfg.localServerUrl);
  }
  return new WhisperSTT(cfg.whisperModel);
}
