import type { AppConfig, Colors } from "../types/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Function to load app configuration from agents.config.json if it exists
function loadAppConfig(): AppConfig {
  const agentsJsonPath = join(process.cwd(), "agents.config.json");

  if (existsSync(agentsJsonPath)) {
    try {
      const agentsData = JSON.parse(readFileSync(agentsJsonPath, "utf-8"));

      if (agentsData.nanocoder) {
        return {
          openRouterApiKey: agentsData.nanocoder.openRouterApiKey,
          openRouterModels: agentsData.nanocoder.openRouterModels,
        };
      }
    } catch (error) {
      console.warn(
        "Failed to parse agents.config.json:",
        error
      );
    }
  }

  return {};
}

export const appConfig = loadAppConfig();

// Legacy exports for backwards compatibility
export const ollamaConfig = {
  model: "qwen3:0.6b",
  maxTokens: 4096,
  contextSize: 4000,
};

export const colors: Colors = {
  white: "#ffffff",
  primary: "#CAAD8D",
  tool: "#0d9488",
  success: "#00d492",
  error: "#ff6467",
  secondary: "#9ca3af",
  blue: "#8ec6ff",
};

export const promptPath = "./src/prompt.md";
