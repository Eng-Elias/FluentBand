"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  defaultProfile,
  defaultSettings,
  getDb,
  SINGLETON_PROFILE_ID,
  SINGLETON_SETTINGS_ID,
} from "./db/db";
import type { Profile, ProviderProfile, Settings } from "./db/types";
import type { ProviderConfig } from "@/shared/llm";

export function useSettings(): Settings | undefined {
  return useLiveQuery(
    () => getDb().settings.get(SINGLETON_SETTINGS_ID),
    [],
  );
}

export function useProfile(): Profile | undefined {
  return useLiveQuery(() => getDb().profile.get(SINGLETON_PROFILE_ID), []);
}

export async function ensureSingletons(): Promise<{
  settings: Settings;
  profile: Profile;
}> {
  const db = getDb();
  let settings = await db.settings.get(SINGLETON_SETTINGS_ID);
  if (!settings) {
    settings = defaultSettings();
    await db.settings.put(settings);
  }
  let profile = await db.profile.get(SINGLETON_PROFILE_ID);
  if (!profile) {
    profile = defaultProfile();
    await db.profile.put(profile);
  }
  return { settings, profile };
}

export function activeProvider(s?: Settings): ProviderProfile | undefined {
  if (!s) return undefined;
  return s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0];
}

export function toProviderConfig(p: ProviderProfile): ProviderConfig {
  return {
    kind: p.kind,
    baseUrl: p.baseUrl,
    model: p.model,
    extraHeaders: p.extraHeaders,
  };
}

export class NoProviderError extends Error {
  constructor() {
    super("No LLM provider configured — go to Settings");
    this.name = "NoProviderError";
  }
}

/** Get active provider + key, or throw NoProviderError. */
export function requireProvider(s?: Settings): {
  provider: ProviderConfig;
  apiKey: string;
  profile: ProviderProfile;
} {
  const p = activeProvider(s);
  if (!p || !p.apiKey) throw new NoProviderError();
  return { provider: toProviderConfig(p), apiKey: p.apiKey, profile: p };
}
