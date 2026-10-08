import type { OutMsg } from "./kokoro.worker";

export interface TTSProvider {
  id: string;
  label: string;
  ensureReady(onProgress?: (p: { loaded: number; total: number }) => void): Promise<void>;
  speak(text: string, opts?: { voice?: string; speed?: number }): Promise<Blob>;
  voices(): string[];
}

export const KOKORO_VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah",
  "am_michael", "am_adam",
  "bf_emma", "bf_isabella",
  "bm_george", "bm_lewis",
] as const;

/** Kokoro-82M in a Web Worker. */
export class KokoroTTSProvider implements TTSProvider {
  id = "kokoro";
  label = "Kokoro (in-browser)";
  private worker?: Worker;
  private ready = false;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (b: Blob) => void; reject: (e: Error) => void }
  >();
  private readyWaiter?: { resolve: () => void; reject: (e: Error) => void };
  private onProgress?: (p: { loaded: number; total: number }) => void;

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent<OutMsg>) => {
      const m = e.data;
      if (m.type === "ready") {
        this.ready = true;
        this.readyWaiter?.resolve();
        this.readyWaiter = undefined;
      } else if (m.type === "audio") {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        p?.resolve(new Blob([m.wav], { type: "audio/wav" }));
      } else if (m.type === "error") {
        if (m.id !== undefined) {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          p?.reject(new Error(m.message));
        } else {
          this.readyWaiter?.reject(new Error(m.message));
          this.readyWaiter = undefined;
        }
      } else if (m.type === "progress") {
        this.onProgress?.({ loaded: m.loaded, total: m.total });
      }
    };
  }

  ensureReady(onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    this.onProgress = onProgress;
    this.ensureWorker();
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.readyWaiter = { resolve, reject };
      this.worker!.postMessage({ type: "load" });
    });
  }

  async speak(text: string, opts?: { voice?: string; speed?: number }): Promise<Blob> {
    await this.ensureReady();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({
        type: "speak",
        id,
        text,
        voice: opts?.voice ?? "af_heart",
        speed: opts?.speed ?? 1,
      });
    });
  }

  voices(): string[] {
    return [...KOKORO_VOICES];
  }
}

/** Web Speech API fallback (speechSynthesis). */
export class WebSpeechTTS implements TTSProvider {
  id = "webspeech";
  label = "Web Speech API";
  ensureReady(): Promise<void> {
    return Promise.resolve();
  }
  speak(text: string, opts?: { speed?: number }): Promise<Blob> {
    // speechSynthesis can't produce a Blob; play directly and resolve an
    // empty blob so callers can still use it via `speakAndPlay`.
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts?.speed ?? 1;
      u.lang = "en-GB";
      u.onend = () => resolve(new Blob([]));
      u.onerror = (e) => reject(new Error(e.error));
      speechSynthesis.speak(u);
    });
  }
  voices(): string[] {
    return speechSynthesis.getVoices().map((v) => v.name);
  }
}

/** Local TTS server exposing OpenAI-style /v1/audio/speech. */
export class LocalServerTTS implements TTSProvider {
  id = "local-server";
  label = "Local speech server";
  constructor(private baseUrl: string) {}
  ensureReady(): Promise<void> {
    return Promise.resolve();
  }
  async speak(text: string, opts?: { voice?: string; speed?: number }): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: text,
        voice: opts?.voice ?? "af_heart",
        speed: opts?.speed ?? 1,
        response_format: "wav",
      }),
    });
    if (!res.ok) throw new Error(`Local TTS failed (${res.status})`);
    return res.blob();
  }
  voices(): string[] {
    return [...KOKORO_VOICES];
  }
}

export function makeTTS(cfg: {
  ttsProvider: string;
  localServerUrl?: string;
}): TTSProvider {
  if (cfg.ttsProvider === "webspeech") return new WebSpeechTTS();
  if (cfg.ttsProvider === "local-server" && cfg.localServerUrl) {
    return new LocalServerTTS(cfg.localServerUrl);
  }
  return new KokoroTTSProvider();
}

/** Play an audio blob; resolves when playback ends. */
export function playBlob(blob: Blob): Promise<void> {
  if (blob.size === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch(reject);
  });
}
