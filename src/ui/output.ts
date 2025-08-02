import {
  primaryColor,
  toolColor,
  secondaryColor,
  whiteColor,
  errorColor,
} from "./colors.js";
import type { ToolCall, ToolResult } from "../types/index.js";
import { ollamaConfig } from "../config/index.js";

// Initialize terminal - no modifications needed
export function initializeTerminal(): void {
  // Keep simple for now
}

export function displayWelcome(): void {
  const cwd = process.cwd();

  console.log();
  console.log(
    primaryColor("╭─────────────────────────────────────────────────────────╮")
  );
  console.log(
    primaryColor("│") +
      whiteColor(" ✻ Welcome to nano-coder!                                ") +
      primaryColor("│")
  );
  console.log(
    primaryColor("│                                                         │")
  );
  console.log(
    primaryColor("│") +
      secondaryColor(
        "   /help for help                                        "
      ) +
      primaryColor("│")
  );
  console.log(
    primaryColor("│                                                         │")
  );
  console.log(
    primaryColor("╰─────────────────────────────────────────────────────────╯")
  );
  console.log();
  console.log(secondaryColor(`cwd: ${cwd}`));
  console.log();
  console.log(secondaryColor("Tips for getting started:"));
  console.log();
  console.log(
    secondaryColor("1. Use natural language to describe what you want to build")
  );
  console.log(
    secondaryColor("2. Ask for file analysis, editing, bash commands and more")
  );
  console.log(
    secondaryColor(
      "3. Be as specific as you would with another engineer for best results"
    )
  );
  console.log(secondaryColor("4. ✔ Type '/exit' or press Ctrl+C to quit"));
  console.log();
  console.log(
    secondaryColor("※ Tip: This tool uses Ollama locally for privacy")
  );
  console.log();
}

export function displayAssistantMessage(content: string, model?: string): void {
  console.log();
  console.log(`${primaryColor(model || ollamaConfig.model)}\n${content}`);
  console.log(); // Add spacing after assistant message
}

export function displayToolCall(toolCall: ToolCall, result: ToolResult): void {
  console.log();
  console.log(
    `${toolColor(
      `⚒ ${toolCall.function.name}(${JSON.stringify(
        toolCall.function.arguments
      )})`
    )}`
  );
  console.log(); // Add spacing after tool calls
}

export function displayThinkingIndicator(
  tokenCount: number,
  elapsedSeconds: number,
  maxTokens: number,
  totalTokensUsed: number
): void {
  const contextRemaining = Math.max(
    0,
    Math.round(((maxTokens - totalTokensUsed) / maxTokens) * 100)
  );
  const isLowContext = contextRemaining < 20;
  const contextColor = isLowContext ? errorColor : secondaryColor;
  const warning = isLowContext ? " ⚠ clear context soon" : "";

  process.stdout.write(
    `\r${primaryColor("Working...")} ${secondaryColor(
      `• ${tokenCount} tokens • `
    )}${contextColor(`${contextRemaining}% context left`)}${secondaryColor(
      ` • ${elapsedSeconds}s`
    )}${errorColor(warning)}`
  );
}

export function clearThinkingIndicator(): void {
  process.stdout.write("\r" + " ".repeat(120) + "\r");
}
