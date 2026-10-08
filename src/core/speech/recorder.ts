/** MediaRecorder wrapper — browser only. */

export class Recorder {
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : undefined;
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  async stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec) throw new Error("Recorder not started");
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.rec = undefined;
    return new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
  }

  cancel(): void {
    try {
      this.rec?.stop();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.rec = undefined;
    this.chunks = [];
  }
}

/** Decode an audio Blob to 16kHz mono Float32Array for Whisper. */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buf = await blob.arrayBuffer();
  // Decode in a real AudioContext (OfflineAudioContext decodeAudioData
  // is unreliable in some browsers).
  const AC = window.AudioContext;
  const ac = new AC();
  try {
    const audio = await ac.decodeAudioData(buf.slice(0));
    void ctx;
    // resample to 16k mono
    const targetLen = Math.ceil(audio.duration * 16000);
    const offline = new OfflineAudioContext(1, targetLen, 16000);
    const src = offline.createBufferSource();
    src.buffer = audio;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await ac.close().catch(() => undefined);
  }
}
