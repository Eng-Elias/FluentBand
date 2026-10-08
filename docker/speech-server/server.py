"""Minimal OpenAI-style speech server: faster-whisper STT + Piper TTS.

Endpoints:
  POST /v1/audio/transcriptions  (multipart: file, model) -> verbose_json w/ word timestamps
  POST /v1/audio/speech          (json: input, voice, speed) -> audio/wav
"""

import io
import json
import os
import subprocess
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from faster_whisper import WhisperModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None


def model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            os.environ.get("WHISPER_MODEL", "base.en"),
            device="cpu",
            compute_type="int8",
            download_root="/data/models",
        )
    return _model


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model_name: str = Form(default="whisper-1", alias="model")):
    audio = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio)
        path = f.name
    segments, info = model().transcribe(path, word_timestamps=True, language="en")
    words = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text)
        for w in seg.words or []:
            words.append({"word": w.word, "start": w.start, "end": w.end})
    return {"text": "".join(text_parts).strip(), "words": words}


@app.post("/v1/audio/speech")
async def speech(payload: dict):
    text = payload.get("input", "")
    voice = payload.get("voice", "en_US-lessac-medium")
    speed = float(payload.get("speed", 1.0))
    # Map kokoro-style voice names to piper voices loosely.
    if voice.startswith(("af_", "am_")):
        voice = "en_US-lessac-medium"
    elif voice.startswith(("bf_", "bm_")):
        voice = "en_GB-alan-medium"
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out:
        proc = subprocess.run(
            ["piper", "--model", voice, "--output_file", out.name,
             "--length-scale", str(1.0 / max(speed, 0.25))],
            input=text.encode(),
            capture_output=True,
        )
        if proc.returncode != 0:
            return Response(proc.stderr.decode(), status_code=500)
        out.seek(0)
        data = out.read()
    return Response(content=data, media_type="audio/wav")


@app.get("/healthz")
def healthz():
    return {"ok": True}
