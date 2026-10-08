FROM python:3.12-slim

RUN pip install --no-cache-dir \
    fastapi "uvicorn[standard]" faster-whisper piper-tts \
    python-multipart

WORKDIR /app
COPY server.py /app/server.py

ENV WHISPER_MODEL=base.en
ENV CORS_ORIGINS=http://localhost:3000

EXPOSE 8788
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8788"]
