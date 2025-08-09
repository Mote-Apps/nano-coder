import * as p from "@clack/prompts";
import { commandRegistry } from "../core/commands.js";
import { getCurrentChatSession } from "../core/chat.js";
import { successColor, errorColor, toolColor, primaryColor, blueColor } from "./colors.js";
import { formatToolCall } from "./tool-formatter.js";
import type { ToolCall } from "../types/index.js";
import { getUserInputWithAutocomplete } from "./input-with-autocomplete.js";
import { promptHistory } from "../core/prompt-history.js";
import { borderedContent } from "./bordered-content.js";

const examplePrompts = [
  'Try "fix typecheck errors"',
  'Try "add dark mode"',
  'Try "optimize performance"',
  'Try "add tests"',
  'Try "refactor this function"',
  'Try "add error handling"',
  'Try "update dependencies"',
  'Try "fix linting issues"',
  'Try "add documentation"',
  'Try "implement authentication"',
  'Try "create API endpoint"',
  'Try "add responsive design"',
  'Try "fix memory leak"',
  'Try "add logging"',
  'Try "improve accessibility"',
  'Try "add validation"',
  'Try "optimize database queries"',
  'Try "add caching"',
  'Try "implement search"',
  'Try "add unit tests"',
];

function getRandomPrompt(): string {
  return (
    examplePrompts[Math.floor(Math.random() * examplePrompts.length)] ||
    'Try "fix typecheck errors"'
  );
}

function getCommandCompletions(input: string): string[] {
  if (!input.startsWith("/")) {
    return [];
  }

  const commandPart = input.slice(1);
  const completions: string[] = [];
  
  // Get built-in command completions
  const builtInCommands = Array.from(commandRegistry.getAll())
    .map((cmd) => cmd.name)
    .filter((name) => name.startsWith(commandPart))
    .map((cmd) => `/${cmd}`);
  completions.push(...builtInCommands);
  
  // Get custom command completions if available
  const chatSession = getCurrentChatSession();
  if (chatSession) {
    const customLoader = chatSession.getCustomCommandLoader();
    const customSuggestions = customLoader.getSuggestions(commandPart);
    completions.push(...customSuggestions.map(cmd => `/${cmd}`));
  }
  
  // Remove duplicates and sort
  return [...new Set(completions)].sort();
}

export async function getUserInput(): Promise<string | null> {
  try {
    // Load history on first use
    if (promptHistory.getHistory().length === 0) {
      await promptHistory.loadHistory();
    }

    // Use autocomplete input for better command discovery
    const userInput = await getUserInputWithAutocomplete();
    
    if (userInput === null) {
      return null;
    }

    let inputValue = userInput.trim();

    // Add to history if it's not empty and not a command
    if (inputValue && !inputValue.startsWith("/")) {
      promptHistory.addPrompt(inputValue);
    }

    return inputValue;
  } catch (error) {
    p.cancel("Goodbye!");
    return null;
  }
}

export async function promptToolApproval(toolCall: ToolCall): Promise<boolean> {
  // Display formatted tool call - use message to avoid extra dots
  const formattedTool = await formatToolCall(toolCall);
  console.log("\n" + formattedTool + "\n");

  const action = await p.select({
    message: "Execute this tool?",
    options: [
      { label: `${successColor("✓ Yes, execute")}`, value: "execute" },
      {
        label: `${errorColor("⨯ No, tell agent what to do differently")}`,
        value: "cancel",
      },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel("Operation cancelled");
    return false;
  }

  return action === "execute";
}
