import { Command } from "../../types/index.js";
import * as p from "@clack/prompts";
import { getCurrentChatSession } from "../chat.js";
import { primaryColor, successColor } from "../../ui/colors.js";

export const providerCommand: Command = {
  name: "provider",
  description: "Switch between AI providers",
  handler: async (_args: string[]) => {
    const chatSession = getCurrentChatSession();
    if (!chatSession) {
      p.log.error("No active chat session found.");
      return;
    }

    try {
      const availableProviders = chatSession.getAvailableProviders();
      const currentProvider = chatSession.getCurrentProvider();

      const providerChoices = availableProviders.map((provider) => {
        let displayName: string = provider;
        if (provider === "openai-compatible") {
          displayName = "OpenAI Compatible";
        } else if (provider === "openrouter") {
          displayName = "OpenRouter";
        } else if (provider === "ollama") {
          displayName = "Ollama";
        }
        return {
          name: `${displayName}${provider === currentProvider ? " (current)" : ""}`,
          value: provider,
        };
      });

      const selectedProvider = await p.select({
        message: "Select a provider:",
        options: providerChoices.map((choice) => ({
          label: choice.name,
          value: choice.value,
        })),
      });

      if (p.isCancel(selectedProvider)) {
        p.cancel("Operation cancelled");
        return;
      }

      if (selectedProvider !== currentProvider) {
        await chatSession.setProvider(selectedProvider);
        p.log.success(
          successColor(
            `Provider changed to: ${primaryColor(
              selectedProvider
            )}\nCurrent model: ${primaryColor(chatSession.getCurrentModel())}`
          )
        );
        p.log.warning("Chat history cleared");
      } else {
        p.log.info("Provider unchanged.");
      }
    } catch (error) {
      p.log.error(`Error switching provider: ${error}`);
    }
  },
};
