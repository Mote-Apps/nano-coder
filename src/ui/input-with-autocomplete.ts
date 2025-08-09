import * as readline from "readline";
import { commandRegistry } from "../core/commands.js";
import { getCurrentChatSession } from "../core/chat.js";
import { primaryColor, secondaryColor, successColor } from "./colors.js";
import * as p from "@clack/prompts";

/**
 * Get all available command completions
 */
function getAllCommandCompletions(): string[] {
  const completions: string[] = [];
  
  // Get built-in commands
  const builtInCommands = Array.from(commandRegistry.getAll())
    .map((cmd) => `/${cmd.name}`);
  completions.push(...builtInCommands);
  
  // Get custom commands if available
  const chatSession = getCurrentChatSession();
  if (chatSession) {
    const customLoader = chatSession.getCustomCommandLoader();
    const customCommands = customLoader.getAllCommands();
    for (const cmd of customCommands) {
      completions.push(`/${cmd.fullName}`);
      // Also add aliases
      if (cmd.metadata.aliases) {
        for (const alias of cmd.metadata.aliases) {
          const fullAlias = cmd.namespace ? `/${cmd.namespace}:${alias}` : `/${alias}`;
          completions.push(fullAlias);
        }
      }
    }
  }
  
  return [...new Set(completions)].sort();
}

/**
 * Completer function for readline
 */
function completer(line: string): [string[], string] {
  if (!line.startsWith("/")) {
    return [[], line];
  }
  
  const allCommands = getAllCommandCompletions();
  const hits = allCommands.filter((cmd) => cmd.startsWith(line));
  
  return [hits, line];
}

/**
 * Get user input with autocomplete support
 */
export async function getUserInputWithAutocomplete(): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: completer,
      terminal: true,
    });
    
    // Display the prompt
    console.log();
    const promptText = primaryColor("What would you like me to help with?");
    console.log(promptText);
    console.log(secondaryColor("💡 Press Tab to autocomplete commands starting with /"));
    
    rl.question("> ", (answer) => {
      rl.close();
      
      const trimmed = answer.trim();
      if (trimmed === "") {
        resolve(null);
      } else {
        resolve(trimmed);
      }
    });
    
    // Handle Ctrl+C
    rl.on("SIGINT", () => {
      rl.close();
      p.cancel("Operation cancelled");
      resolve(null);
    });
  });
}