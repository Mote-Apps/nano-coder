import { Command } from "../../types/index.js";
import inquirer from "inquirer";
import { successColor, errorColor } from "../../ui/colors.js";
import { getCurrentChatSession } from "../chat.js";

export const providerCommand: Command = {
  name: "provider",
  description: "Switch between AI providers",
  handler: async (_args: string[]) => {
    const chatSession = getCurrentChatSession();
    if (!chatSession) {
      console.log(errorColor("No active chat session found."));
      return;
    }

    try {
      const availableProviders = chatSession.getAvailableProviders();
      const currentProvider = chatSession.getCurrentProvider();

      const providerChoices = availableProviders.map((provider) => ({
        name: `${provider}${provider === currentProvider ? " (current)" : ""}`,
        value: provider,
      }));

      console.log();
      const answer = await inquirer.prompt({
        type: "list",
        name: "selectedProvider",
        message: "Select a provider:",
        choices: providerChoices,
        default: currentProvider,
      });
      console.log();

      if (answer.selectedProvider !== currentProvider) {
        await chatSession.setProvider(answer.selectedProvider);
        console.log(
          successColor(`✓ Provider changed to: ${answer.selectedProvider}`)
        );
        console.log(
          successColor(`✓ Current model: ${chatSession.getCurrentModel()}`)
        );
        console.log(successColor("✓ Chat history cleared"));
      } else {
        console.log("Provider unchanged.");
      }
      console.log();
    } catch (error) {
      console.log(errorColor(`Error switching provider: ${error}`));
    }
    console.log();
  },
};
