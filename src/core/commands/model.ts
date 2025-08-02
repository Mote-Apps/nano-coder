import { Command } from "../../types/index.js";
import inquirer from "inquirer";
import { successColor, errorColor } from "../../ui/colors.js";
import { getCurrentChatSession } from "../chat.js";

export const modelCommand: Command = {
  name: "model",
  description: "Select the current model",
  handler: async (args: string[]) => {
    const chatSession = getCurrentChatSession();
    if (!chatSession) {
      console.log(errorColor("No active chat session found."));
      return;
    }

    try {
      // Get list of available models from the current client
      const availableModels = await chatSession.getAvailableModels();

      if (availableModels.length === 0) {
        console.log(
          errorColor("No models available. Please check your configuration.")
        );
        return;
      }

      const currentModel = chatSession.getCurrentModel();
      const modelChoices = availableModels.map((model) => ({
        name: `${model}${model === currentModel ? " (current)" : ""}`,
        value: model,
      }));

      console.log();
      const answer = await inquirer.prompt({
        type: "list",
        name: "selectedModel",
        message: "Select a model:",
        choices: modelChoices,
        default: currentModel,
      });
      console.log();

      if (answer.selectedModel !== currentModel) {
        chatSession.setModel(answer.selectedModel);
        console.log(
          successColor(`✓ Model changed to: ${answer.selectedModel}`)
        );
      } else {
        console.log("Model unchanged.");
      }
      console.log();
    } catch (error) {
      console.log(errorColor(`Error accessing models: ${error}`));
      console.log("Make sure your provider is properly configured.");
    }
  },
};
