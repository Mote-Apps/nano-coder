import { OllamaClient } from "./ollama-client.js";
import { OpenRouterClient } from "./openrouter-client.js";
import { appConfig } from "../config/index.js";
import type { LLMClient, ProviderType } from "../types/index.js";
import { Ollama } from "ollama";

export async function createLLMClient(provider: ProviderType = "ollama"): Promise<LLMClient> {
  switch (provider) {
    case "openrouter":
      if (!appConfig.openRouterApiKey) {
        throw new Error("OpenRouter requires API key in config");
      }
      if (!appConfig.openRouterModels || appConfig.openRouterModels.length === 0) {
        throw new Error("OpenRouter requires models array in config");
      }
      return new OpenRouterClient(appConfig.openRouterApiKey, appConfig.openRouterModels);
    case "ollama":
    default:
      // Validate Ollama is installed and has models
      try {
        const ollama = new Ollama();
        const models = await ollama.list();
        
        if (models.models.length === 0) {
          throw new Error("No Ollama models found. Please install a model first using 'ollama pull <model>'");
        }
        
        return new OllamaClient();
      } catch (error: any) {
        if (error.message.includes("No Ollama models found")) {
          throw error;
        }
        throw new Error("Ollama is not running or not accessible. Please make sure Ollama is installed and running");
      }
  }
}