import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ProviderType } from "../types/index.js";
import { shouldLog } from "./logging.js";

interface UserPreferences {
  lastProvider?: ProviderType;
  lastModel?: string;
  providerModels?: {
    [key in ProviderType]?: string;
  };
}

const PREFERENCES_PATH = join(homedir(), ".nanocoder-preferences.json");

export function loadPreferences(): UserPreferences {
  if (existsSync(PREFERENCES_PATH)) {
    try {
      const data = readFileSync(PREFERENCES_PATH, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (shouldLog("warn")) {
        console.warn("Failed to load preferences:", error);
      }
    }
  }
  return {};
}

export function savePreferences(preferences: UserPreferences): void {
  try {
    writeFileSync(PREFERENCES_PATH, JSON.stringify(preferences, null, 2));
  } catch (error) {
    if (shouldLog("warn")) {
      console.warn("Failed to save preferences:", error);
    }
  }
}

export function updateLastUsed(provider: ProviderType, model: string): void {
  const preferences = loadPreferences();
  preferences.lastProvider = provider;
  preferences.lastModel = model;
  
  // Also save the model for this specific provider
  if (!preferences.providerModels) {
    preferences.providerModels = {};
  }
  preferences.providerModels[provider] = model;
  
  savePreferences(preferences);
}

export function getLastUsedModel(provider: ProviderType): string | undefined {
  const preferences = loadPreferences();
  return preferences.providerModels?.[provider];
}