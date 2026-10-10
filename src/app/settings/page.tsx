"use client";

import { useEffect, useState } from "react";
import { getDb, newId, now, SINGLETON_SETTINGS_ID } from "@/core/db/db";
import type { ProviderProfile, Settings } from "@/core/db/types";
import { ensureSingletons, useSettings } from "@/core/settings";
import { getTTS, KOKORO_VOICES } from "@/core/speech/tts";
import { makeSTT } from "@/core/speech/stt";
import {
  MODEL_IDS,
  clearModelCache,
  formatBytes,
  modelCacheInfo,
} from "@/core/speech/modelCache";
import * as llm from "@/core/llm/client";
import type { TestResult } from "@/shared/llm";
import { Button, Card, Input, Select, Badge, Spinner } from "@/components/ui/primitives";
import Link from "next/link";

const PRESETS = [
  { label: "OpenAI", kind: "openai" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", kind: "openai" as const, baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { label: "Anthropic", kind: "anthropic" as const, baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { label: "Ollama (self-host)", kind: "openai" as const, baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
];

export default function SettingsPage() {
  const settings = useSettings();
  const [form, setForm] = useState<ProviderProfile>({
    id: "",
    label: "",
    kind: "openai",
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [msg, setMsg] = useState("");
  const [modelDl, setModelDl] = useState<Record<string, string>>({});
  const [modelStatus, setModelStatus] = useState<
    Partial<Record<"stt" | "tts", { installed: boolean; bytes: number }>>
  >({});

  function modelId(which: "stt" | "tts"): string {
    return which === "tts"
      ? MODEL_IDS.tts
      : MODEL_IDS.stt(settings?.speech.whisperModel ?? "tiny.en");
  }

  async function refreshModelStatus() {
    if (!settings) return;
    if (typeof caches === "undefined") return;
    const next: typeof modelStatus = { stt: undefined, tts: undefined };
    if (settings.speech.sttProvider === "whisper") {
      const info = await modelCacheInfo(modelId("stt"));
      next.stt = { installed: info.hasWeights, bytes: info.bytes };
    }
    if (settings.speech.ttsProvider === "kokoro") {
      const info = await modelCacheInfo(modelId("tts"));
      next.tts = { installed: info.hasWeights, bytes: info.bytes };
    }
    setModelStatus(next);
  }

  useEffect(() => {
    void refreshModelStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.speech.whisperModel, settings?.speech.sttProvider, settings?.speech.ttsProvider]);

  async function downloadModel(which: "stt" | "tts") {
    if (modelDl[which]) return;
    const label = which === "stt" ? "Whisper STT" : "Kokoro TTS";
    const id = modelId(which);

    // Check whether it's already cached first
    setModelDl((s) => ({ ...s, [which]: "Checking…" }));
    const info = await modelCacheInfo(id);
    if (info.hasWeights) {
      const ok = window.confirm(
        `${label} is already downloaded (${formatBytes(info.bytes)}).\n\nDownload it again?`,
      );
      if (!ok) {
        setModelDl((s) => ({ ...s, [which]: `${label} already installed` }));
        setTimeout(() => setModelDl((s) => ({ ...s, [which]: "" })), 4000);
        return;
      }
      await clearModelCache(id);
    } else if (
      !window.confirm(
        `Download the ${label} model now?\n\nIt is stored in this browser's cache for offline use.`,
      )
    ) {
      setModelDl((s) => ({ ...s, [which]: "" }));
      return;
    }

    setModelDl((s) => ({ ...s, [which]: `Starting ${label}…` }));
    try {
      const cfg = settings!.speech;
      const progress = (p: { loaded: number; total: number }) =>
        setModelDl((s) => ({
          ...s,
          [which]:
            p.total > 0
              ? `Downloading ${label}… ${Math.round((p.loaded / p.total) * 100)}%`
              : `Loading ${label}…`,
        }));
      if (which === "stt") await makeSTT(cfg).ensureReady(progress);
      else await getTTS(cfg).ensureReady(progress);
      setModelDl((s) => ({ ...s, [which]: `${label} ready` }));
      void refreshModelStatus();
    } catch (e) {
      setModelDl((s) => ({ ...s, [which]: `${label} failed: ${(e as Error).message}` }));
    }
  }

  useEffect(() => {
    ensureSingletons().catch(() => undefined);
  }, []);

  async function saveProvider() {
    const db = getDb();
    const s = (await db.settings.get(SINGLETON_SETTINGS_ID))!;
    const p: ProviderProfile = { ...form, id: form.id || newId() };
    const providers = s.providers.some((x) => x.id === p.id)
      ? s.providers.map((x) => (x.id === p.id ? p : x))
      : [...s.providers, p];
    await db.settings.update(SINGLETON_SETTINGS_ID, {
      providers,
      activeProviderId: s.activeProviderId ?? p.id,
      updatedAt: now(),
    });
    setForm({ id: "", label: "", kind: "openai", baseUrl: "", model: "", apiKey: "" });
    setMsg("Provider saved");
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await llm.testConnection(
        { kind: form.kind, baseUrl: form.baseUrl, model: form.model },
        { apiKey: form.apiKey },
      );
      setTestResult(res);
    } catch (e) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        error: { code: "upstream_error", message: (e as Error).message },
      });
    } finally {
      setTesting(false);
    }
  }

  async function setActive(id: string) {
    await getDb().settings.update(SINGLETON_SETTINGS_ID, {
      activeProviderId: id,
      updatedAt: now(),
    });
  }

  async function removeProvider(id: string) {
    const db = getDb();
    const s = (await db.settings.get(SINGLETON_SETTINGS_ID))!;
    const providers = s.providers.filter((p) => p.id !== id);
    await db.settings.update(SINGLETON_SETTINGS_ID, {
      providers,
      activeProviderId:
        s.activeProviderId === id ? providers[0]?.id : s.activeProviderId,
      updatedAt: now(),
    });
  }

  async function updateSpeech(patch: Partial<Settings["speech"]>) {
    const db = getDb();
    const s = (await db.settings.get(SINGLETON_SETTINGS_ID))!;
    await db.settings.update(SINGLETON_SETTINGS_ID, {
      speech: { ...s.speech, ...patch },
      updatedAt: now(),
    });
  }

  async function update(patch: Partial<Settings>) {
    await getDb().settings.update(SINGLETON_SETTINGS_ID, {
      ...patch,
      updatedAt: now(),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <h2 className="font-semibold">LLM Providers (BYOK)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your key is stored in this browser only and sent per-request to this
          app&apos;s backend, which relays it to your provider. It is never
          persisted or logged server-side. Prefer a budget-capped key.
        </p>

        {settings?.providers.length ? (
          <ul className="mt-3 space-y-2">
            {settings.providers.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
              >
                <div className="text-sm">
                  <span className="font-medium">{p.label || p.model}</span>{" "}
                  <Badge tone="blue">{p.kind}</Badge>{" "}
                  {settings.activeProviderId === p.id && <Badge tone="green">active</Badge>}
                  <div className="text-xs text-zinc-500">
                    {p.baseUrl} · {p.model}
                  </div>
                </div>
                <div className="flex gap-2">
                  {settings.activeProviderId !== p.id && (
                    <Button size="sm" variant="outline" onClick={() => setActive(p.id)}>
                      Set active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm(p)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeProvider(p.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No providers yet.</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {PRESETS.map((pr) => (
              <Button
                key={pr.label}
                size="sm"
                variant="secondary"
                onClick={() =>
                  setForm({ ...form, ...pr, label: pr.label })
                }
              >
                {pr.label}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Label (e.g. My OpenRouter)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <Select
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as "openai" | "anthropic" })
            }
          >
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic-compatible</option>
          </Select>
          <Input
            placeholder="Base URL (https://...)"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
          <Input
            placeholder="Model (e.g. gpt-4o-mini)"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <Input
            placeholder="API key"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Button onClick={test} disabled={testing || !form.baseUrl || !form.model}>
              {testing ? <Spinner className="mr-2" /> : null}Test connection
            </Button>
            <Button variant="outline" onClick={saveProvider} disabled={!form.baseUrl || !form.model}>
              Save provider
            </Button>
          </div>
          {testResult && (
            <div className="sm:col-span-2 text-sm">
              {testResult.ok ? (
                <Badge tone="green">
                  Connected in {testResult.latencyMs}ms — JSON mode{" "}
                  {testResult.jsonModeReliable ? "reliable" : "unreliable"}
                </Badge>
              ) : (
                <Badge tone="red">
                  {testResult.error?.code}: {testResult.error?.message}
                </Badge>
              )}
            </div>
          )}
          {msg && <div className="sm:col-span-2 text-sm text-green-600">{msg}</div>}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Note: localhost providers (Ollama, LM Studio) only work when the app
          itself runs on your machine with ALLOW_PRIVATE_HOSTS=true — a hosted
          server cannot reach your localhost.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Speech</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Text-to-speech
            <Select
              value={settings?.speech.ttsProvider ?? "kokoro"}
              onChange={(e) =>
                updateSpeech({ ttsProvider: e.target.value as Settings["speech"]["ttsProvider"] })
              }
            >
              <option value="kokoro">Kokoro (in-browser, downloads ~80MB)</option>
              <option value="webspeech">Web Speech API (built-in)</option>
              <option value="local-server">Local speech server</option>
            </Select>
          </label>
          <label className="text-sm">
            Speech-to-text
            <Select
              value={settings?.speech.sttProvider ?? "whisper"}
              onChange={(e) =>
                updateSpeech({ sttProvider: e.target.value as Settings["speech"]["sttProvider"] })
              }
            >
              <option value="whisper">Whisper (in-browser)</option>
              <option value="local-server">Local speech server</option>
            </Select>
          </label>
          <label className="text-sm">
            Whisper model
            <Select
              value={settings?.speech.whisperModel ?? "tiny.en"}
              onChange={(e) =>
                updateSpeech({ whisperModel: e.target.value as "tiny.en" | "base.en" })
              }
            >
              <option value="tiny.en">tiny.en (fast, ~40MB)</option>
              <option value="base.en">base.en (better, ~80MB)</option>
            </Select>
          </label>
          <label className="text-sm">
            Voice
            <Select
              value={settings?.speech.voice ?? "af_heart"}
              onChange={(e) => updateSpeech({ voice: e.target.value })}
            >
              {KOKORO_VOICES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            Speed: {settings?.speech.speed ?? 1}x
            <input
              type="range" min={0.5} max={2} step={0.1}
              value={settings?.speech.speed ?? 1}
              onChange={(e) => updateSpeech({ speed: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="text-sm">
            Local server URL (optional)
            <Input
              placeholder="http://localhost:8788"
              value={settings?.speech.localServerUrl ?? ""}
              onChange={(e) => updateSpeech({ localServerUrl: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm" variant="outline"
              disabled={!settings || settings.speech.sttProvider !== "whisper" || !!modelDl.stt}
              onClick={() => void downloadModel("stt")}
            >
              {modelStatus.stt?.installed ? "Re-download STT model" : "Download STT model now"}
            </Button>
            {modelStatus.stt && (
              <Badge tone={modelStatus.stt.installed ? "green" : "amber"}>
                {modelStatus.stt.installed
                  ? `STT installed (${formatBytes(modelStatus.stt.bytes)})`
                  : "STT not downloaded"}
              </Badge>
            )}
            <Button
              size="sm" variant="outline"
              disabled={!settings || settings.speech.ttsProvider !== "kokoro" || !!modelDl.tts}
              onClick={() => void downloadModel("tts")}
            >
              {modelStatus.tts?.installed ? "Re-download TTS model" : "Download TTS model now"}
            </Button>
            {modelStatus.tts && (
              <Badge tone={modelStatus.tts.installed ? "green" : "amber"}>
                {modelStatus.tts.installed
                  ? `TTS installed (${formatBytes(modelStatus.tts.bytes)})`
                  : "TTS not downloaded"}
              </Badge>
            )}
            {modelDl.stt && <span className="text-xs text-zinc-500">{modelDl.stt}</span>}
            {modelDl.tts && <span className="text-xs text-zinc-500">{modelDl.tts}</span>}
          </div>
          <p className="sm:col-span-2 text-xs text-zinc-500">
            Models download once and are cached by the browser — pre-downloading
            here means no wait on the practice page. Only shown providers are
            downloaded (buttons disabled for Web Speech / local server).
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Study</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Target band
            <Select
              value={String(settings?.targetBand ?? 7)}
              onChange={(e) => update({ targetBand: Number(e.target.value) })}
            >
              {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            Exam date (optional)
            <Input
              type="date"
              value={settings?.examDate ?? ""}
              onChange={(e) => update({ examDate: e.target.value || undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings?.cheaperMode ?? false}
              onChange={(e) => update({ cheaperMode: e.target.checked })}
            />
            Cheaper mode (shorter content, fewer tokens)
          </label>
          <label className="text-sm">
            Theme
            <Select
              value={settings?.theme ?? "system"}
              onChange={(e) =>
                update({ theme: e.target.value as Settings["theme"] })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </label>
          <div className="flex items-end">
            <Link href="/diagnostic">
              <Button size="sm" variant="outline">Take / retake diagnostic</Button>
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Backup</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Move all your progress between browsers/devices with a single file.
        </p>
        <Link href="/settings/backup">
          <Button className="mt-3" variant="outline">Open Backup &amp; Restore</Button>
        </Link>
      </Card>
    </div>
  );
}
