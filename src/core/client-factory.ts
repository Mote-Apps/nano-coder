import { OllamaClient } from "./ollama-client.js";
import { OpenRouterClient } from "./openrouter-client.js";
import { OpenAICompatibleClient } from "./openai-compatible-client.js";
import { appConfig } from "../config/index.js";
import * as p from "@clack/prompts";
import type { LLMClient, ProviderType } from "../types/index.js";
import { Ollama } from "ollama";

export async function createLLMClient(
  provider: ProviderType = "ollama"
): Promise<LLMClient> {
  // If user explicitly requests a specific provider
  if (provider === "openrouter") {
    return await createOpenRouterClient();
  }
  
  if (provider === "openai-compatible") {
    return await createOpenAICompatibleClient();
  }

  // Default flow: Try Ollama first, fallback to others
  try {
    return await createOllamaClient();
  } catch (ollamaError: any) {
    p.log.warn(`Ollama unavailable: ${ollamaError.message}`);
    
    // Try OpenAI-compatible if configured
    if (appConfig.openAICompatible?.baseUrl) {
      p.log.info("Trying OpenAI-compatible API...");
      try {
        return await createOpenAICompatibleClient();
      } catch (openAIError: any) {
        p.log.warn(`OpenAI-compatible API unavailable: ${openAIError.message}`);
      }
    }
    
    // Finally try OpenRouter
    p.log.info("Falling back to OpenRouter...");
    try {
      return await createOpenRouterClient();
    } catch (openRouterError: any) {
      p.log.error("All providers are unavailable.");
      p.log.error("Please either:");
      p.log.error("1. Install and run Ollama with a model: 'ollama pull qwen3:0.6b'");
      p.log.error("2. Configure OpenRouter in agents.config.json");
      p.log.error("3. Configure an OpenAI-compatible API in agents.config.json");
      process.exit(1);
    }
  }
}

async function createOllamaClient(): Promise<LLMClient> {
  const ollama = new Ollama();
  const models = await ollama.list();

  if (models.models.length === 0) {
    throw new Error("No Ollama models found");
  }

  const client = new OllamaClient();
  await client.waitForInitialization();
  return client;
}

async function createOpenRouterClient(): Promise<LLMClient> {
  if (!appConfig.openRouterApiKey) {
    throw new Error("OpenRouter requires API key in config");
  }
  if (!appConfig.openRouterModels || appConfig.openRouterModels.length === 0) {
    throw new Error("OpenRouter requires models array in config");
  }
  return new OpenRouterClient(
    appConfig.openRouterApiKey,
    appConfig.openRouterModels
  );
}

async function createOpenAICompatibleClient(): Promise<LLMClient> {
  if (!appConfig.openAICompatible?.baseUrl) {
    throw new Error("OpenAI-compatible API requires baseUrl in config");
  }
  return new OpenAICompatibleClient(
    appConfig.openAICompatible.baseUrl,
    appConfig.openAICompatible.apiKey,
    appConfig.openAICompatible.models
  );
}
